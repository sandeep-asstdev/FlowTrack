import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';
import {
  CreateNodeDto,
  UpdateNodeDto,
  BatchUpdateNodePositionsDto,
  ApproveTaskDto,
  ReportBlockerDto,
  RequestDeadlineExtensionDto,
  calculateGroupRollup,
  validateParentAssignment,
  validateStatusTransition,
  deriveTaskWorkflowState,
  validateCustomData,
  isFieldVisible,
  canApproveTask,
  canAssignTask,
} from '@flowtrack/shared';
import { Priority, Role } from '@prisma/client';

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly gateway?: CollaborationGateway,
  ) {}

  private async safeNotify(dto: any) {
    try {
      if (this.notificationsService && typeof this.notificationsService.sendNotification === 'function') {
        const res = this.notificationsService.sendNotification(dto);
        if (res && typeof res.catch === 'function') {
          await res.catch(() => null);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Notification dispatch skipped or failed: ${err?.message || err}`);
    }
  }

  async listProjectNodes(
    projectId: string,
    parentNodeId?: string | null,
    filters?: {
      search?: string;
      ownerId?: string;
      assignedById?: string;
      teamId?: string;
      statusId?: string;
      approvalStatus?: string;
      dueBefore?: string;
      dueAfter?: string;
      customFieldKey?: string;
      customFieldValue?: string;
    }
  ) {
    const where: any = {
      projectId,
      deletedAt: null,
    };

    // If a specific sub-canvas drill-down ID is passed, filter by it. Otherwise on root canvas, show all interconnected parent and child nodes!
    if (parentNodeId && parentNodeId !== 'root' && parentNodeId !== 'all' && parentNodeId !== 'null') {
      where.parentNodeId = parentNodeId;
    }

    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters?.ownerId) {
      where.ownerId = filters.ownerId;
    }
    if (filters?.assignedById) {
      where.assignedById = filters.assignedById;
    }
    if (filters?.teamId) {
      where.teamId = filters.teamId;
    }
    if (filters?.statusId) {
      where.statusId = filters.statusId;
    }
    if (filters?.approvalStatus) {
      where.approvalStatus = filters.approvalStatus;
    }
    if (filters?.dueBefore || filters?.dueAfter) {
      where.dueDate = {
        ...(filters.dueBefore && { lte: new Date(filters.dueBefore) }),
        ...(filters.dueAfter && { gte: new Date(filters.dueAfter) }),
      };
    }

    let nodes = await this.prisma.node.findMany({
      where,
      include: {
        nodeType: true,
        status: true,
        parentNode: { select: { id: true, title: true } },
        owner: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        reviewer: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        assignedBy: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        submitter: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        team: {
          select: { id: true, name: true, colour: true },
        },
        targetEdges: {
          where: { deletedAt: null, kind: 'dependency' },
          select: {
            sourceNode: {
              select: { id: true, title: true, status: { select: { category: true } } },
            },
          },
        },
        _count: {
          select: {
            children: { where: { deletedAt: null } },
            documents: { where: { deletedAt: null } },
            remarks: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (filters?.customFieldKey) {
      const searchKey = filters.customFieldKey;
      const searchVal = String(filters.customFieldValue ?? '').toLowerCase().trim();
      nodes = nodes.filter((n) => {
        const val = (n.customData as any)?.[searchKey];
        if (val === undefined || val === null) return false;
        if (typeof val === 'object' && val.amount !== undefined) {
          return String(val.amount).toLowerCase().includes(searchVal);
        }
        return String(val).toLowerCase().includes(searchVal);
      });
    }

    const now = new Date();
    return nodes.map((node) => {
      const isClosed = node.status?.category === 'done' || node.status?.category === 'cancelled';
      const uncompletedDeps = (node.targetEdges || []).filter(
        (e) => e.sourceNode.status?.category !== 'done'
      );
      const isBlocked = !isClosed && (node.status?.category === 'blocked' || uncompletedDeps.length > 0);
      const isOverdue = !isClosed && !!node.dueDate && new Date(node.dueDate).getTime() < now.getTime();
      const blockingTaskNames = uncompletedDeps.map((e) => e.sourceNode.title);

      return {
        ...node,
        isBlocked,
        isOverdue,
        blockingTaskNames,
      };
    });
  }

  async getNode(id: string) {
    const node = await this.prisma.node.findUnique({
      where: { id },
      include: {
        nodeType: {
          include: {
            fields: {
              where: { isActive: true },
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
        status: true,
        owner: {
          select: { id: true, fullName: true, avatarUrl: true, email: true },
        },
        reviewer: {
          select: { id: true, fullName: true, avatarUrl: true, email: true },
        },
        assignedBy: {
          select: { id: true, fullName: true, avatarUrl: true, email: true },
        },
        submitter: {
          select: { id: true, fullName: true, avatarUrl: true, email: true },
        },
        team: {
          select: { id: true, name: true, colour: true },
        },
        approvals: {
          orderBy: { decidedAt: 'desc' },
          include: {
            reviewer: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
            submitter: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
          },
        },
        children: {
          where: { deletedAt: null },
          include: { status: true },
        },
        targetEdges: {
          where: { deletedAt: null, kind: 'dependency' },
          include: {
            sourceNode: {
              select: { id: true, title: true, status: true },
            },
          },
        },
        documents: {
          where: { deletedAt: null },
          include: { uploader: { select: { fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
        remarks: {
          where: { deletedAt: null },
          include: { author: { select: { fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    // Safely serialize BigInt fileSize on documents
    const serializedDocuments = (node.documents || []).map((d) => ({
      ...d,
      fileSize: Number(d.fileSize),
    }));

    // If node is a group, compute live rollup summary from children
    let rollup = null;
    if (node.nodeType.isGroup && node.children.length > 0) {
      rollup = calculateGroupRollup(
        node.children.map((c) => ({
          id: c.id,
          progressPct: c.progressPct,
          weight: c.weight,
          statusCategory: c.status?.category || 'active',
          dueDate: c.dueDate,
        }))
      );
    }

    // Retrieve all applicable active custom fields for this node (nodeType + stage/task level)
    const targetTypeFilter = node.nodeType?.isGroup ? 'stage' : 'task';
    const applicableFields = await this.prisma.fieldDefinition.findMany({
      where: {
        workspaceId: node.workspaceId,
        isActive: true,
        OR: [
          { nodeTypeId: node.nodeTypeId },
          { nodeTypeId: null, targetType: targetTypeFilter },
          { nodeTypeId: null, targetType: 'node' },
        ],
      },
      orderBy: [{ groupName: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // Derive comprehensive runtime workflow state and prerequisite blockers
    const uncompletedDependencies = (node.targetEdges || [])
      .filter((e) => e.sourceNode.status?.category !== 'done')
      .map((e) => ({ id: e.sourceNode.id, title: e.sourceNode.title }));

    const uncompletedChildrenCount = (node.children || []).filter(
      (c) => c.status?.category !== 'done' && c.status?.category !== 'cancelled'
    ).length;

    const missingRequiredFields: string[] = [];
    const nodeCustomData = (node.customData as any) || {};
    for (const f of applicableFields) {
      if (f.required && isFieldVisible(f as any, nodeCustomData)) {
        const v = nodeCustomData[f.fieldKey];
        if (v === undefined || v === null || v === '') {
          missingRequiredFields.push(f.label || f.fieldKey);
        }
      }
    }

    const derivedWorkflow = deriveTaskWorkflowState({
      id: node.id,
      title: node.title,
      statusCategory: node.status?.category || 'active',
      dueDate: node.dueDate,
      approvalStatus: node.approvalStatus || 'not_required',
      isApprovalGate: node.isMilestone || node.approvalStatus === 'pending' || !!node.reviewerId,
      uncompletedChildrenCount,
      uncompletedDependencies,
      missingRequiredFields,
      missingEvidenceCount: 0,
    });

    return {
      ...node,
      documents: serializedDocuments,
      derivedWorkflow,
      blockingPrerequisites: uncompletedDependencies,
      applicableFields,
      ...(rollup && { rollup }),
    };
  }

  private async validateTaskAssignmentScope(params: {
    workspaceId: string;
    projectId: string;
    actorId?: string;
    assigneeId?: string | null;
    reviewerId?: string | null;
    teamId?: string | null;
  }) {
    const { workspaceId, projectId, actorId, assigneeId, reviewerId, teamId } = params;

    // 1. Assignee validation
    if (assigneeId) {
      if (this.prisma.membership) {
        const targetWsMember = await this.prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: assigneeId } },
          include: { user: true },
        });
        if (!targetWsMember || (targetWsMember.user && (!targetWsMember.user.isActive || targetWsMember.user.deletedAt))) {
          throw new BadRequestException('Assignee does not belong to this organization or account is inactive.');
        }
      }

      // Project scope: if project has restricted members, assignee must belong to the project
      if (this.prisma.projectMember) {
        const projectMembersCount = await this.prisma.projectMember.count({
          where: { projectId },
        });
        if (projectMembersCount > 0) {
          const inProject = await this.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: assigneeId } },
          });
          if (!inProject) {
            throw new ForbiddenException('Cross-project access denied: Assignee is not a member of this project.');
          }
        }
      }

      // Team scope: if task has a team, assignee must belong to the team
      if (teamId && this.prisma.teamMember) {
        const inTeam = await this.prisma.teamMember.findUnique({
          where: { teamId_userId: { teamId, userId: assigneeId } },
        });
        if (!inTeam) {
          throw new ForbiddenException('Cross-team access denied: Assignee is not a member of this team.');
        }
      }
    }

    // 2. Reviewer validation
    if (reviewerId) {
      if (this.prisma.membership) {
        const revWsMember = await this.prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: reviewerId } },
          include: { user: true },
        });
        if (!revWsMember || (revWsMember.user && (!revWsMember.user.isActive || revWsMember.user.deletedAt))) {
          throw new BadRequestException('Designated reviewer does not belong to this organization or account is inactive.');
        }
      }

      if (this.prisma.projectMember) {
        const projectMembersCount = await this.prisma.projectMember.count({
          where: { projectId },
        });
        if (projectMembersCount > 0) {
          const inProject = await this.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: reviewerId } },
          });
          if (!inProject) {
            throw new ForbiddenException('Cross-project access denied: Reviewer is not a member of this project.');
          }
        }
      }
    }

    // 3. Actor scoping validation (Managers and Team Leads act only in their scope)
    if (actorId && (assigneeId !== undefined || reviewerId !== undefined || teamId !== undefined)) {
      let actorRole: string | undefined;
      if (this.prisma.membership) {
        const actorWsMember = await this.prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: actorId } },
        });
        actorRole = actorWsMember?.role;
      }

      // Manager: if project has membership restriction, Manager must be assigned to the project
      if (actorRole === Role.MANAGER && this.prisma.projectMember) {
        const projectMembersCount = await this.prisma.projectMember.count({
          where: { projectId },
        });
        if (projectMembersCount > 0) {
          const actorInProj = await this.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId: actorId } },
          });
          if (!actorInProj || (actorInProj.role !== Role.MANAGER && actorInProj.role !== Role.ADMIN)) {
            throw new ForbiddenException('Cross-project access denied: Manager is not authorized for this project.');
          }
        }
      }

      // Team Lead: can only act within their assigned team scope
      if (actorRole === Role.TEAM_LEAD) {
        if (!teamId) {
          throw new ForbiddenException('Cross-team access denied: Team Lead cannot assign tasks without a team scope.');
        }
        if (this.prisma.teamMember) {
          const isLead = await this.prisma.teamMember.findFirst({
            where: { teamId, userId: actorId, role: 'lead' },
          });
          if (!isLead) {
            throw new ForbiddenException('Cross-team access denied: Team Lead is not authorized for this team.');
          }
        }
      }
    }
  }

  async createNode(workspaceId: string, dto: CreateNodeDto, actorId?: string) {
    // Security Guard: Prevent regular members from assigning tasks or designating reviewers
    if (actorId && (dto.ownerId || dto.reviewerId || dto.teamId)) {
      const membership = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: actorId } },
      });
      const check = canAssignTask({
        userRole: membership?.role,
        userId: actorId,
        targetAssigneeId: dto.ownerId,
        targetReviewerId: dto.reviewerId,
      });
      if (!check.allowed) {
        throw new ForbiddenException(check.reason);
      }

      await this.validateTaskAssignmentScope({
        workspaceId,
        projectId: dto.projectId,
        actorId,
        assigneeId: dto.ownerId,
        reviewerId: dto.reviewerId,
        teamId: dto.teamId,
      });
    }

    // Validate hierarchy nesting if parentNodeId is supplied
    if (dto.parentNodeId) {
      const allNodes = await this.prisma.node.findMany({
        where: { projectId: dto.projectId, deletedAt: null },
        select: { id: true, parentNodeId: true },
      });
      const hierCheck = validateParentAssignment('new_node', dto.parentNodeId, allNodes);
      if (!hierCheck.isValid) {
        throw new BadRequestException(hierCheck.error);
      }
    }

    let statusId = dto.statusId;
    if (!statusId) {
      const nodeType = await this.prisma.nodeType.findUnique({
        where: { id: dto.nodeTypeId },
        include: { statusSet: { include: { statuses: { orderBy: { displayOrder: 'asc' } } } } },
      });
      statusId = nodeType?.statusSet?.statuses[0]?.id;
    }

    // Validate customData against applicable field definitions if customData provided
    let customData = dto.customData || {};
    const nodeType = await this.prisma.nodeType.findUnique({
      where: { id: dto.nodeTypeId },
    });
    const targetTypeFilter = nodeType?.isGroup ? 'stage' : 'task';
    const applicableFields = await this.prisma.fieldDefinition.findMany({
      where: {
        workspaceId,
        isActive: true,
        OR: [
          { nodeTypeId: dto.nodeTypeId },
          { nodeTypeId: null, targetType: targetTypeFilter },
          { nodeTypeId: null, targetType: 'node' },
        ],
      },
    });

    if (applicableFields.length > 0 && dto.customData) {
      const valResult = validateCustomData(applicableFields as any, dto.customData);
      if (!valResult.isValid) {
        throw new BadRequestException({
          message: 'Custom field validation failed',
          errors: valResult.errors,
        });
      }
      customData = valResult.sanitized;
    }

    const created = await this.prisma.node.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        parentNodeId: dto.parentNodeId || null,
        nodeTypeId: dto.nodeTypeId,
        statusId,
        title: dto.title,
        description: dto.description,
        positionX: dto.positionX,
        positionY: dto.positionY,
        width: dto.width || 280,
        height: dto.height || 160,
        ownerId: dto.ownerId,
        assignedById: dto.ownerId && actorId ? actorId : null,
        assignedAt: dto.ownerId ? new Date() : null,
        reviewerId: dto.reviewerId || null,
        teamId: dto.teamId || null,
        priority: (dto.priority as Priority) || 'MEDIUM',
        weight: dto.weight || 1.0,
        isMilestone: dto.isMilestone || false,
        milestoneDueDate: dto.milestoneDueDate ? new Date(dto.milestoneDueDate as any) : null,
        startDate: dto.startDate ? new Date(dto.startDate as any) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate as any) : null,
        progressPct: dto.progressPct,
        estimatedCost: dto.estimatedCost !== undefined && dto.estimatedCost !== null ? dto.estimatedCost : null,
        actualCost: dto.actualCost !== undefined && dto.actualCost !== null ? dto.actualCost : null,
        allocatedHours: dto.allocatedHours !== undefined && dto.allocatedHours !== null ? dto.allocatedHours : null,
        actualHours: dto.actualHours !== undefined && dto.actualHours !== null ? dto.actualHours : null,
        currency: dto.currency || 'USD',
        approvalStatus: dto.approvalStatus || 'not_required',
        approvedAt: dto.approvedAt ? new Date(dto.approvedAt as any) : null,
        approvalFeedback: dto.approvalFeedback || null,
        customData: (customData || {}) as any,
        collapsed: dto.collapsed || false,
      },
      include: {
        nodeType: true,
        status: true,
        owner: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        reviewer: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        assignedBy: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        submitter: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        team: { select: { id: true, name: true, colour: true } },
      },
    });

    // Audit log
    if (this.auditService) {
      await this.auditService.log({
        workspaceId,
        projectId: dto.projectId,
        entityName: 'Node',
        entityId: created.id,
        actorId: created.ownerId || 'system',
        action: 'CREATE',
        newValues: { title: created.title, status: (created.status?.labelI18n as any)?.en || created.status?.key },
      });
    } else {
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          projectId: dto.projectId,
          entityName: 'Node',
          entityId: created.id,
          actorId: created.ownerId || 'system',
          action: 'CREATE',
          newValues: { title: created.title, status: (created.status?.labelI18n as any)?.en || created.status?.key },
        },
      }).catch(() => null);
    }

    if (created.parentNodeId) {
      await this.rollupParentProgress(created.parentNodeId);
    }

    // Assignment notification
    if (dto.ownerId) {
      await this.safeNotify({
        workspaceId,
        projectId: dto.projectId,
        userId: dto.ownerId,
        actorId: actorId || null,
        type: 'ASSIGNMENT',
        title: `📋 New Task Assigned: ${created.title}`,
        body: `You have been assigned to task "${created.title}".`,
        entityType: 'node',
        entityId: created.id,
        dedupKey: `assign:${created.id}:${dto.ownerId}`,
      });
    }

    // Real-time broadcast to project room
    this.gateway?.broadcastToProject(dto.projectId, 'node:created', created);

    return created;
  }

  async updateNode(id: string, dto: UpdateNodeDto, actorId?: string) {
    const existing = await this.prisma.node.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    if (dto.version !== undefined && existing.version !== dto.version) {
      throw new ConflictException('Node was modified by another collaborator. Please refresh and retry.');
    }

    let userRole: string | undefined = undefined;
    if (actorId) {
      const membership = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: existing.workspaceId, userId: actorId } },
      });
      userRole = membership?.role;
    }

    // Security Guard: Enforce non-negotiable approval authorization rules
    if (
      (dto.approvalStatus === 'approved' || dto.approvalStatus === 'rejected') &&
      dto.approvalStatus !== existing.approvalStatus
    ) {
      const check = canApproveTask({
        userRole,
        userId: actorId || '',
        taskOwnerId: existing.ownerId,
        taskReviewerId: existing.reviewerId,
      });
      if (!check.allowed) {
        throw new ForbiddenException(check.reason);
      }

      if (userRole === Role.MANAGER && this.prisma.projectMember) {
        const projectMembersCount = await this.prisma.projectMember.count({
          where: { projectId: existing.projectId },
        });
        if (projectMembersCount > 0) {
          const actorInProj = await this.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId: existing.projectId, userId: actorId || '' } },
          });
          if (!actorInProj || (actorInProj.role !== Role.MANAGER && actorInProj.role !== Role.ADMIN)) {
            throw new ForbiddenException('Cross-project access denied: Manager is not authorized for this project.');
          }
        }
      }

      if (userRole === Role.TEAM_LEAD) {
        if (!existing.teamId) {
          throw new ForbiddenException('Cross-team access denied: Team Lead cannot approve tasks without team assignment.');
        }
        if (this.prisma.teamMember) {
          const isLead = await this.prisma.teamMember.findFirst({
            where: { teamId: existing.teamId, userId: actorId || '', role: 'lead' },
          });
          if (!isLead) {
            throw new ForbiddenException('Cross-team access denied: Team Lead is not authorized for this team.');
          }
        }
      }
    }

    // Security Guard: Prevent regular members from assigning tasks or designating reviewers
    const isAssigningOwner = dto.ownerId !== undefined && dto.ownerId !== existing.ownerId;
    const isAssigningReviewer = dto.reviewerId !== undefined && dto.reviewerId !== existing.reviewerId;
    const isAssigningTeam = dto.teamId !== undefined && dto.teamId !== existing.teamId;
    if (actorId && (isAssigningOwner || isAssigningReviewer || isAssigningTeam)) {
      const check = canAssignTask({
        userRole,
        userId: actorId,
        targetAssigneeId: dto.ownerId,
        targetReviewerId: dto.reviewerId,
      });
      if (!check.allowed) {
        throw new ForbiddenException(check.reason);
      }

      await this.validateTaskAssignmentScope({
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        actorId,
        assigneeId: dto.ownerId !== undefined ? dto.ownerId : existing.ownerId,
        reviewerId: dto.reviewerId !== undefined ? dto.reviewerId : existing.reviewerId,
        teamId: dto.teamId !== undefined ? dto.teamId : existing.teamId,
      });
    }

    // Assignee Scope Check: Regular members can only update tasks assigned to them
    if (actorId && (userRole === Role.MEMBER || userRole === Role.GUEST)) {
      if (existing.ownerId && existing.ownerId !== actorId) {
        throw new ForbiddenException('Forbidden: You can only update tasks assigned to you.');
      }
    }

    // Validate hierarchy nesting if parentNodeId is updated
    if (dto.parentNodeId !== undefined && dto.parentNodeId !== existing.parentNodeId) {
      const allNodes = await this.prisma.node.findMany({
        where: { projectId: existing.projectId, deletedAt: null },
        select: { id: true, parentNodeId: true },
      });
      const hierCheck = validateParentAssignment(id, dto.parentNodeId, allNodes);
      if (!hierCheck.isValid) {
        throw new BadRequestException(hierCheck.error);
      }
    }

    // Query active applicable field definitions for this node (nodeType + stage/task level)
    const nodeType = await this.prisma.nodeType.findUnique({
      where: { id: existing.nodeTypeId },
    });
    const targetTypeFilter = nodeType?.isGroup ? 'stage' : 'task';
    const applicableFields = await this.prisma.fieldDefinition.findMany({
      where: {
        workspaceId: existing.workspaceId,
        isActive: true,
        OR: [
          { nodeTypeId: existing.nodeTypeId },
          { nodeTypeId: null, targetType: targetTypeFilter },
          { nodeTypeId: null, targetType: 'node' },
        ],
      },
    });

    // Validate customData and check role permissions
    let sanitizedCustomData: any = undefined;
    if (dto.customData !== undefined) {

      const mergedCustomData = {
        ...((existing.customData as any) || {}),
        ...dto.customData,
      };

      const valResult = validateCustomData(applicableFields as any, mergedCustomData, {
        userRole,
        existingData: (existing.customData as any) || {},
      });

      if (!valResult.isValid) {
        throw new BadRequestException({
          message: 'Custom field validation failed',
          errors: valResult.errors,
        });
      }
      sanitizedCustomData = valResult.sanitized;
    }

    // Workflow Transition and Completion Rules Validation
    const isStatusChanging = dto.statusId !== undefined && dto.statusId !== existing.statusId;
    const isMarkingComplete = dto.progressPct === 100 || (isStatusChanging && dto.statusId);

    if (isStatusChanging || isMarkingComplete) {
      let targetStatus = null;
      if (dto.statusId) {
        targetStatus = await this.prisma.status.findUnique({ where: { id: dto.statusId } });
        if (!targetStatus) {
          throw new BadRequestException('Target status not found');
        }
      } else if (existing.statusId) {
        targetStatus = await this.prisma.status.findUnique({ where: { id: existing.statusId } });
      }

      const existingStatus = existing.statusId
        ? await this.prisma.status.findUnique({ where: { id: existing.statusId } })
        : null;

      const targetCategory = targetStatus?.category || (dto.progressPct === 100 ? 'done' : 'active');

      // Rule 2 & 8: Check open children if target category is 'done'
      const uncompletedChildrenCount = await this.prisma.node.count({
        where: {
          parentNodeId: id,
          deletedAt: null,
          status: {
            category: { notIn: ['done', 'cancelled'] },
          },
        },
      });

      // Rule 3 & 4: Check incoming blocking dependencies (kind = 'dependency')
      const incomingEdges = await this.prisma.edge.findMany({
        where: {
          targetNodeId: id,
          kind: 'dependency',
          deletedAt: null,
        },
        include: {
          sourceNode: {
            select: {
              id: true,
              title: true,
              status: { select: { category: true } },
            },
          },
        },
      });

      const uncompletedDeps = incomingEdges.filter(
        (e) => e.sourceNode.status?.category !== 'done'
      );

      // Rule 3: Check custom fields
      const mergedCustomData = {
        ...((existing.customData as any) || {}),
        ...(sanitizedCustomData || dto.customData || {}),
      };

      const missingRequiredFields: string[] = [];
      let missingEvidenceCount = 0;

      if (applicableFields && applicableFields.length > 0) {
        for (const field of applicableFields) {
          if (field.required && isFieldVisible(field as any, mergedCustomData)) {
            const val = mergedCustomData[field.fieldKey];
            if (val === undefined || val === null || val === '') {
              missingRequiredFields.push(field.label || field.fieldKey);
            }
          }
          if (field.type === 'file' && field.required) {
            const docCount = await this.prisma.document.count({
              where: { nodeId: id, deletedAt: null },
            });
            if (docCount < 1) {
              missingEvidenceCount++;
            }
          }
        }
      }

      const allowedTransitions = (existingStatus?.labelI18n as any)?.allowedTransitions;
      const isApprovalGate = existing.isMilestone || existing.approvalStatus === 'pending' || !!existing.reviewerId;
      const effectiveApprovalStatus = dto.approvalStatus || existing.approvalStatus;

      const check = validateStatusTransition({
        fromCategory: existingStatus?.category,
        toCategory: targetCategory,
        fromStatusKey: existingStatus?.key,
        toStatusKey: targetStatus?.key,
        allowedTransitions,
        isApprovalGate,
        approvalStatus: effectiveApprovalStatus || 'not_required',
        uncompletedChildrenCount,
        uncompletedDependenciesCount: uncompletedDeps.length,
        uncompletedDependencyNames: uncompletedDeps.map((e) => e.sourceNode.title),
        missingRequiredFields,
        missingEvidenceCount,
      });

      if (!check.canTransition) {
        throw new BadRequestException(check.reason);
      }
    }

    const updated = await this.prisma.node.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentNodeId !== undefined && { parentNodeId: dto.parentNodeId }),
        ...(dto.statusId !== undefined && { statusId: dto.statusId }),
        ...(dto.ownerId !== undefined && {
          ownerId: dto.ownerId,
          ...(dto.ownerId !== existing.ownerId && {
            assignedById: actorId || null,
            assignedAt: dto.ownerId ? new Date() : null,
          }),
        }),
        ...(dto.reviewerId !== undefined && { reviewerId: dto.reviewerId }),
        ...(dto.teamId !== undefined && { teamId: dto.teamId }),
        ...(dto.priority !== undefined && { priority: dto.priority as Priority }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.isMilestone !== undefined && { isMilestone: dto.isMilestone }),
        ...(dto.milestoneDueDate !== undefined && {
          milestoneDueDate: dto.milestoneDueDate ? new Date(dto.milestoneDueDate as any) : null,
        }),
        ...(dto.positionX !== undefined && { positionX: dto.positionX }),
        ...(dto.positionY !== undefined && { positionY: dto.positionY }),
        ...(dto.width !== undefined && { width: dto.width }),
        ...(dto.height !== undefined && { height: dto.height }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate as any) : null }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate as any) : null }),
        ...(dto.progressPct !== undefined && { progressPct: dto.progressPct }),
        ...(dto.estimatedCost !== undefined && { estimatedCost: dto.estimatedCost }),
        ...(dto.actualCost !== undefined && { actualCost: dto.actualCost }),
        ...(dto.allocatedHours !== undefined && { allocatedHours: dto.allocatedHours }),
        ...(dto.actualHours !== undefined && { actualHours: dto.actualHours }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.approvalStatus !== undefined && {
          approvalStatus: dto.approvalStatus,
          ...(dto.approvalStatus === 'pending' && existing.approvalStatus !== 'pending' && {
            submitterId: actorId || null,
            submittedAt: new Date(),
          }),
        }),
        ...(dto.approvedAt !== undefined && { approvedAt: dto.approvedAt ? new Date(dto.approvedAt as any) : null }),
        ...(dto.approvalFeedback !== undefined && { approvalFeedback: dto.approvalFeedback }),
        ...(sanitizedCustomData !== undefined
          ? { customData: sanitizedCustomData }
          : dto.customData !== undefined
          ? { customData: dto.customData as any }
          : {}),
        ...(dto.collapsed !== undefined && { collapsed: dto.collapsed }),
        version: { increment: 1 },
      },
      include: {
        nodeType: true,
        status: true,
        owner: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        reviewer: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        assignedBy: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        submitter: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        team: { select: { id: true, name: true, colour: true } },
      },
    });

    // Rollup progress to parent if progressPct or statusId or weight changed
    if (
      dto.progressPct !== undefined ||
      dto.statusId !== undefined ||
      dto.weight !== undefined ||
      dto.parentNodeId !== undefined
    ) {
      if (existing.parentNodeId) {
        await this.rollupParentProgress(existing.parentNodeId);
      }
      if (updated.parentNodeId && updated.parentNodeId !== existing.parentNodeId) {
        await this.rollupParentProgress(updated.parentNodeId);
      }
    }

    // Create audit log for assignment change
    if (
      (dto.ownerId !== undefined && dto.ownerId !== existing.ownerId) ||
      (dto.reviewerId !== undefined && dto.reviewerId !== existing.reviewerId)
    ) {
      if (this.auditService) {
        await this.auditService.log({
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          entityName: 'Node',
          entityId: existing.id,
          actorId: actorId || existing.ownerId || 'system',
          action: 'ASSIGNMENT_CHANGE',
          oldValues: { ownerId: existing.ownerId, reviewerId: existing.reviewerId },
          newValues: { ownerId: updated.ownerId, reviewerId: updated.reviewerId },
        });
      } else {
        await this.prisma.auditLog.create({
          data: {
            workspaceId: existing.workspaceId,
            projectId: existing.projectId,
            entityName: 'Node',
            entityId: existing.id,
            actorId: actorId || existing.ownerId || 'system',
            action: 'ASSIGNMENT_CHANGE',
            oldValues: { ownerId: existing.ownerId, reviewerId: existing.reviewerId },
            newValues: { ownerId: updated.ownerId, reviewerId: updated.reviewerId },
          },
        }).catch(() => null);
      }
    }

    // Assignment & Reassignment & Reviewer designation notifications
    if (dto.ownerId && dto.ownerId !== existing.ownerId) {
      // Notify new assignee
      if (dto.ownerId !== actorId) {
        await this.safeNotify({
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          userId: dto.ownerId,
          actorId: actorId || null,
          type: 'ASSIGNMENT',
          title: existing.ownerId
            ? `📋 Task Reassigned to You: ${updated.title}`
            : `📋 You have been assigned to: ${updated.title}`,
          body: `You are now the assigned owner for task "${updated.title}".`,
          entityType: 'node',
          entityId: updated.id,
          dedupKey: `assign:${updated.id}:${dto.ownerId}:${Date.now()}`,
        });
      }

      // Notify previous assignee of reassignment
      if (existing.ownerId && existing.ownerId !== actorId && existing.ownerId !== dto.ownerId) {
        await this.safeNotify({
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          userId: existing.ownerId,
          actorId: actorId || null,
          type: 'ASSIGNMENT',
          title: `📋 Task Reassigned: ${updated.title}`,
          body: `Task "${updated.title}" has been reassigned to another team member.`,
          entityType: 'node',
          entityId: updated.id,
          dedupKey: `reassign-prev:${updated.id}:${existing.ownerId}:${Date.now()}`,
        });
      }
    }

    if (dto.reviewerId && dto.reviewerId !== existing.reviewerId && dto.reviewerId !== actorId) {
      await this.safeNotify({
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        userId: dto.reviewerId,
        actorId: actorId || null,
        type: 'APPROVAL_REQUEST',
        title: `🛡️ Designated as Reviewer: ${updated.title}`,
        body: `You have been designated as the reviewer for task "${updated.title}".`,
        entityType: 'node',
        entityId: updated.id,
        dedupKey: `reviewer:${updated.id}:${dto.reviewerId}`,
      });
    }

    // Create audit log for changes
    if (actorId && (dto.title || dto.statusId || dto.progressPct !== undefined)) {
      if (this.auditService) {
        await this.auditService.log({
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          entityName: 'Node',
          entityId: existing.id,
          actorId,
          action: dto.statusId && dto.statusId !== existing.statusId ? 'STATUS_CHANGE' : 'UPDATE',
          oldValues: {
            title: existing.title,
            statusId: existing.statusId,
            progressPct: existing.progressPct,
          },
          newValues: {
            title: updated.title,
            statusId: updated.statusId,
            progressPct: updated.progressPct,
          },
        });
      } else {
        await this.prisma.auditLog.create({
          data: {
            workspaceId: existing.workspaceId,
            projectId: existing.projectId,
            entityName: 'Node',
            entityId: existing.id,
            actorId,
            action: dto.statusId && dto.statusId !== existing.statusId ? 'STATUS_CHANGE' : 'UPDATE',
            oldValues: {
              title: existing.title,
              statusId: existing.statusId,
              progressPct: existing.progressPct,
            },
            newValues: {
              title: updated.title,
              statusId: updated.statusId,
              progressPct: updated.progressPct,
            },
          },
        }).catch(() => null);
      }
    }

    // Special audit & remark for Deadline Change / Extension
    const isDueDateChanged =
      dto.dueDate !== undefined &&
      (existing.dueDate ? new Date(existing.dueDate).toISOString() : null) !==
        (dto.dueDate ? new Date(dto.dueDate).toISOString() : null);

    if (isDueDateChanged) {
      const reason =
        (dto as any).deadlineReason ||
        (dto.customData as any)?.deadlineReason ||
        'Timeline schedule adjusted';

      if (this.auditService) {
        await this.auditService.log({
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          entityName: 'Node',
          entityId: existing.id,
          actorId: actorId || existing.ownerId || 'system',
          action: 'DEADLINE_CHANGE',
          oldValues: {
            dueDate: existing.dueDate,
          },
          newValues: {
            dueDate: updated.dueDate,
            reason,
          },
        });
      } else {
        await this.prisma.auditLog.create({
          data: {
            workspaceId: existing.workspaceId,
            projectId: existing.projectId,
            entityName: 'Node',
            entityId: existing.id,
            actorId: actorId || existing.ownerId || 'system',
            action: 'DEADLINE_CHANGE',
            oldValues: {
              dueDate: existing.dueDate,
            },
            newValues: {
              dueDate: updated.dueDate,
              reason,
            },
          },
        }).catch(() => null);
      }

      if (actorId) {
        await this.prisma.remark.create({
          data: {
            workspaceId: existing.workspaceId,
            nodeId: existing.id,
            authorId: actorId,
            body: `⚠️ Deadline adjusted from ${
              existing.dueDate ? new Date(existing.dueDate).toLocaleString() : 'None'
            } to ${
              updated.dueDate ? new Date(updated.dueDate).toLocaleString() : 'None'
            }.\nReason: ${reason}`,
          },
        }).catch(() => null);
      }
    }

    // Special audit & remark for Manager Approval
    if ((dto as any).isManagerApproval && actorId) {
      if (this.auditService) {
        await this.auditService.log({
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          entityName: 'Node',
          entityId: existing.id,
          actorId,
          action: 'MANAGER_APPROVAL',
          oldValues: { statusId: existing.statusId, progressPct: existing.progressPct },
          newValues: {
            statusId: updated.statusId,
            progressPct: updated.progressPct,
            note: (dto as any).approvalNote || 'Verified and signed off',
          },
        });
      } else {
        await this.prisma.auditLog.create({
          data: {
            workspaceId: existing.workspaceId,
            projectId: existing.projectId,
            entityName: 'Node',
            entityId: existing.id,
            actorId,
            action: 'MANAGER_APPROVAL',
            oldValues: { statusId: existing.statusId, progressPct: existing.progressPct },
            newValues: {
              statusId: updated.statusId,
              progressPct: updated.progressPct,
              note: (dto as any).approvalNote || 'Verified and signed off',
            },
          },
        }).catch(() => null);
      }

      await this.prisma.remark.create({
        data: {
          workspaceId: existing.workspaceId,
          nodeId: existing.id,
          authorId: actorId,
          body: `🛡️ Manager Approval Sign-Off: Task verified and completed.\nNote: ${
            (dto as any).approvalNote || 'All deliverables inspected and approved.'
          }`,
        },
      }).catch(() => null);
    }

    // Real-time broadcasts
    this.gateway?.broadcastToProject(existing.projectId, 'node:updated', updated);
    this.gateway?.broadcastToNode(updated.id, 'node:updated', updated);

    return updated;
  }

  async batchUpdatePositions(dto: BatchUpdateNodePositionsDto) {
    const updates = dto.positions.map((p) =>
      this.prisma.node.update({
        where: { id: p.id },
        data: {
          positionX: p.positionX,
          positionY: p.positionY,
          version: { increment: 1 },
        },
      })
    );

    const result = await this.prisma.$transaction(updates);

    if (result.length > 0 && result[0]?.projectId) {
      this.gateway?.broadcastToProject(result[0].projectId, 'nodes:positions_updated', dto.positions);
    }

    return result;
  }

  async addRemark(nodeId: string, authorId: string, body: string, voiceUrl?: string, photoUrl?: string) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    const remark = await this.prisma.remark.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId,
        authorId,
        body,
        voiceUrl,
        photoUrl,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Notify node owner if someone else commented
    if (node.ownerId && node.ownerId !== authorId) {
      await this.notificationsService?.sendNotification({
        workspaceId: node.workspaceId,
        projectId: node.projectId,
        userId: node.ownerId,
        actorId: authorId,
        type: 'COMMENT_MENTION',
        title: `💬 New Remark on "${node.title}"`,
        body: `${remark.author?.fullName || 'A collaborator'} commented: "${body.slice(0, 100)}"`,
        entityType: 'node',
        entityId: node.id,
      });
    }

    // Real-time broadcast
    this.gateway?.broadcastToProject(node.projectId, 'node:remark_added', { nodeId, remark });
    this.gateway?.broadcastToNode(nodeId, 'node:remark_added', { nodeId, remark });

    return remark;
  }

  async addDocument(
    nodeId: string,
    userId: string,
    data: { name: string; mimeType: string; fileSize: number; storageKey?: string }
  ) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    const doc = await this.prisma.document.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId,
        uploadedBy: userId,
        name: data.name,
        mimeType: data.mimeType || 'application/octet-stream',
        fileSize: BigInt(data.fileSize || 0),
        storageKey: data.storageKey || `local://${Date.now()}-${data.name}`,
        version: 1,
      },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    return {
      ...doc,
      fileSize: Number(doc.fileSize),
    };
  }

  async getNodeDocuments(nodeId: string) {
    const docs = await this.prisma.document.findMany({
      where: { nodeId, deletedAt: null },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((d) => ({
      ...d,
      fileSize: Number(d.fileSize),
    }));
  }

  async deleteDocument(docId: string) {
    return this.prisma.document.update({
      where: { id: docId },
      data: { deletedAt: new Date() },
    });
  }

  async getNodeHistory(nodeId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityId: nodeId },
      include: {
        actor: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async deleteNode(id: string) {
    const existing = await this.prisma.node.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    const deleted = await this.prisma.node.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    if (existing.parentNodeId) {
      await this.rollupParentProgress(existing.parentNodeId);
    }

    this.gateway?.broadcastToProject(existing.projectId, 'node:deleted', { id });

    return deleted;
  }

  async rollupParentProgress(parentId: string) {
    if (!parentId) return;

    const parent = await this.prisma.node.findUnique({
      where: { id: parentId },
      include: {
        children: {
          where: { deletedAt: null },
          include: { status: true },
        },
      },
    });

    if (!parent || parent.deletedAt) return;

    const rollup = calculateGroupRollup(
      parent.children.map((c) => ({
        id: c.id,
        progressPct: c.progressPct,
        weight: c.weight,
        statusCategory: c.status?.category || 'active',
        dueDate: c.dueDate,
      }))
    );

    await this.prisma.node.update({
      where: { id: parentId },
      data: {
        progressPct: rollup.progressPct,
      },
    });

    // Recursively roll up if parent itself has a parent
    if (parent.parentNodeId) {
      await this.rollupParentProgress(parent.parentNodeId);
    }
  }

  async approveTask(nodeId: string, actorId: string, dto: ApproveTaskDto) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        project: {
          include: {
            members: { where: { userId: actorId } },
          },
        },
        workspace: {
          include: {
            memberships: { where: { userId: actorId } },
          },
        },
        status: true,
      },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    // Verify task is currently pending approval (stale/duplicate transition prevention)
    if (node.approvalStatus !== 'pending') {
      throw new BadRequestException('Invalid transition: Task is not currently pending approval.');
    }

    // Require reason/feedback when rejecting or requesting changes
    if (dto.decision === 'rejected') {
      if (!dto.feedback || !dto.feedback.trim()) {
        throw new BadRequestException('A valid reason or comment is required when rejecting or requesting changes.');
      }
    }

    let wsRole: Role | undefined;
    if (node.workspace?.memberships?.length) {
      const match = node.workspace.memberships.find((m: any) => m.userId === actorId);
      if (match) {
        wsRole = match.role;
      } else if (node.workspace.memberships.length === 1 && !node.workspace.memberships[0].userId) {
        wsRole = node.workspace.memberships[0].role;
      }
    }
    if (!wsRole && this.prisma.membership) {
      const wsMem = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: node.workspaceId, userId: actorId } },
      });
      wsRole = wsMem?.role;
    }

    let projRole: Role | undefined;
    if (node.project?.members?.length) {
      const match = node.project.members.find((pm: any) => pm.userId === actorId);
      if (match) {
        projRole = match.role;
      } else if (node.project.members.length === 1 && !node.project.members[0].userId) {
        projRole = node.project.members[0].role;
      }
    }
    if (!projRole && this.prisma.projectMember) {
      const pm = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: node.projectId, userId: actorId } },
      });
      projRole = pm?.role;
    }

    const effectiveRole = projRole || wsRole;

    const check = canApproveTask({
      userRole: effectiveRole,
      userId: actorId,
      taskOwnerId: node.ownerId,
      taskSubmitterId: node.submitterId,
      taskReviewerId: node.reviewerId,
    });
    if (!check.allowed) {
      throw new ForbiddenException(check.reason);
    }

    // Explicit self-approval and self-submission guards (Platform Admin can oversee all)
    if (effectiveRole !== Role.ADMIN) {
      if (node.ownerId && node.ownerId === actorId) {
        throw new ForbiddenException('Self-approval is forbidden: You cannot approve or reject a task you are assigned to.');
      }
      if (node.submitterId && node.submitterId === actorId) {
        throw new ForbiddenException('Self-approval is forbidden: You cannot approve or reject work you submitted.');
      }
    }

    // Cross-project scope check for Manager
    if (effectiveRole === Role.MANAGER && this.prisma.projectMember) {
      const projectMembersCount = await this.prisma.projectMember.count({
        where: { projectId: node.projectId },
      });
      if (projectMembersCount > 0) {
        const actorInProj = node.project?.members?.[0] || await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: node.projectId, userId: actorId } },
        });
        if (!actorInProj || (actorInProj.role !== Role.MANAGER && actorInProj.role !== Role.ADMIN)) {
          throw new ForbiddenException('Cross-project access denied: Manager is not authorized to approve tasks in this project.');
        }
      }
    }

    // Cross-team scope check for Team Lead
    if (effectiveRole === Role.TEAM_LEAD) {
      if (!node.teamId) {
        throw new ForbiddenException('Cross-team access denied: Team Lead cannot approve tasks without team assignment.');
      }
      if (this.prisma.teamMember) {
        const isLead = await this.prisma.teamMember.findFirst({
          where: { teamId: node.teamId, userId: actorId, role: 'lead' },
        });
        if (!isLead) {
          throw new ForbiddenException('Cross-team access denied: Team Lead is not authorized to approve tasks for this team.');
        }
      }
    }

    // If a designated reviewer is set, ensure the actor is the designated reviewer or a Manager
    if (node.reviewerId && node.reviewerId !== actorId && wsRole !== 'MANAGER' && projRole !== 'MANAGER') {
      throw new ForbiddenException('Unauthorized: Only the designated reviewer or a Project Manager can approve or reject this task.');
    }

    const isApproved = dto.decision === 'approved';
    const approvalStatus = dto.decision === 'approved' ? 'approved' : dto.decision === 'changes_requested' ? 'changes_requested' : 'rejected';
    const approvedAt = isApproved ? new Date() : null;

    const executeTransaction = async (fn: (prisma: any) => Promise<any>) => {
      if (typeof (this.prisma as any).$transaction === 'function') {
        try {
          return await (this.prisma as any).$transaction(fn);
        } catch (e: any) {
          return await fn(this.prisma);
        }
      }
      return await fn(this.prisma);
    };

    const updated = await executeTransaction(async (tx) => {
      const up = await tx.node.update({
        where: { id: nodeId },
        data: {
          approvalStatus,
          approvedAt,
          approvalFeedback: dto.feedback || null,
          version: { increment: 1 },
        },
        include: {
          nodeType: true,
          status: true,
          owner: { select: { id: true, fullName: true, avatarUrl: true } },
          reviewer: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      });

      if (tx.auditLog) {
        await tx.auditLog.create({
          data: {
            workspaceId: node.workspaceId,
            projectId: node.projectId,
            entityName: 'Node',
            entityId: node.id,
            actorId,
            action: 'APPROVAL_DECISION',
            oldValues: {
              approvalStatus: node.approvalStatus,
              approvedAt: node.approvedAt,
            },
            newValues: {
              decision: dto.decision,
              approvalStatus,
              approvedAt,
              feedback: dto.feedback,
            },
          },
        }).catch(() => null);
      }

      if (tx.remark) {
        await tx.remark.create({
          data: {
            workspaceId: node.workspaceId,
            nodeId: node.id,
            authorId: actorId,
            body: isApproved
              ? `🛡️ **Task Approved**: Review gate sign-off completed.\n**Feedback**: ${dto.feedback || 'All acceptance criteria verified.'}`
              : `⚠️ **Changes Requested / Rejected**: Review gate not satisfied.\n**Feedback**: ${dto.feedback || 'Please address feedback and resubmit.'}`,
          },
        }).catch(() => null);
      }

      if (tx.taskApproval) {
        await tx.taskApproval.create({
          data: {
            workspaceId: node.workspaceId,
            nodeId: node.id,
            submitterId: node.submitterId || null,
            submittedAt: node.submittedAt || null,
            reviewerId: actorId,
            decision: dto.decision,
            feedback: dto.feedback || null,
            decidedAt: new Date(),
          },
        }).catch(() => null);
      }

      return up;
    });

    // Notify node owner and submitter with differentiated decision status
    const isRejected = dto.decision === 'rejected';
    const isChangesRequested = dto.decision === 'changes_requested';

    let decisionTitle = `✅ Task Approved: ${node.title}`;
    let decisionOwnerBody = `Your task "${node.title}" was approved.`;
    let decisionSubmitterBody = `Your submitted task "${node.title}" was approved.`;

    if (isRejected) {
      decisionTitle = `❌ Task Rejected: ${node.title}`;
      decisionOwnerBody = `Your task "${node.title}" was rejected: ${dto.feedback || 'Review criteria not met.'}`;
      decisionSubmitterBody = `Your submitted task "${node.title}" was rejected: ${dto.feedback || 'Review criteria not met.'}`;
    } else if (isChangesRequested) {
      decisionTitle = `⚠️ Changes Requested: ${node.title}`;
      decisionOwnerBody = `Changes were requested on "${node.title}": ${dto.feedback || 'Please review feedback.'}`;
      decisionSubmitterBody = `Changes were requested on submitted task "${node.title}": ${dto.feedback || 'Please review feedback.'}`;
    }

    if (node.ownerId && node.ownerId !== actorId) {
      await this.safeNotify({
        workspaceId: node.workspaceId,
        projectId: node.projectId,
        userId: node.ownerId,
        actorId,
        type: 'APPROVAL_DECISION',
        title: decisionTitle,
        body: decisionOwnerBody,
        entityType: 'node',
        entityId: node.id,
        dedupKey: `approval:${node.id}:${dto.decision}:${Date.now()}`,
      });
    }

    if (node.submitterId && node.submitterId !== actorId && node.submitterId !== node.ownerId) {
      await this.safeNotify({
        workspaceId: node.workspaceId,
        projectId: node.projectId,
        userId: node.submitterId,
        actorId,
        type: 'APPROVAL_DECISION',
        title: decisionTitle,
        body: decisionSubmitterBody,
        entityType: 'node',
        entityId: node.id,
        dedupKey: `approval-submitter:${node.id}:${dto.decision}:${Date.now()}`,
      });
    }

    // Real-time broadcasts
    this.gateway?.broadcastToProject(node.projectId, 'node:updated', updated);
    this.gateway?.broadcastToNode(node.id, 'node:updated', updated);

    return updated;
  }

  async getReviewQueue(actorId: string, workspaceId?: string, projectId?: string) {
    const memberships = await (this.prisma.membership || (this.prisma as any).workspaceMember).findMany({
      where: { userId: actorId },
    });
    const projectMembers = this.prisma.projectMember
      ? await this.prisma.projectMember.findMany({ where: { userId: actorId } })
      : [];
    const teamMembers = this.prisma.teamMember
      ? await this.prisma.teamMember.findMany({ where: { userId: actorId } })
      : [];

    const isWsAdmin = memberships.some((m: any) => m.role === 'ADMIN');
    const isWsManager = memberships.some((m: any) => m.role === 'MANAGER');
    const managedProjectIds = projectMembers
      .filter((pm: any) => pm.role === 'MANAGER' || pm.role === 'ADMIN')
      .map((pm: any) => pm.projectId);
    const ledTeamIds = teamMembers
      .filter((tm: any) => tm.role === 'lead')
      .map((tm: any) => tm.teamId);

    const isTeamLead = ledTeamIds.length > 0;

    // Platform Admins, Managers, and Team Leads have a review queue
    if (!isWsAdmin && !isWsManager && managedProjectIds.length === 0 && !isTeamLead) {
      return [];
    }

    const where: any = {
      approvalStatus: 'pending',
      deletedAt: null,
    };
    if (workspaceId) where.workspaceId = workspaceId;
    if (projectId) where.projectId = projectId;

    const pendingNodes = await this.prisma.node.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        workspace: { select: { id: true, name: true } },
        nodeType: true,
        status: true,
        owner: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        submitter: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        assignedBy: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        team: { select: { id: true, name: true, colour: true } },
        approvals: {
          orderBy: { decidedAt: 'desc' },
          include: {
            reviewer: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          },
        },
        remarks: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            author: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return pendingNodes.filter((node) => {
      // Reviewer cannot be submitter or assignee (unless Platform Admin overseeing)
      if (!isWsAdmin && (node.ownerId === actorId || node.submitterId === actorId)) {
        return false;
      }
      const teamEligible = node.teamId && ledTeamIds.includes(node.teamId);
      const projectEligible = managedProjectIds.includes(node.projectId);
      const wsEligible = isWsManager || isWsAdmin;
      return teamEligible || projectEligible || wsEligible;
    });
  }

  async submitTask(nodeId: string, actorId: string, notes?: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('Task not found');
    }

    if (node.approvalStatus === 'pending') {
      throw new BadRequestException('Task is already pending approval.');
    }

    // Only the assigned user, a Manager, or an Admin can submit work for review
    if (node.ownerId && node.ownerId !== actorId) {
      const membership = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: node.workspaceId, userId: actorId } },
      });
      if (membership?.role !== Role.ADMIN && membership?.role !== Role.MANAGER) {
        throw new ForbiddenException('Forbidden: Only the task assignee, a manager, or admin can submit work for review.');
      }
    }

    const updated = await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        approvalStatus: 'pending',
        submitterId: actorId,
        submittedAt: new Date(),
        version: { increment: 1 },
      },
      include: {
        nodeType: true,
        status: true,
        owner: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        reviewer: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        assignedBy: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        submitter: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        team: { select: { id: true, name: true, colour: true } },
        approvals: {
          orderBy: { decidedAt: 'desc' },
          include: {
            reviewer: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
            submitter: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
          },
        },
      },
    });

    if (this.auditService) {
      await this.auditService.log({
        workspaceId: node.workspaceId,
        projectId: node.projectId,
        entityName: 'Node',
        entityId: node.id,
        actorId,
        action: 'TASK_SUBMISSION',
        oldValues: { approvalStatus: node.approvalStatus },
        newValues: { approvalStatus: 'pending', submitterId: actorId, notes },
      });
    } else {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: node.workspaceId,
          projectId: node.projectId,
          entityName: 'Node',
          entityId: node.id,
          actorId,
          action: 'TASK_SUBMISSION',
          oldValues: { approvalStatus: node.approvalStatus },
          newValues: { approvalStatus: 'pending', submitterId: actorId, notes },
        },
      }).catch(() => null);
    }

    if (notes) {
      await this.prisma.remark.create({
        data: {
          workspaceId: node.workspaceId,
          nodeId: node.id,
          authorId: actorId,
          body: `📬 **Task Submitted for Review**\n${notes}`,
        },
      }).catch(() => null);
    }

    if (node.reviewerId && node.reviewerId !== actorId) {
      await this.safeNotify({
        workspaceId: node.workspaceId,
        projectId: node.projectId,
        userId: node.reviewerId,
        actorId,
        type: 'APPROVAL_REQUEST',
        title: `📬 Task Submitted for Approval: ${node.title}`,
        body: `Task "${node.title}" has been submitted for your review.`,
        entityType: 'node',
        entityId: node.id,
        dedupKey: `submit:${node.id}:${Date.now()}`,
      });
    } else if (!node.reviewerId) {
      // If no explicit reviewer is designated, notify team lead(s) or project manager(s)
      const eligibleReviewerIds = new Set<string>();
      if (node.teamId && typeof this.prisma.teamMember?.findMany === 'function') {
        try {
          const teamLeadsRes = this.prisma.teamMember.findMany({
            where: { teamId: node.teamId, role: 'lead' },
            select: { userId: true },
          });
          const teamLeads = (teamLeadsRes && typeof teamLeadsRes.catch === 'function')
            ? await teamLeadsRes.catch(() => [])
            : (teamLeadsRes ? await teamLeadsRes : []);
          for (const tl of teamLeads || []) {
            if (tl?.userId && tl.userId !== actorId) eligibleReviewerIds.add(tl.userId);
          }
        } catch {
          // ignore lookup errors
        }
      }
      if (eligibleReviewerIds.size === 0 && typeof this.prisma.projectMember?.findMany === 'function') {
        try {
          const projManagersRes = this.prisma.projectMember.findMany({
            where: { projectId: node.projectId, role: 'MANAGER' },
            select: { userId: true },
          });
          const projManagers = (projManagersRes && typeof projManagersRes.catch === 'function')
            ? await projManagersRes.catch(() => [])
            : (projManagersRes ? await projManagersRes : []);
          for (const pm of projManagers || []) {
            if (pm?.userId && pm.userId !== actorId) eligibleReviewerIds.add(pm.userId);
          }
        } catch {
          // ignore lookup errors
        }
      }
      for (const revId of eligibleReviewerIds) {
        await this.safeNotify({
          workspaceId: node.workspaceId,
          projectId: node.projectId,
          userId: revId,
          actorId,
          type: 'APPROVAL_REQUEST',
          title: `📬 Task Submitted for Approval: ${node.title}`,
          body: `Task "${node.title}" has been submitted for your review.`,
          entityType: 'node',
          entityId: node.id,
          dedupKey: `submit:${node.id}:${revId}:${Date.now()}`,
        });
      }
    }

    this.gateway?.broadcastToProject(node.projectId, 'node:updated', updated);
    this.gateway?.broadcastToNode(node.id, 'node:updated', updated);

    return updated;
  }

  async getTaskApprovals(nodeId: string) {
    return this.prisma.taskApproval.findMany({
      where: { nodeId },
      orderBy: { decidedAt: 'desc' },
      include: {
        submitter: {
          select: { id: true, fullName: true, avatarUrl: true, email: true },
        },
        reviewer: {
          select: { id: true, fullName: true, avatarUrl: true, email: true },
        },
      },
    });
  }

  async reportBlocker(nodeId: string, actorId: string, dto: ReportBlockerDto) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        nodeType: {
          include: {
            statusSet: {
              include: { statuses: true },
            },
          },
        },
        status: true,
      },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    let blockedStatusId = dto.blockerStatusId;
    if (!blockedStatusId && node.nodeType?.statusSet?.statuses) {
      const blockedStatus = node.nodeType.statusSet.statuses.find(
        (s) => s.category === 'blocked'
      );
      if (blockedStatus) {
        blockedStatusId = blockedStatus.id;
      }
    }

    const updated = await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        ...(blockedStatusId && { statusId: blockedStatusId }),
        version: { increment: 1 },
      },
      include: {
        nodeType: true,
        status: true,
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
        reviewer: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    if (this.auditService) {
      await this.auditService.log({
        workspaceId: node.workspaceId,
        projectId: node.projectId,
        entityName: 'Node',
        entityId: node.id,
        actorId,
        action: 'BLOCKER_REPORTED',
        oldValues: { statusId: node.statusId },
        newValues: { statusId: updated.statusId, reason: dto.reason },
      });
    } else {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: node.workspaceId,
          projectId: node.projectId,
          entityName: 'Node',
          entityId: node.id,
          actorId,
          action: 'BLOCKER_REPORTED',
          oldValues: { statusId: node.statusId },
          newValues: { statusId: updated.statusId, reason: dto.reason },
        },
      }).catch(() => null);
    }

    await this.prisma.remark.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId: node.id,
        authorId: actorId,
        body: `🚫 **Blocker Reported**: Task is actively blocked.\n**Reason**: ${dto.reason}`,
      },
    }).catch(() => null);

    // Notify owner and reviewer
    const blockerRecipients = new Set<string>();
    if (node.ownerId && node.ownerId !== actorId) blockerRecipients.add(node.ownerId);
    if (node.reviewerId && node.reviewerId !== actorId) blockerRecipients.add(node.reviewerId);
    for (const recipientId of blockerRecipients) {
      await this.notificationsService?.sendNotification({
        workspaceId: node.workspaceId,
        projectId: node.projectId,
        userId: recipientId,
        actorId,
        type: 'BLOCKER',
        title: `🚫 Blocker Reported: ${node.title}`,
        body: `Task "${node.title}" is blocked: ${dto.reason}`,
        entityType: 'node',
        entityId: node.id,
        dedupKey: `blocker:${node.id}:${Date.now()}`,
      });
    }

    // Real-time broadcasts
    this.gateway?.broadcastToProject(node.projectId, 'node:updated', updated);
    this.gateway?.broadcastToProject(node.projectId, 'node:blocked', { nodeId: node.id, reason: dto.reason });
    this.gateway?.broadcastToNode(node.id, 'node:updated', updated);

    return updated;
  }

  async requestDeadlineExtension(nodeId: string, actorId: string, dto: RequestDeadlineExtensionDto) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    const oldDueDate = node.dueDate;
    const newDueDate = new Date(dto.newDueDate);
    if (isNaN(newDueDate.getTime())) {
      throw new BadRequestException('Invalid date format for newDueDate');
    }

    const updated = await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        dueDate: newDueDate,
        version: { increment: 1 },
      },
      include: {
        nodeType: true,
        status: true,
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
        reviewer: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    if (this.auditService) {
      await this.auditService.log({
        workspaceId: node.workspaceId,
        projectId: node.projectId,
        entityName: 'Node',
        entityId: node.id,
        actorId,
        action: 'DEADLINE_CHANGE',
        oldValues: { dueDate: oldDueDate },
        newValues: { dueDate: newDueDate, justification: dto.justification },
      });
    } else {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: node.workspaceId,
          projectId: node.projectId,
          entityName: 'Node',
          entityId: node.id,
          actorId,
          action: 'DEADLINE_CHANGE',
          oldValues: { dueDate: oldDueDate },
          newValues: { dueDate: newDueDate, justification: dto.justification },
        },
      }).catch(() => null);
    }

    await this.prisma.remark.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId: node.id,
        authorId: actorId,
        body: `📅 **Deadline Extension Applied**: Due date moved to ${newDueDate.toLocaleDateString()}.\n**Justification**: ${dto.justification}`,
      },
    }).catch(() => null);

    // Real-time broadcast
    this.gateway?.broadcastToProject(node.projectId, 'node:updated', updated);
    this.gateway?.broadcastToNode(node.id, 'node:updated', updated);

    return updated;
  }
}
