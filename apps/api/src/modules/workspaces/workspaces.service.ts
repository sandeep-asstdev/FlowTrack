import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
          },
        },
      },
    });
  }

  async inviteMember(workspaceId: string, inviterUserId: string, dto: InviteMemberDto) {
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          fullName: dto.email.split('@')[0],
        },
      });
    }

    return this.prisma.membership.upsert({
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
        user: true,
      },
    });
  }
}
