import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeamDto, UpdateTeamDto, AddTeamMemberDto } from '@flowtrack/shared';
import { Role } from '@prisma/client';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActorPermission(
    workspaceId: string,
    actorId: string,
    requiredRoles: Role[],
    teamId?: string
  ) {
    const actorMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorId } },
    });

    if (!actorMembership || !requiredRoles.includes(actorMembership.role)) {
      throw new ForbiddenException(
        `Unauthorized: Action requires one of the following roles: ${requiredRoles.join(', ')}`
      );
    }

    if (actorMembership.role === Role.TEAM_LEAD) {
      if (!teamId) {
        throw new ForbiddenException('Forbidden: Team Leads cannot perform team-wide administrative operations.');
      }
      const isLead = await this.prisma.teamMember.findFirst({
        where: { teamId, userId: actorId, role: 'lead' },
      });
      if (!isLead) {
        throw new ForbiddenException('Forbidden: Team Leads can only manage teams they lead.');
      }
    }

    return actorMembership;
  }

  async listTeams(workspaceId: string) {
    const teams = await this.prisma.team.findMany({
      where: { workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
                isActive: true,
              },
            },
          },
        },
        _count: {
          select: {
            nodes: { where: { deletedAt: null } },
            members: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return teams.map((t) => ({
      ...t,
      taskCount: t._count.nodes,
      memberCount: t._count.members,
    }));
  }

  async getTeam(teamId: string, workspaceId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
                isActive: true,
              },
            },
          },
        },
        _count: {
          select: {
            nodes: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return {
      ...team,
      taskCount: team._count.nodes,
    };
  }

  async createTeam(workspaceId: string, actorId: string, dto: CreateTeamDto) {
    await this.verifyActorPermission(workspaceId, actorId, [
      Role.ADMIN,
      Role.MANAGER,
    ]);

    const existing = await this.prisma.team.findUnique({
      where: { workspaceId_name: { workspaceId, name: dto.name.trim() } },
    });

    if (existing) {
      throw new ConflictException('A team with this name already exists in this workspace');
    }

    const team = await this.prisma.team.create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description || null,
        colour: dto.colour || '#3b82f6',
      },
      include: {
        members: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        entityName: 'Team',
        entityId: team.id,
        actorId,
        action: 'TEAM_CREATED',
        newValues: { name: team.name, description: team.description },
      },
    }).catch(() => null);

    return team;
  }

  async updateTeam(teamId: string, workspaceId: string, actorId: string, dto: UpdateTeamDto) {
    await this.verifyActorPermission(
      workspaceId,
      actorId,
      [Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD],
      teamId
    );

    const existing = await this.getTeam(teamId, workspaceId);

    if (dto.name && dto.name.trim() !== existing.name) {
      const duplicate = await this.prisma.team.findUnique({
        where: { workspaceId_name: { workspaceId, name: dto.name.trim() } },
      });
      if (duplicate) {
        throw new ConflictException('A team with this name already exists in this workspace');
      }
    }

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.colour !== undefined && { colour: dto.colour }),
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        entityName: 'Team',
        entityId: teamId,
        actorId,
        action: 'TEAM_UPDATED',
        oldValues: { name: existing.name },
        newValues: { name: updated.name },
      },
    }).catch(() => null);

    return updated;
  }

  async deleteTeam(teamId: string, workspaceId: string, actorId: string) {
    await this.verifyActorPermission(workspaceId, actorId, [Role.ADMIN, Role.MANAGER]);
    const existing = await this.getTeam(teamId, workspaceId);

    // Safeguard: Nullify teamId on tasks rather than deleting historical work!
    await this.prisma.node.updateMany({
      where: { teamId },
      data: { teamId: null },
    });

    await this.prisma.team.delete({
      where: { id: teamId },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        entityName: 'Team',
        entityId: teamId,
        actorId,
        action: 'TEAM_DELETED',
        oldValues: { name: existing.name },
      },
    }).catch(() => null);

    return { success: true };
  }

  async addOrUpdateMember(
    teamId: string,
    workspaceId: string,
    actorId: string,
    dto: AddTeamMemberDto
  ) {
    const actor = await this.verifyActorPermission(
      workspaceId,
      actorId,
      [Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD],
      teamId
    );

    if (actor.role === Role.TEAM_LEAD && dto.role === 'lead') {
      throw new ForbiddenException('Forbidden: Team Leads cannot assign or promote Team Leads.');
    }

    await this.getTeam(teamId, workspaceId);

    // Validate target user is active in the organization/workspace
    const targetMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: dto.userId } },
      include: { user: true },
    });

    if (!targetMembership || !targetMembership.user.isActive || targetMembership.user.deletedAt) {
      throw new BadRequestException('Target user is not an active member of this workspace.');
    }

    const member = await this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: dto.userId } },
      update: { role: dto.role || 'member' },
      create: { teamId, userId: dto.userId, role: dto.role || 'member' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        entityName: 'TeamMember',
        entityId: member.id,
        actorId,
        action: 'TEAM_MEMBER_ASSIGNED',
        newValues: { teamId, userId: dto.userId, role: member.role },
      },
    }).catch(() => null);

    return member;
  }

  async removeMember(teamId: string, workspaceId: string, actorId: string, userId: string) {
    const actor = await this.verifyActorPermission(
      workspaceId,
      actorId,
      [Role.ADMIN, Role.MANAGER, Role.TEAM_LEAD],
      teamId
    );

    await this.getTeam(teamId, workspaceId);

    const existingMember = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });

    if (!existingMember) {
      throw new NotFoundException('Member not found in team.');
    }

    if (actor.role === Role.TEAM_LEAD && existingMember.role === 'lead') {
      throw new ForbiddenException('Forbidden: Team Leads cannot remove Team Leads.');
    }

    // Removing team membership must NOT delete historical tasks or approvals
    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        entityName: 'TeamMember',
        entityId: existingMember.id,
        actorId,
        action: 'TEAM_MEMBER_REMOVED',
        oldValues: { teamId, userId, role: existingMember.role },
      },
    }).catch(() => null);

    return { success: true };
  }
}
