import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  validateCustomData,
  GRANULAR_PERMISSIONS,
  ProjectDeletionImpact,
  ProjectDeleteDto,
  ProjectRestoreDto,
  ProjectPurgeDto,
} from '@flowtrack/shared';
import { Role, Priority, ConfidentialityLevel } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly authService?: AuthorizationService,
    @Optional() private readonly auditService?: AuditService
  ) {}

  private async generateUniqueProjectKey(workspaceId: string, name: string): Promise<string> {
    const base = (name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) || 'PRJ').toUpperCase();
    for (let i = 0; i < 10; i++) {
      const suffix = Math.floor(100 + Math.random() * 900);
      const candidate = `${base}-${suffix}`;
      const exists = await this.prisma.project.findFirst({
        where: { workspaceId, key: candidate, deletedAt: null },
      });
      if (!exists) return candidate;
    }
    return `${base}-${Date.now().toString().slice(-4)}`;
  }

  async listWorkspaceProjects(workspaceId: string, user?: { id?: string; role?: string }) {
    let visibilityFilter: any = {};
    if (this.authService && user?.id) {
      visibilityFilter = await this.authService.getProjectVisibilityFilter({
        id: user.id,
        role: user.role,
        workspaceId,
      });
    }

    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...visibilityFilter,
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        _count: {
          select: {
            nodes: { where: { deletedAt: null } },
            edges: { where: { deletedAt: null } },
            members: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Calculate aggregated metrics for each project in a single batched query (eliminates N+1)
    const projectIds = projects.map((p) => p.id);
    const allNodes =
      projectIds.length > 0
        ? await this.prisma.node.findMany({
            where: { projectId: { in: projectIds }, deletedAt: null },
            select: {
              projectId: true,
              id: true,
              progressPct: true,
              dueDate: true,
              status: { select: { category: true } },
            },
          })
        : [];

    const nodesByProject = new Map<string, typeof allNodes>();
    for (const node of allNodes) {
      const list = nodesByProject.get(node.projectId) || [];
      list.push(node);
      nodesByProject.set(node.projectId, list);
    }

    const now = new Date();
    const results = projects.map((project) => {
      const nodes = nodesByProject.get(project.id) || [];
      const totalNodes = nodes.length;
      const completedNodes = nodes.filter((n) => n.status?.category === 'done').length;
      const waitingNodes = nodes.filter((n) => n.status?.category === 'blocked').length;
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
    });

    return results;
  }

  async getProject(projectId: string, workspaceId: string, user?: { id?: string; role?: string }) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        workspaceId,
        deletedAt: null,
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        responsibleManager: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Shared visibility filter / confidential authorization: return 404 if unauthorized
    if (this.authService && user?.id) {
      const evalResult = await this.authService.evaluate(
        { id: user.id, role: user.role, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_VIEW,
        { project }
      );
      if (!evalResult.allowed) {
        if (evalResult.statusCode === 404) {
          throw new NotFoundException('Project not found');
        }
        throw new ForbiddenException(evalResult.reason);
      }
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

  async createProject(
    workspaceId: string,
    dto: CreateProjectDto,
    actorId?: string,
    userRole?: string
  ) {
    if (this.authService && actorId) {
      await this.authService.enforce(
        { id: actorId, role: userRole, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_CREATE,
        { workspaceId }
      );
    }

    // Validate or auto-generate unique project key
    let projectKey = dto.key?.toUpperCase();
    if (projectKey) {
      const existingKey = await this.prisma.project.findFirst({
        where: { workspaceId, key: projectKey, deletedAt: null },
      });
      if (existingKey) {
        throw new ConflictException(`Project key "${projectKey}" is already in use in this organization.`);
      }
    } else {
      projectKey = await this.generateUniqueProjectKey(workspaceId, dto.name);
    }

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
        key: projectKey,
        description: dto.description,
        objectives: dto.objectives || null,
        scope: dto.scope || null,
        deliverables: dto.deliverables || null,
        ownerId: dto.ownerId || actorId || null,
        responsibleManagerId: dto.responsibleManagerId || null,
        departmentId: dto.departmentId || null,
        classification: (dto.classification as any) || 'INTERNAL',
        accessPolicy: (dto.accessPolicy || {}) as any,
        templateId: dto.templateId,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        settings: (dto.settings || {}) as any,
        customData: customData as any,
      },
    });
  }

  async updateProject(
    projectId: string,
    workspaceId: string,
    dto: UpdateProjectDto,
    actorId?: string,
    userRole?: string
  ) {
    const existing = await this.getProject(
      projectId,
      workspaceId,
      actorId ? { id: actorId, role: userRole } : undefined
    );

    if (this.authService && actorId) {
      const requiredPerm =
        dto.classification !== undefined && dto.classification !== existing.classification
          ? GRANULAR_PERMISSIONS.CONFIDENTIALITY_CHANGE
          : GRANULAR_PERMISSIONS.PROJECT_EDIT;

      await this.authService.enforce(
        { id: actorId, role: userRole, workspaceId },
        requiredPerm,
        { project: existing }
      );
    }

    // Optimistic locking check if version was sent
    if (dto.version !== undefined && existing.version !== dto.version) {
      throw new ConflictException('Project was modified by another user. Please refresh and retry.');
    }

    // Key uniqueness check if key is being updated
    if (dto.key && dto.key.toUpperCase() !== existing.key) {
      const newKey = dto.key.toUpperCase();
      const duplicate = await this.prisma.project.findFirst({
        where: { workspaceId, key: newKey, id: { not: projectId }, deletedAt: null },
      });
      if (duplicate) {
        throw new ConflictException(`Project key "${newKey}" is already in use in this organization.`);
      }
    }

    let sanitizedCustomData: any = undefined;
    if (dto.customData !== undefined) {
      let roleToCheck = userRole;
      if (!roleToCheck && actorId) {
        const membership = await this.prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: actorId } },
        });
        roleToCheck = membership?.role;
      }

      const projectFields = await this.prisma.fieldDefinition.findMany({
        where: { workspaceId, targetType: 'project', isActive: true },
      });

      const merged = { ...((existing.customData as any) || {}), ...dto.customData };
      const valResult = validateCustomData(projectFields as any, merged, {
        userRole: roleToCheck,
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
        ...(dto.key && { key: dto.key.toUpperCase() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.objectives !== undefined && { objectives: dto.objectives }),
        ...(dto.scope !== undefined && { scope: dto.scope }),
        ...(dto.deliverables !== undefined && { deliverables: dto.deliverables }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
        ...(dto.responsibleManagerId !== undefined && { responsibleManagerId: dto.responsibleManagerId }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.classification !== undefined && { classification: dto.classification as any }),
        ...(dto.accessPolicy !== undefined && { accessPolicy: dto.accessPolicy as any }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.targetDate !== undefined && { targetDate: dto.targetDate ? new Date(dto.targetDate) : null }),
        ...(dto.settings && { settings: dto.settings as any }),
        ...(sanitizedCustomData !== undefined && { customData: sanitizedCustomData }),
        version: { increment: 1 },
      },
    });
  }

  /**
   * Phase 3: Project Deletion Impact Analysis
   */
  async getProjectDeletionImpact(
    projectId: string,
    workspaceId: string,
    actorId?: string,
    userRole?: string
  ): Promise<ProjectDeletionImpact> {
    const project = await this.getProject(
      projectId,
      workspaceId,
      actorId ? { id: actorId, role: userRole } : undefined
    );

    const [taskCount, subtaskCount, documentCount, externalEdges] = await Promise.all([
      this.prisma.node.count({
        where: { projectId, parentNodeId: null, deletedAt: null },
      }),
      this.prisma.node.count({
        where: { projectId, parentNodeId: { not: null }, deletedAt: null },
      }),
      this.prisma.document.count({
        where: { node: { projectId }, deletedAt: null },
      }),
      this.prisma.edge.findMany({
        where: {
          sourceNode: { projectId },
          targetNode: { projectId: { not: projectId } },
          deletedAt: null,
        },
        include: {
          targetNode: {
            select: {
              id: true,
              projectId: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    let evidenceCount = 0;
    try {
      if ((this.prisma as any).evidenceItem?.count) {
        evidenceCount = await (this.prisma as any).evidenceItem.count({
          where: { task: { projectId }, deletedAt: null },
        });
      }
    } catch {
      evidenceCount = 0;
    }

    const totalNodesCount = taskCount + subtaskCount;

    // Group dependent external projects
    const dependentProjectsMap = new Map<string, { id: string; name: string; taskCount: number }>();
    for (const edge of externalEdges) {
      const depPrj = edge.targetNode?.project;
      if (depPrj) {
        const existingDep = dependentProjectsMap.get(depPrj.id) || { id: depPrj.id, name: depPrj.name, taskCount: 0 };
        existingDep.taskCount++;
        dependentProjectsMap.set(depPrj.id, existingDep);
      }
    }
    const dependentProjects = Array.from(dependentProjectsMap.values());
    const crossProjectDependenciesCount = externalEdges.length;

    // Policy & protection checks
    const isProtected = !!(project.settings as any)?.isProtected;
    const isHighImpact = totalNodesCount > 10 || project.classification === 'CONFIDENTIAL' || project.classification === 'HIGHLY_CONFIDENTIAL';

    let requiresApproval = isProtected || isHighImpact;
    let approvalPolicyName: string | null = null;

    if ((this.prisma as any).approvalPolicy) {
      try {
        const policies = await (this.prisma as any).approvalPolicy.findMany({
          where: {
            workspaceId,
            isActive: true,
            operationType: 'PROJECT_DELETION',
          },
        });
        if (policies.length > 0) {
          requiresApproval = true;
          approvalPolicyName = policies[0].name;
        }
      } catch {
        // fallback
      }
    }

    return {
      projectId,
      projectName: project.name,
      taskCount,
      subtaskCount,
      totalNodesCount,
      documentCount,
      evidenceCount,
      crossProjectDependenciesCount,
      dependentProjects,
      requiresApproval,
      approvalPolicyName,
      isProtected,
    };
  }

  /**
   * Phase 3: Project Soft Deletion with Impact & Reason Validation
   */
  async deleteProject(
    projectId: string,
    workspaceId: string,
    actorId?: string,
    userRole?: string,
    dto?: ProjectDeleteDto
  ) {
    const existing = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Project not found');
    }

    if (this.authService && actorId) {
      await this.authService.enforce(
        { id: actorId, role: userRole, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_DELETE,
        { project: existing }
      );
    }

    // Mandatory non-empty reason
    const reason = dto?.reason?.trim();
    if (!reason) {
      throw new BadRequestException('A valid non-empty deletion reason is mandatory.');
    }

    // Check cross-project dependent tasks
    const externalDependents = await this.prisma.edge.findMany({
      where: {
        sourceNode: { projectId },
        targetNode: { projectId: { not: projectId } },
        deletedAt: null,
      },
      include: {
        targetNode: {
          select: {
            id: true,
            title: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (externalDependents.length > 0 && !dto?.force) {
      const depNames = Array.from(
        new Set(externalDependents.map((e) => e.targetNode?.project?.name).filter(Boolean))
      );
      throw new ConflictException(
        `Cannot delete project: ${externalDependents.length} active external task(s) in other project(s) (${depNames.join(', ')}) depend on tasks in this project. Review impact analysis or confirm force deletion.`
      );
    }

    // Soft-delete project and its tasks
    const updated = await this.prisma.$transaction(async (tx) => {
      const prj = await tx.project.update({
        where: { id: projectId },
        data: {
          deletedAt: new Date(),
          status: 'DELETED',
          settings: {
            ...((existing.settings as any) || {}),
            deletedBy: actorId,
            deletionReason: reason,
            deletedAt: new Date().toISOString(),
          },
          version: { increment: 1 },
        },
      });

      // Soft delete child nodes without deleting files/evidence or audit records
      await tx.node.updateMany({
        where: { projectId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      return prj;
    });

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId: actorId || 'system',
        action: 'PROJECT_SOFT_DELETED',
        targetType: 'project',
        targetId: projectId,
        beforeValues: { status: existing.status, name: existing.name },
        afterValues: { status: 'DELETED', deletedAt: updated.deletedAt },
        reason,
        outcome: 'SUCCESS',
      });
    }

    return updated;
  }

  /**
   * Phase 3: Project Restoration from Trash State
   */
  async restoreProject(
    projectId: string,
    workspaceId: string,
    actorId?: string,
    userRole?: string,
    dto?: ProjectRestoreDto
  ) {
    const existing = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    if (!existing.deletedAt) {
      throw new BadRequestException('Project is not deleted');
    }

    if (this.authService && actorId) {
      await this.authService.enforce(
        { id: actorId, role: userRole, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_RESTORE,
        { project: existing }
      );
    }

    const reason = dto?.reason?.trim() || 'Restored from trash';

    const restored = await this.prisma.$transaction(async (tx) => {
      const prj = await tx.project.update({
        where: { id: projectId },
        data: {
          deletedAt: null,
          status: 'ACTIVE',
          settings: {
            ...((existing.settings as any) || {}),
            restoredBy: actorId,
            restorationReason: reason,
            restoredAt: new Date().toISOString(),
          },
          version: { increment: 1 },
        },
      });

      // Restore child tasks
      await tx.node.updateMany({
        where: { projectId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });

      return prj;
    });

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId: actorId || 'system',
        action: 'PROJECT_RESTORED',
        targetType: 'project',
        targetId: projectId,
        beforeValues: { status: existing.status, deletedAt: existing.deletedAt },
        afterValues: { status: 'ACTIVE', deletedAt: null },
        reason,
        outcome: 'SUCCESS',
      });
    }

    return restored;
  }

  /**
   * Phase 3: Project Archival (Independent of project.edit)
   */
  async archiveProject(
    projectId: string,
    workspaceId: string,
    actorId?: string,
    userRole?: string
  ) {
    const existing = await this.getProject(
      projectId,
      workspaceId,
      actorId ? { id: actorId, role: userRole } : undefined
    );

    if (this.authService && actorId) {
      await this.authService.enforce(
        { id: actorId, role: userRole, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_ARCHIVE,
        { project: existing }
      );
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'ARCHIVED',
        settings: {
          ...((existing.settings as any) || {}),
          isArchived: true,
          archivedBy: actorId,
          archivedAt: new Date().toISOString(),
        },
        version: { increment: 1 },
      },
    });

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId: actorId || 'system',
        action: 'PROJECT_ARCHIVED',
        targetType: 'project',
        targetId: projectId,
        beforeValues: { status: existing.status },
        afterValues: { status: 'ARCHIVED' },
        reason: 'Project archived',
        outcome: 'SUCCESS',
      });
    }

    return updated;
  }

  /**
   * Phase 3: Project Unarchival
   */
  async unarchiveProject(
    projectId: string,
    workspaceId: string,
    actorId?: string,
    userRole?: string
  ) {
    const existing = await this.getProject(
      projectId,
      workspaceId,
      actorId ? { id: actorId, role: userRole } : undefined
    );

    if (this.authService && actorId) {
      await this.authService.enforce(
        { id: actorId, role: userRole, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_ARCHIVE,
        { project: existing }
      );
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'ACTIVE',
        settings: {
          ...((existing.settings as any) || {}),
          isArchived: false,
          unarchivedBy: actorId,
          unarchivedAt: new Date().toISOString(),
        },
        version: { increment: 1 },
      },
    });

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId: actorId || 'system',
        action: 'PROJECT_UNARCHIVED',
        targetType: 'project',
        targetId: projectId,
        beforeValues: { status: existing.status },
        afterValues: { status: 'ACTIVE' },
        reason: 'Project unarchived',
        outcome: 'SUCCESS',
      });
    }

    return updated;
  }

  /**
   * Phase 3: List Soft-Deleted Projects in Trash View
   */
  async listTrashProjects(workspaceId: string, user?: { id?: string; role?: string }) {
    if (this.authService && user?.id) {
      const canRestore = await this.authService.can(
        { id: user.id, role: user.role, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_RESTORE,
        { workspaceId }
      );
      const canDelete = await this.authService.can(
        { id: user.id, role: user.role, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_DELETE,
        { workspaceId }
      );
      const isAdminOrManager = user.role === 'ADMIN' || user.role === 'MANAGER';
      if (!canRestore && !canDelete && !isAdminOrManager) {
        throw new ForbiddenException('Unauthorized: You lack permission to view deleted projects.');
      }
    }

    let visibilityFilter: any = {};
    if (this.authService && user?.id) {
      visibilityFilter = await this.authService.getProjectVisibilityFilter({
        id: user.id,
        role: user.role,
        workspaceId,
      });
      delete visibilityFilter.deletedAt;
    }

    return this.prisma.project.findMany({
      where: {
        workspaceId,
        deletedAt: { not: null },
        ...visibilityFilter,
      },
      include: {
        _count: {
          select: {
            nodes: true,
          },
        },
      },
      orderBy: { deletedAt: 'desc' },
    });
  }

  /**
   * Phase 3: Permanent Purge (Privileged Operation with Retention Rules)
   */
  async purgeProject(
    projectId: string,
    workspaceId: string,
    actorId?: string,
    userRole?: string,
    dto?: ProjectPurgeDto
  ) {
    const existing = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    // Only Workspace Administrator can permanently purge
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';
    let hasPurgePerm = false;
    if (this.authService && actorId) {
      hasPurgePerm = await this.authService.can(
        { id: actorId, role: userRole, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_PURGE,
        { project: existing }
      );
    }

    if (!isAdmin && !hasPurgePerm) {
      throw new ForbiddenException('Permanent purge is restricted to Workspace Administrators.');
    }

    // Project must already be soft-deleted into trash
    if (!existing.deletedAt) {
      throw new BadRequestException('Project must be soft-deleted before permanent purge.');
    }

    // Confirmation key validation
    const expectedKey = `PURGE-${existing.key || existing.id}`;
    if (dto?.confirmationKey !== existing.name && dto?.confirmationKey !== expectedKey) {
      throw new BadRequestException(`Confirmation key mismatch. Please enter project name "${existing.name}" or "${expectedKey}".`);
    }

    // Mandatory justification
    const justification = dto?.justification?.trim();
    if (!justification) {
      throw new BadRequestException('A valid non-empty justification is mandatory for permanent purge.');
    }

    // Retention rules check: default retention threshold 30 days
    const retentionDays = 30;
    const minPurgeDate = new Date(existing.deletedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now < minPurgeDate && !dto?.forceRetentionWaiver) {
      throw new BadRequestException(
        `Retention rule active: Project is within the ${retentionDays}-day retention safety window. Specify forceRetentionWaiver: true with administrator authorization to override.`
      );
    }

    // Purge related records while strictly preserving immutable audit_events!
    await this.prisma.$transaction(async (tx) => {
      // 1. Delete edges
      await tx.edge.deleteMany({ where: { projectId } }).catch(() => null);
      // 2. Delete nodes
      await tx.node.deleteMany({ where: { projectId } }).catch(() => null);
      // 3. Delete project members
      await tx.projectMember.deleteMany({ where: { projectId } }).catch(() => null);
      // 4. Delete documents attached to project
      await tx.document.deleteMany({ where: { node: { projectId } } }).catch(() => null);
      // 5. Delete project
      await tx.project.delete({ where: { id: projectId } });
    });

    // Record immutable audit event
    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId: actorId || 'system',
        action: 'PROJECT_PURGED',
        targetType: 'project',
        targetId: projectId,
        beforeValues: { name: existing.name, key: existing.key, deletedAt: existing.deletedAt },
        afterValues: null,
        reason: justification,
        outcome: 'PERMANENTLY_PURGED',
      });
    }

    return {
      success: true,
      message: `Project "${existing.name}" permanently purged. Compliance and audit records preserved.`,
    };
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
    await this.getProject(projectId, workspaceId, actorId ? { id: actorId } : undefined);

    if (this.authService && actorId) {
      await this.authService.enforce(
        { id: actorId, workspaceId },
        GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
        { project: { id: projectId, workspaceId } }
      );
    }

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
    await this.getProject(projectId, workspaceId, actorId ? { id: actorId } : undefined);

    if (this.authService && actorId) {
      await this.authService.enforce(
        { id: actorId, workspaceId },
        GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
        { project: { id: projectId, workspaceId } }
      );
    }

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

  async seedHeroDemo(workspaceId: string, actorUserId: string) {
    // 1. Resolve or Create Statuses for this workspace
    let defaultStatusSet = await this.prisma.statusSet.findFirst({
      where: { workspaceId, isDefault: true },
      include: { statuses: true },
    });
    if (!defaultStatusSet || defaultStatusSet.statuses.length === 0) {
      defaultStatusSet = await this.prisma.statusSet.create({
        data: {
          workspaceId,
          name: 'Default Status Set',
          isDefault: true,
          statuses: {
            create: [
              { key: 'not_started', labelI18n: { en: 'Not Started' }, colour: '#94a3b8', category: 'not_started', displayOrder: 0 },
              { key: 'in_progress', labelI18n: { en: 'In Progress' }, colour: '#3b82f6', category: 'active', displayOrder: 1 },
              { key: 'waiting', labelI18n: { en: 'Waiting' }, colour: '#f59e0b', category: 'blocked', displayOrder: 2 },
              { key: 'done', labelI18n: { en: 'Done' }, colour: '#10b981', category: 'done', displayOrder: 3 },
            ],
          },
        },
        include: { statuses: true },
      });
    }

    const statuses = defaultStatusSet.statuses;
    const statusDone = statuses.find((s) => s.category === 'done') || statuses[0];
    const statusActive = statuses.find((s) => s.category === 'active') || statuses[0];
    const statusNotStarted = statuses.find((s) => s.category === 'not_started') || statuses[0];

    // 2. Resolve Node Types
    let taskType = await this.prisma.nodeType.findFirst({
      where: { workspaceId, key: 'task' },
    });
    if (!taskType) {
      taskType = await this.prisma.nodeType.create({
        data: {
          workspaceId,
          key: 'task',
          name: 'Task',
          icon: 'CheckSquare',
          colour: '#3b82f6',
          defaultStatusSetId: defaultStatusSet.id,
        },
      });
    }

    let milestoneType = await this.prisma.nodeType.findFirst({
      where: { workspaceId, key: 'milestone' },
    });
    if (!milestoneType) {
      milestoneType = await this.prisma.nodeType.create({
        data: {
          workspaceId,
          key: 'milestone',
          name: 'Milestone',
          icon: 'Flag',
          colour: '#8b5cf6',
          defaultStatusSetId: defaultStatusSet.id,
        },
      });
    }

    // 3. Clean up any existing HERO-01 in this workspace
    const existing = await this.prisma.project.findFirst({
      where: { workspaceId, key: 'HERO-01' },
    });
    if (existing) {
      await this.prisma.edge.deleteMany({ where: { projectId: existing.id } });
      await this.prisma.node.deleteMany({ where: { projectId: existing.id } });
      await this.prisma.projectMember.deleteMany({ where: { projectId: existing.id } });
      await this.prisma.project.delete({ where: { id: existing.id } });
    }

    // 4. Resolve sandeep user
    const sandeep = await this.prisma.user.findFirst({
      where: { email: 'sandeep@gmail.com' },
    });
    const mainOwnerId = actorUserId || sandeep?.id;

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const targetDate = new Date(now.getFullYear(), now.getMonth() + 2, 15);

    const project = await this.prisma.project.create({
      data: {
        workspaceId,
        name: 'Hero MotoCorp 3S Showroom Construction & Launch',
        key: 'HERO-01',
        description: 'Turnkey development of an authorized Hero MotoCorp Dealership & Service Workshop on National Highway (NH-44). Includes commercial land purchase, steel pre-fab structure, showroom glass facade, 6-bay hydraulic workshop, and launch event.',
        objectives: 'Establish a premier 3S (Sales, Service, Spares) motorcycle showroom to deliver 150+ units monthly with full Hero brand compliance.',
        scope: 'Plot registration, municipal sanctions, civil structure, Hero CI branding, and inaugural customer deliveries.',
        ownerId: mainOwnerId,
        responsibleManagerId: sandeep?.id || mainOwnerId,
        status: 'ACTIVE',
        classification: ConfidentialityLevel.INTERNAL,
        startDate,
        targetDate,
        settings: {
          industry: 'construction_real_estate',
          currency: 'INR',
          financials: {
            isConfigured: true,
            approvedBudget: 18500000,
            actualExpenditure: 11800000,
            currencyCode: 'INR',
            currencySymbol: '₹',
          },
        },
      },
    });

    if (mainOwnerId) {
      await this.prisma.projectMember.create({
        data: { projectId: project.id, userId: mainOwnerId, role: Role.ADMIN },
      }).catch(() => null);
    }
    if (sandeep && sandeep.id !== mainOwnerId) {
      await this.prisma.projectMember.create({
        data: { projectId: project.id, userId: sandeep.id, role: Role.MANAGER },
      }).catch(() => null);
    }

    const milestonesData = [
      {
        title: 'Phase 1: Land Acquisition & Legal Registry',
        desc: 'Commercial plot selection on NH-44 highway, revenue title clearance, registration with sub-registrar, and Hero dealership NOC.',
        posX: 80,
        posY: 180,
        status: statusDone,
        progressPct: 100,
        priority: Priority.HIGH,
        estimatedCost: 4500000,
        actualCost: 4450000,
        allocatedHours: 120,
        actualHours: 115,
        subtasks: [
          { title: 'NH-44 Highway Plot Identification & Survey', done: true, progress: 100 },
          { title: 'Title Deed Verification & Sub-Registrar Stamping', done: true, progress: 100 },
          { title: 'Hero MotoCorp Corporate Location NOC Grant', done: true, progress: 100 },
        ],
      },
      {
        title: 'Phase 2: Architectural Blueprints & Approvals',
        desc: 'Standardized Hero 3S showroom architectural drawings, structural engineering, municipal sanction, and Fire/PHE clearances.',
        posX: 440,
        posY: 180,
        status: statusDone,
        progressPct: 100,
        priority: Priority.MEDIUM,
        estimatedCost: 1200000,
        actualCost: 1180000,
        allocatedHours: 90,
        actualHours: 85,
        subtasks: [
          { title: 'Hero 3S Showroom & Service Bay Floorplan CAD', done: true, progress: 100 },
          { title: 'Municipal Commercial Building Sanction & Fire NOC', done: true, progress: 100 },
          { title: '3-Phase Industrial Electric Connection Sanction', done: true, progress: 100 },
        ],
      },
      {
        title: 'Phase 3: Civil Construction & Workshop Bays',
        desc: 'RCC foundation, structural steel framing, composite roof sheeting, toughened glass display facade, and 6 service bays with lift pits.',
        posX: 800,
        posY: 180,
        status: statusActive,
        progressPct: 65,
        priority: Priority.URGENT,
        estimatedCost: 7500000,
        actualCost: 5020000,
        allocatedHours: 320,
        actualHours: 210,
        subtasks: [
          { title: 'Foundation Piling & Steel Pre-Engineered Structure', done: true, progress: 100 },
          { title: 'Toughened Glass Display Facade & Brick Masonry', done: false, progress: 70 },
          { title: '6-Bay Hydraulic Lift Installation & Trenching', done: false, progress: 25 },
        ],
      },
      {
        title: 'Phase 4: Interior Fit-out & Brand Identity Branding',
        desc: 'Hero corporate identity red/black wall panelling, outdoor 3D LED pylon, AC customer lounge, spare parts racks, and dealer DMS IT system.',
        posX: 1160,
        posY: 180,
        status: statusActive,
        progressPct: 20,
        priority: Priority.HIGH,
        estimatedCost: 3000000,
        actualCost: 1150000,
        allocatedHours: 160,
        actualHours: 35,
        subtasks: [
          { title: 'Exterior 3D Hero Corporate Pylon & Illuminated Facia', done: false, progress: 40 },
          { title: 'Customer Lounge, Executive Desks & Billing Counters', done: false, progress: 15 },
          { title: 'Hero Dealer Management System (DMS) & Server Setup', done: false, progress: 0 },
        ],
      },
      {
        title: 'Phase 5: Stocking & Grand Showroom Opening',
        desc: 'Delivery of initial 50 bikes stock, service technician training, inaugural pooja ceremony, and first 15 customer keys handover.',
        posX: 1520,
        posY: 180,
        status: statusNotStarted,
        progressPct: 0,
        priority: Priority.HIGH,
        estimatedCost: 2300000,
        actualCost: 0,
        allocatedHours: 100,
        actualHours: 0,
        subtasks: [
          { title: 'Initial 50 Bikes Stocking (Splendor, HF Deluxe, Vida EV)', done: false, progress: 0 },
          { title: 'Hero Certified Sales & Technical Staff Onboarding', done: false, progress: 0 },
          { title: 'Grand Ribbon-Cutting Ceremony & 15 Bike Deliveries', done: false, progress: 0 },
        ],
      },
    ];

    const createdMainNodes = [];

    for (let i = 0; i < milestonesData.length; i++) {
      const data = milestonesData[i];
      const nodeDate = new Date(startDate.getTime() + i * 20 * 24 * 60 * 60 * 1000);
      const dueDate = new Date(nodeDate.getTime() + 18 * 24 * 60 * 60 * 1000);

      const checklist = data.subtasks.map((st, idx) => ({
        id: `check-${i + 1}-${idx + 1}`,
        text: st.title,
        completed: st.done,
      }));

      const mainNode = await this.prisma.node.create({
        data: {
          workspaceId,
          projectId: project.id,
          nodeTypeId: milestoneType.id,
          statusId: data.status.id,
          ownerId: mainOwnerId,
          title: data.title,
          description: data.desc,
          positionX: data.posX,
          positionY: data.posY,
          width: 300,
          height: 170,
          priority: data.priority,
          isMilestone: true,
          progressPct: data.progressPct,
          startDate: nodeDate,
          dueDate: dueDate,
          estimatedCost: data.estimatedCost,
          actualCost: data.actualCost,
          allocatedHours: data.allocatedHours,
          actualHours: data.actualHours,
          currency: 'INR',
          checklist,
          depth: 1,
          path: `/${i + 1}`,
          approvalStatus: data.progressPct === 100 ? 'approved' : 'not_required',
        },
      });
      createdMainNodes.push(mainNode);

      for (let c = 0; c < data.subtasks.length; c++) {
        const child = data.subtasks[c];
        const childStatus = child.done ? statusDone : child.progress > 0 ? statusActive : statusNotStarted;

        await this.prisma.node.create({
          data: {
            workspaceId,
            projectId: project.id,
            parentNodeId: mainNode.id,
            nodeTypeId: taskType.id,
            statusId: childStatus.id,
            ownerId: mainOwnerId,
            title: child.title,
            description: `Deliverable ${i + 1}.${c + 1} under ${mainNode.title}`,
            positionX: data.posX,
            positionY: data.posY + 220 + c * 140,
            width: 280,
            height: 120,
            priority: data.priority,
            isMilestone: false,
            progressPct: child.progress,
            startDate: nodeDate,
            dueDate: dueDate,
            depth: 2,
            path: `/${mainNode.id}/${c + 1}`,
            approvalStatus: child.done ? 'approved' : 'not_required',
          },
        });
      }
    }

    for (let i = 0; i < createdMainNodes.length - 1; i++) {
      await this.prisma.edge.create({
        data: {
          workspaceId,
          projectId: project.id,
          sourceNodeId: createdMainNodes[i].id,
          targetNodeId: createdMainNodes[i + 1].id,
          kind: 'sequence',
          label: `Stage ${i + 1} ➔ Stage ${i + 2}`,
        },
      });
    }

    return {
      success: true,
      message: 'Demo project seeded successfully',
      projectId: project.id,
      project,
    };
  }
}

