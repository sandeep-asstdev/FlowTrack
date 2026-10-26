import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto, InviteMemberDto } from '@flowtrack/shared';
import { Role } from '@prisma/client';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async listUserWorkspaces(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: {
              select: {
                projects: { where: { deletedAt: null } },
                memberships: true,
              },
            },
          },
        },
      },
    });

    return memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
      projectCount: m.workspace._count.projects,
      memberCount: m.workspace._count.memberships,
    }));
  }

  async getWorkspace(workspaceId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this workspace');
    }

    return {
      ...membership.workspace,
      role: membership.role,
    };
  }

  async createWorkspace(userId: string, dto: CreateWorkspaceDto) {
    const slug = dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);

    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        slug,
        logoUrl: dto.logoUrl,
        themeSettings: dto.themeSettings || {},
        memberships: {
          create: {
            userId,
            role: Role.ADMIN,
          },
        },
      },
    });

    // Create default status set for new workspace
    const statusSet = await this.prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: 'Default Status Set',
        isDefault: true,
        statuses: {
          create: [
            { key: 'not_started', labelI18n: { en: 'Not Started', hi: 'शुरू नहीं हुआ', kn: 'ಪ್ರಾರಂಭವಾಗಿಲ್ಲ' }, colour: '#94a3b8', icon: 'Circle', category: 'not_started', displayOrder: 0 },
            { key: 'in_progress', labelI18n: { en: 'In Progress', hi: 'प्रगति पर है', kn: 'ಪ್ರಗತಿಯಲ್ಲಿದೆ' }, colour: '#3b82f6', icon: 'Clock', category: 'active', displayOrder: 1 },
            { key: 'waiting', labelI18n: { en: 'Waiting', hi: 'अटका हुआ', kn: 'ಕಾಯುತ್ತಿದೆ' }, colour: '#f59e0b', icon: 'AlertTriangle', category: 'blocked', displayOrder: 2 },
            { key: 'done', labelI18n: { en: 'Done', hi: 'पूर्ण हुआ', kn: 'ಪೂರ್ಣಗೊಂಡಿದೆ' }, colour: '#10b981', icon: 'CheckCircle2', category: 'done', displayOrder: 3 },
            { key: 'cancelled', labelI18n: { en: 'Cancelled', hi: 'रद्द', kn: 'ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ' }, colour: '#ef4444', icon: 'XCircle', category: 'cancelled', displayOrder: 4 },
          ],
        },
      },
    });

    // Create default node types
    const types = [
      { key: 'task', name: 'Task', icon: 'CheckSquare', colour: '#3b82f6', isGroup: false },
      { key: 'stage', name: 'Stage / Group', icon: 'Layers', colour: '#8b5cf6', isGroup: true },
      { key: 'approval', name: 'Approval Gate', icon: 'ShieldCheck', colour: '#10b981', isGroup: false },
      { key: 'doc_request', name: 'Document Request', icon: 'FileText', colour: '#f59e0b', isGroup: false },
      { key: 'milestone', name: 'Milestone', icon: 'Flag', colour: '#ec4899', isGroup: false },
      { key: 'note', name: 'Note', icon: 'StickyNote', colour: '#64748b', isGroup: false },
    ];

    for (const t of types) {
      await this.prisma.nodeType.create({
        data: {
          workspaceId: workspace.id,
          key: t.key,
          name: t.name,
          icon: t.icon,
          colour: t.colour,
          isGroup: t.isGroup,
          isSystem: true,
          defaultStatusSetId: statusSet.id,
        },
      });
    }

    return workspace;
  }

  async updateWorkspace(workspaceId: string, userId: string, dto: UpdateWorkspaceDto) {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

    if (!membership || membership.role !== Role.ADMIN) {
      throw new ForbiddenException('Only workspace administrators can update settings');
    }

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.themeSettings && { themeSettings: dto.themeSettings }),
      },
    });
  }

  async listMembers(workspaceId: string) {
    return this.prisma.membership.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            phone: true,
            isActive: true,
          },
        },
      },
    });
  }

  async inviteMember(workspaceId: string, inviterUserId: string, dto: InviteMemberDto) {
    const inviterMembership = await this.prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: inviterUserId,
        },
      },
    });

    if (!inviterMembership || (inviterMembership.role !== Role.ADMIN && inviterMembership.role !== Role.MANAGER)) {
      throw new ForbiddenException('Unauthorized: Only workspace Admins or Managers can invite members or alter roles.');
    }

    // Role Escalation Protection: Only an ADMIN can assign or elevate to the ADMIN role
    if (dto.role === Role.ADMIN && inviterMembership.role !== Role.ADMIN) {
      throw new ForbiddenException('Unauthorized: Only Admins can grant the Admin role.');
    }

    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (user && user.id === inviterUserId) {
      throw new ForbiddenException('Self-promotion or altering your own role is not permitted.');
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          fullName: dto.email.split('@')[0],
        },
      });
    }

    const membership = await this.prisma.membership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
      update: {
        role: dto.role as Role,
      },
      create: {
        workspaceId,
        userId: user.id,
        role: dto.role as Role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            phone: true,
            isActive: true,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        entityName: 'Membership',
        entityId: membership.id,
        actorId: inviterUserId,
        action: 'MEMBER_INVITED',
        newValues: { targetUserId: user.id, email: user.email, role: dto.role },
      },
    }).catch(() => null);

    return membership;
  }

  async updateMemberRole(workspaceId: string, actorUserId: string, targetUserId: string, newRole: Role) {
    const actorMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    });

    if (!actorMembership || actorMembership.role !== Role.ADMIN) {
      throw new ForbiddenException('Unauthorized: Only workspace Admins can assign or change roles.');
    }

    if (actorUserId === targetUserId) {
      throw new ForbiddenException('Self-promotion or altering your own role is not permitted.');
    }

    const targetMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });

    if (!targetMembership) {
      throw new NotFoundException('Target user is not a member of this workspace.');
    }

    // Protection: Prevent demoting the last active Platform Admin
    if (targetMembership.role === Role.ADMIN && newRole !== Role.ADMIN) {
      const activeAdminCount = await this.prisma.membership.count({
        where: {
          workspaceId,
          role: Role.ADMIN,
          user: { isActive: true, deletedAt: null },
        },
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException('Cannot demote the last active Platform Admin in this workspace.');
      }
    }

    const updated = await this.prisma.membership.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role: newRole },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            phone: true,
            isActive: true,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        entityName: 'Membership',
        entityId: updated.id,
        actorId: actorUserId,
        action: 'ROLE_CHANGE',
        oldValues: { role: targetMembership.role },
        newValues: { role: newRole, targetUserId },
      },
    }).catch(() => null);

    return updated;
  }

  async updateUserStatus(workspaceId: string, actorUserId: string, targetUserId: string, isActive: boolean) {
    const actorMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    });

    if (!actorMembership || actorMembership.role !== Role.ADMIN) {
      throw new ForbiddenException('Unauthorized: Only workspace Admins can activate or deactivate users.');
    }

    if (actorUserId === targetUserId && !isActive) {
      throw new BadRequestException('Cannot deactivate your own account.');
    }

    // Protection: Prevent deactivating the last active Platform Admin
    if (!isActive) {
      const targetMembership = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      });
      if (targetMembership?.role === Role.ADMIN) {
        const activeAdminCount = await this.prisma.membership.count({
          where: {
            workspaceId,
            role: Role.ADMIN,
            user: { isActive: true, deletedAt: null },
          },
        });
        if (activeAdminCount <= 1) {
          throw new BadRequestException('Cannot deactivate the last active Platform Admin in this workspace.');
        }
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        avatarUrl: true,
        locale: true,
        isActive: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        entityName: 'User',
        entityId: targetUserId,
        actorId: actorUserId,
        action: isActive ? 'USER_ACTIVATION' : 'USER_DEACTIVATION',
        newValues: { isActive },
      },
    }).catch(() => null);

    return updated;
  }

  async removeMember(workspaceId: string, actorUserId: string, targetUserId: string) {
    const actorMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    });

    if (!actorMembership || actorMembership.role !== Role.ADMIN) {
      throw new ForbiddenException('Unauthorized: Only workspace Admins can remove members.');
    }

    if (actorUserId === targetUserId) {
      throw new BadRequestException('Cannot remove yourself from the workspace.');
    }

    const targetMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });

    if (!targetMembership) {
      throw new NotFoundException('Member not found in workspace.');
    }

    if (targetMembership.role === Role.ADMIN) {
      const activeAdminCount = await this.prisma.membership.count({
        where: {
          workspaceId,
          role: Role.ADMIN,
          user: { isActive: true, deletedAt: null },
        },
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException('Cannot remove the last active Platform Admin in this workspace.');
      }
    }

    await this.prisma.membership.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        entityName: 'Membership',
        entityId: targetMembership.id,
        actorId: actorUserId,
        action: 'MEMBER_REMOVED',
        oldValues: { targetUserId, role: targetMembership.role },
      },
    }).catch(() => null);

    return { success: true };
  }
}
