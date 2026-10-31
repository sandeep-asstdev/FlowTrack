import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

export interface GetPlatformUsersOptions {
  search?: string;
  role?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface GetPlatformAuditsOptions {
  action?: string;
  actorId?: string;
  outcome?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch all registered users across the entire platform with their memberships and statuses.
   */
  async getPlatformUsers(options: GetPlatformUsersOptions = {}) {
    const limit = options.limit ? Math.min(options.limit, 100) : 50;
    const offset = options.offset || 0;

    const where: any = {
      deletedAt: null,
    };

    if (options.search) {
      const q = options.search.trim().toLowerCase();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }

    if (options.status === 'active') {
      where.isActive = true;
    } else if (options.status === 'deactivated') {
      where.isActive = false;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          avatarUrl: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
          updatedAt: true,
          memberships: {
            select: {
              id: true,
              workspaceId: true,
              role: true,
              workspace: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Format output with primary role determination
    const items = users.map((u) => {
      // Determine highest role across memberships
      let primaryRole: Role = Role.MEMBER;
      const roles = u.memberships.map((m) => m.role);
      if (roles.includes(Role.ADMIN)) primaryRole = Role.ADMIN;
      else if (roles.includes(Role.MANAGER)) primaryRole = Role.MANAGER;
      else if (roles.includes(Role.TEAM_LEAD)) primaryRole = Role.TEAM_LEAD;
      else if (roles.includes(Role.GUEST)) primaryRole = Role.GUEST;

      return {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        avatarUrl: u.avatarUrl,
        isActive: u.isActive,
        emailVerified: u.emailVerified,
        phoneVerified: u.phoneVerified,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        role: primaryRole,
        workspaces: u.memberships.map((m) => ({
          workspaceId: m.workspaceId,
          workspaceName: m.workspace?.name || 'Workspace',
          role: m.role,
        })),
        // Shape as WorkspaceMember for seamless UI consumption
        workspaceMemberShape: {
          id: u.memberships[0]?.id || `pm-${u.id}`,
          workspaceId: u.memberships[0]?.workspaceId || 'platform',
          userId: u.id,
          role: primaryRole,
          createdAt: u.createdAt.toISOString(),
          user: {
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            phone: u.phone || undefined,
            avatarUrl: u.avatarUrl || undefined,
            isActive: u.isActive,
          },
        },
      };
    });

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * Fetch system-wide audit history across all workspaces.
   */
  async getPlatformAudits(options: GetPlatformAuditsOptions = {}) {
    const limit = options.limit ? Math.min(options.limit, 100) : 50;
    const offset = options.offset || 0;

    const where: any = {};

    if (options.action && options.action !== 'ALL') {
      where.action = options.action;
    }

    if (options.actorId) {
      where.actorId = options.actorId;
    }

    if (options.outcome) {
      where.outcome = options.outcome;
    }

    const [events, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    // Format events for UI consumption
    const items = events.map((ev) => ({
      id: ev.id,
      action: ev.action,
      targetType: ev.targetType,
      targetId: ev.targetId,
      timestamp: ev.timestamp,
      outcome: ev.outcome,
      reason: ev.reason,
      beforeValues: ev.beforeValues,
      afterValues: ev.afterValues,
      workspaceId: ev.workspaceId,
      workspaceName: ev.workspace?.name || 'Global',
      actor: {
        id: ev.actor?.id || ev.actorId,
        email: ev.actor?.email || 'system@flowtrack.dev',
        fullName: ev.actor?.fullName || 'System',
        avatarUrl: ev.actor?.avatarUrl || null,
      },
    }));

    return {
      items,
      logs: items, // alias for UI compatibility
      total,
      limit,
      offset,
    };
  }

  /**
   * Return high-level platform statistics.
   */
  async getPlatformStats() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers, totalWorkspaces, totalProjects, recentSignups, totalAudits] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.workspace.count({ where: { deletedAt: null } }),
        this.prisma.project.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo }, deletedAt: null } }),
        this.prisma.auditEvent.count(),
      ]);

    const deactivatedUsers = totalUsers - activeUsers;

    // Count by primary role
    const adminMemberships = await this.prisma.membership.findMany({
      where: { role: Role.ADMIN },
      select: { userId: true },
      distinct: ['userId'],
    });

    return {
      totalUsers,
      activeUsers,
      deactivatedUsers,
      adminCount: adminMemberships.length,
      memberCount: Math.max(0, totalUsers - adminMemberships.length),
      totalWorkspaces,
      totalProjects,
      recentSignups,
      totalAudits,
    };
  }

  /**
   * Update active status for any user.
   */
  async updateUserStatus(targetUserId: string, isActive: boolean, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${targetUserId} not found.`);
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: { id: true, email: true, fullName: true, isActive: true },
    });

    // Append audit event
    const defaultWs = await this.prisma.workspace.findFirst();
    if (defaultWs) {
      await this.prisma.auditEvent.create({
        data: {
          workspaceId: defaultWs.id,
          actorId,
          action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          targetType: 'User',
          targetId: targetUserId,
          beforeValues: { isActive: user.isActive },
          afterValues: { isActive },
          outcome: 'SUCCESS',
        },
      });
    }

    return updated;
  }

  /**
   * Check if a user has admin membership anywhere.
   */
  async hasAdminAccess(userId: string): Promise<boolean> {
    const adminMembership = await this.prisma.membership.findFirst({
      where: {
        userId,
        role: Role.ADMIN,
      },
    });
    return Boolean(adminMembership);
  }

  /**
   * Update role for any user platform-wide or across their memberships.
   */
  async updateUserRole(targetUserId: string, newRole: Role, actorId: string, workspaceId?: string) {
    if (targetUserId === actorId) {
      throw new ForbiddenException('Self-promotion or altering your own role is not permitted.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        memberships: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${targetUserId} not found.`);
    }

    // Protection: Prevent demoting the last active Platform Admin
    if (newRole !== Role.ADMIN) {
      const isTargetAdmin = user.memberships?.some((m) => m.role === Role.ADMIN);
      if (isTargetAdmin) {
        const totalActiveAdmins = await this.prisma.membership.count({
          where: {
            role: Role.ADMIN,
            user: { isActive: true, deletedAt: null },
          },
        });
        if (totalActiveAdmins <= 1) {
          throw new BadRequestException('Cannot demote the last active Platform Admin on the platform.');
        }
      }
    }

    // If specific workspaceId is provided and valid, update in that workspace
    if (workspaceId && workspaceId !== 'platform') {
      await this.prisma.membership.upsert({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
        update: { role: newRole },
        create: { workspaceId, userId: targetUserId, role: newRole },
      });
    } else {
      // Platform-wide update: update all existing memberships for this user
      if (user.memberships && user.memberships.length > 0) {
        await this.prisma.membership.updateMany({
          where: { userId: targetUserId },
          data: { role: newRole },
        });
      }

      // Also ensure primary organization workspace has this role
      const primaryWs = await this.prisma.workspace.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (primaryWs) {
        await this.prisma.membership.upsert({
          where: { workspaceId_userId: { workspaceId: primaryWs.id, userId: targetUserId } },
          update: { role: newRole },
          create: { workspaceId: primaryWs.id, userId: targetUserId, role: newRole },
        });
      }
    }

    // Append audit event
    const auditWs =
      workspaceId && workspaceId !== 'platform'
        ? workspaceId
        : (user.memberships?.[0]?.workspaceId || (await this.prisma.workspace.findFirst())?.id || 'system');

    if (this.prisma.auditEvent?.create) {
      await this.prisma.auditEvent.create({
        data: {
          workspaceId: auditWs,
          actorId,
          action: 'USER_ROLE_UPDATED',
          targetType: 'User',
          targetId: targetUserId,
          beforeValues: { role: user.memberships?.[0]?.role || Role.MEMBER },
          afterValues: { role: newRole },
          outcome: 'SUCCESS',
        },
      }).catch(() => null);
    }

    return {
      success: true,
      userId: targetUserId,
      newRole,
    };
  }
}

