import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto, validateCustomData } from '@flowtrack/shared';
import { Role } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkspaceProjects(workspaceId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            nodes: { where: { deletedAt: null } },
            edges: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Calculate aggregated metrics for each project
    const results = await Promise.all(
      projects.map(async (project) => {
        const nodes = await this.prisma.node.findMany({
          where: { projectId: project.id, deletedAt: null },
          select: {
            id: true,
            progressPct: true,
            dueDate: true,
            status: { select: { category: true } },
          },
        });

        const totalNodes = nodes.length;
        const completedNodes = nodes.filter((n) => n.status?.category === 'done').length;
        const waitingNodes = nodes.filter((n) => n.status?.category === 'blocked').length;
        const now = new Date();
        const overdueNodes = nodes.filter(
          (n) => n.dueDate && new Date(n.dueDate) < now && n.status?.category !== 'done' && n.status?.category !== 'cancelled'
        ).length;

        const avgProgress =
          totalNodes > 0
            ? Math.round(nodes.reduce((acc, n) => acc + (n.progressPct || 0), 0) / totalNodes)
            : 0;

        return {
          ...project,
          metrics: {
            totalNodes,
            completedNodes,
            waitingNodes,
            overdueNodes,
            avgProgress,
          },
        };
      })
    );

    return results;
  }

  async getProject(projectId: string, workspaceId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const customFields = await this.prisma.fieldDefinition.findMany({
      where: {
        workspaceId,
        targetType: 'project',
        isActive: true,
      },
      orderBy: [{ groupName: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      ...project,
      customFields,
    };
  }

  async createProject(workspaceId: string, dto: CreateProjectDto, actorId?: string) {
    let customData = dto.customData || {};
    const projectFields = await this.prisma.fieldDefinition.findMany({
      where: { workspaceId, targetType: 'project', isActive: true },
    });

    if (projectFields.length > 0 && dto.customData) {
      const valResult = validateCustomData(projectFields as any, dto.customData);
      if (!valResult.isValid) {
        throw new BadRequestException({
          message: 'Project custom field validation failed',
          errors: valResult.errors,
        });
      }
      customData = valResult.sanitized;
    }

    return this.prisma.project.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        templateId: dto.templateId,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        settings: (dto.settings || {}) as any,
        customData: customData as any,
      },
    });
  }

  async updateProject(projectId: string, workspaceId: string, dto: UpdateProjectDto, actorId?: string) {
    const existing = await this.getProject(projectId, workspaceId);

    // Optimistic locking check if version was sent
    if (dto.version !== undefined && existing.version !== dto.version) {
      throw new ConflictException('Project was modified by another user. Please refresh and retry.');
    }

    let sanitizedCustomData: any = undefined;
    if (dto.customData !== undefined) {
      let userRole: string | undefined = undefined;
      if (actorId) {
        const membership = await this.prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: actorId } },
        });
        userRole = membership?.role;
      }

      const projectFields = await this.prisma.fieldDefinition.findMany({
        where: { workspaceId, targetType: 'project', isActive: true },
      });

      const merged = { ...((existing.customData as any) || {}), ...dto.customData };
      const valResult = validateCustomData(projectFields as any, merged, {
        userRole,
        existingData: (existing.customData as any) || {},
      });

      if (!valResult.isValid) {
        throw new BadRequestException({
          message: 'Project custom field validation failed',
          errors: valResult.errors,
        });
      }
      sanitizedCustomData = valResult.sanitized;
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.targetDate !== undefined && { targetDate: dto.targetDate ? new Date(dto.targetDate) : null }),
        ...(dto.settings && { settings: dto.settings as any }),
        ...(sanitizedCustomData !== undefined && { customData: sanitizedCustomData }),
        version: { increment: 1 },
      },
    });
  }

  async deleteProject(projectId: string, workspaceId: string) {
    await this.getProject(projectId, workspaceId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
  }

  async cloneProject(
    sourceProjectId: string,
    workspaceId: string,
    actorId?: string,
    dto?: { name?: string; description?: string; startDate?: string; targetDate?: string; resetProgress?: boolean }
  ) {
    const sourceProject = await this.prisma.project.findFirst({
      where: {
        id: sourceProjectId,
        workspaceId,
        deletedAt: null,
      },
      include: {
        nodes: {
          where: { deletedAt: null },
        },
        edges: {
          where: { deletedAt: null },
        },
      },
    });

    if (!sourceProject) {
      throw new NotFoundException(`Project with ID "${sourceProjectId}" was not found in this workspace`);
    }

    const resetProgress = dto?.resetProgress !== false;
    const clonedName = dto?.name?.trim() || `${sourceProject.name} (Copy)`;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create project clone
      const newProject = await tx.project.create({
        data: {
          workspaceId,
          name: clonedName,
          description: dto?.description !== undefined ? dto.description : sourceProject.description,
          templateId: sourceProject.templateId,
          startDate: dto?.startDate ? new Date(dto.startDate) : (sourceProject.startDate || new Date()),
          targetDate: dto?.targetDate ? new Date(dto.targetDate) : sourceProject.targetDate,
          settings: (sourceProject.settings || {}) as any,
        },
      });

      // 2. Clone Nodes preserving hierarchy (2 passes: parents first, then children)
      const oldToNewNodeId = new Map<string, string>();
      const rootNodes = sourceProject.nodes.filter((n) => !n.parentNodeId);
      const childNodes = sourceProject.nodes.filter((n) => !!n.parentNodeId);

      for (const node of rootNodes) {
        const created = await tx.node.create({
          data: {
            workspaceId,
            projectId: newProject.id,
            nodeTypeId: node.nodeTypeId,
            title: node.title,
            description: node.description,
            positionX: node.positionX,
            positionY: node.positionY,
            priority: node.priority,
            weight: node.weight,
            progressPct: resetProgress ? 0 : node.progressPct,
            estimatedCost: node.estimatedCost,
            actualCost: resetProgress ? 0 : node.actualCost,
            allocatedHours: node.allocatedHours,
            actualHours: resetProgress ? 0 : node.actualHours,
            isMilestone: node.isMilestone,
            customData: (node.customData || {}) as any,
            statusId: resetProgress ? null : node.statusId,
          },
        });
        oldToNewNodeId.set(node.id, created.id);
      }

      for (const node of childNodes) {
        const remappedParentId = node.parentNodeId ? oldToNewNodeId.get(node.parentNodeId) : null;
        const created = await tx.node.create({
          data: {
            workspaceId,
            projectId: newProject.id,
            parentNodeId: remappedParentId || null,
            nodeTypeId: node.nodeTypeId,
            title: node.title,
            description: node.description,
            positionX: node.positionX,
            positionY: node.positionY,
            priority: node.priority,
            weight: node.weight,
            progressPct: resetProgress ? 0 : node.progressPct,
            estimatedCost: node.estimatedCost,
            actualCost: resetProgress ? 0 : node.actualCost,
            allocatedHours: node.allocatedHours,
            actualHours: resetProgress ? 0 : node.actualHours,
            isMilestone: node.isMilestone,
            customData: (node.customData || {}) as any,
            statusId: resetProgress ? null : node.statusId,
          },
        });
        oldToNewNodeId.set(node.id, created.id);
      }

      // 3. Clone Edges
      let clonedEdgesCount = 0;
      for (const edge of sourceProject.edges) {
        const newSourceId = oldToNewNodeId.get(edge.sourceNodeId);
        const newTargetId = oldToNewNodeId.get(edge.targetNodeId);

        if (newSourceId && newTargetId) {
          await tx.edge.create({
            data: {
              workspaceId,
              projectId: newProject.id,
              sourceNodeId: newSourceId,
              targetNodeId: newTargetId,
              kind: edge.kind,
              label: edge.label,
              metadata: (edge.metadata || {}) as any,
            },
          });
          clonedEdgesCount++;
        }
      }

      // 4. Audit Log
      if (actorId) {
        await tx.auditLog.create({
          data: {
            workspaceId,
            projectId: newProject.id,
            entityName: 'Project',
            entityId: newProject.id,
            actorId,
            action: 'CLONE',
            newValues: {
              sourceProjectId,
              sourceProjectName: sourceProject.name,
              name: newProject.name,
              clonedNodesCount: oldToNewNodeId.size,
              clonedEdgesCount,
            },
          },
        });
      }

      return {
        project: newProject,
        nodesCount: oldToNewNodeId.size,
        edgesCount: clonedEdgesCount,
      };
    });
  }

  async saveAsTemplate(
    projectId: string,
    workspaceId: string,
    actorId?: string,
    dto?: { name?: string; description?: string; category?: string; industry?: string; methodology?: string; icon?: string; tags?: string[]; isPublic?: boolean }
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId, deletedAt: null },
      include: {
        nodes: {
          where: { deletedAt: null, parentNodeId: null },
          include: {
            children: { where: { deletedAt: null } },
            nodeType: true,
          },
          orderBy: { positionX: 'asc' },
        },
        edges: { where: { deletedAt: null } },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" was not found in this workspace`);
    }

    const templateNodes: any[] = [];
    const nodeIdToIndex = new Map<string, number>();

    project.nodes.forEach((node, idx) => {
      nodeIdToIndex.set(node.id, idx);
      const subtasks = (node.children || []).map((sub) => ({
        title: sub.title,
        description: sub.description || undefined,
        nodeTypeKey: 'task',
        priority: sub.priority,
        weight: sub.weight,
        progressPct: 0,
      }));

      templateNodes.push({
        key: `node_${idx + 1}`,
        title: node.title,
        description: node.description || undefined,
        nodeTypeKey: node.nodeType?.key || 'task',
        positionX: node.positionX,
        positionY: node.positionY,
        priority: node.priority,
        weight: node.weight,
        progressPct: 0,
        subtasks,
      });
    });

    const templateEdges: any[] = [];
    for (const edge of project.edges) {
      const srcIdx = nodeIdToIndex.get(edge.sourceNodeId);
      const tgtIdx = nodeIdToIndex.get(edge.targetNodeId);
      if (srcIdx !== undefined && tgtIdx !== undefined) {
        templateEdges.push({
          sourceIndex: srcIdx,
          targetIndex: tgtIdx,
          kind: edge.kind,
          label: edge.label || undefined,
        });
      }
    }

    const templateName = dto?.name || `${project.name} Blueprint`;
    const settings = (project.settings || {}) as any;

    const template = await this.prisma.template.create({
      data: {
        workspaceId,
        name: templateName,
        category: dto?.category || 'Custom Projects',
        industry: dto?.industry || settings.industry || 'general',
        methodology: dto?.methodology || settings.methodology || 'stage_gate',
        icon: dto?.icon || 'Layers',
        tags: dto?.tags || ['cloned', 'custom'],
        description: dto?.description || project.description || `Reusable blueprint saved from ${project.name}`,
        defaultSettings: settings,
        graphJson: {
          nodes: templateNodes,
          edges: templateEdges,
        },
        isPublic: dto?.isPublic ?? false,
      },
    });

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          projectId: project.id,
          entityName: 'Template',
          entityId: template.id,
          actorId,
          action: 'CREATE',
          newValues: {
            sourceProjectId: project.id,
            templateId: template.id,
            templateName: template.name,
          },
        },
      });
    }

    return template;
  }

  async listProjectMembers(projectId: string, workspaceId: string) {
    await this.getProject(projectId, workspaceId);

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
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
      orderBy: { createdAt: 'asc' },
    });

    return members;
  }

  async addOrUpdateProjectMember(
    projectId: string,
    workspaceId: string,
    actorId: string,
    dto: { userId: string; role?: Role }
  ) {
    await this.getProject(projectId, workspaceId);

    // Verify actor is Admin or Project Manager
    const wsMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorId } },
    });
    if (!wsMembership) {
      throw new ForbiddenException('Unauthorized: Not a member of this workspace');
    }

    if (wsMembership.role !== Role.ADMIN) {
      const projMember = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: actorId } },
      });
      if (!projMember || (projMember.role !== Role.MANAGER && projMember.role !== Role.ADMIN)) {
        throw new ForbiddenException('Unauthorized: Only Admins or Project Managers can assign project members');
      }
    }

    // Target user must be an active workspace member
    const targetWsMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: dto.userId } },
      include: { user: true },
    });

    if (!targetWsMembership || !targetWsMembership.user.isActive || targetWsMembership.user.deletedAt) {
      throw new BadRequestException('Target user is not an active member of this workspace');
    }

    const member = await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: dto.userId } },
      update: { role: dto.role || Role.MEMBER },
      create: { projectId, userId: dto.userId, role: dto.role || Role.MEMBER },
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
        projectId,
        entityName: 'ProjectMember',
        entityId: member.id,
        actorId,
        action: 'PROJECT_MEMBER_ASSIGNED',
        newValues: { projectId, userId: dto.userId, role: member.role },
      },
    }).catch(() => null);

    return member;
  }

  async removeProjectMember(
    projectId: string,
    workspaceId: string,
    actorId: string,
    userId: string
  ) {
    await this.getProject(projectId, workspaceId);

    const wsMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorId } },
    });
    if (!wsMembership) {
      throw new ForbiddenException('Unauthorized: Not a member of this workspace');
    }

    if (wsMembership.role !== Role.ADMIN) {
      const projMember = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: actorId } },
      });
      if (!projMember || (projMember.role !== Role.MANAGER && projMember.role !== Role.ADMIN)) {
        throw new ForbiddenException('Unauthorized: Only Admins or Project Managers can remove project members');
      }
    }

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!target) {
      throw new NotFoundException('Project member not found');
    }

    // Removing membership must NOT erase historical tasks or approvals
    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        projectId,
        entityName: 'ProjectMember',
        entityId: target.id,
        actorId,
        action: 'PROJECT_MEMBER_REMOVED',
        oldValues: { projectId, userId, role: target.role },
      },
    }).catch(() => null);

    return { success: true };
  }
}

