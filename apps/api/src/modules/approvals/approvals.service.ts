import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthorizationService } from '../auth/authorization.service';
import {
  matchApprovalPolicy,
  validateApproverEligibility,
  evaluateStageProgress,
  APPROVAL_OUTCOMES,
  STAGE_RULES,
  PRIVILEGED_OPERATIONS,
  PrivilegedOperation,
  TASK_LIFECYCLE_STATES,
  isComplexApproval,
  HIGH_VALUE_APPROVAL_THRESHOLD,
} from '@flowtrack/shared';

export interface CreatePolicyStageDto {
  stageOrder: number;
  name: string;
  description?: string;
  mode?: 'SEQUENTIAL' | 'PARALLEL';
  rule?: 'ALL_MUST_APPROVE' | 'ANY_ONE_APPROVES' | 'OPTIONAL' | 'CONDITIONAL';
  condition?: any;
  approverRole?: string;
  specificApproverId?: string;
  backupApproverId?: string;
  allowDelegation?: boolean;
  dueDurationHours?: number;
  escalateAfterHours?: number;
  escalateToUserId?: string;
}

export interface CreateApprovalPolicyDto {
  name: string;
  description?: string;
  isDefault?: boolean;
  taskType?: string;
  projectClassification?: any;
  riskImpact?: string;
  budgetThreshold?: number;
  confidentiality?: any;
  departmentId?: string;
  operationType?: string;
  stages: CreatePolicyStageDto[];
}

export interface CreateApprovalRequestDto {
  projectId?: string;
  nodeId?: string;
  submissionId?: string;
  submissionVersion?: number;
  operationType?: string;
  payload?: any;
  targetApproverId?: string;
  chosenApproverId?: string;
  reason?: string;
  notes?: string;
  fileIds?: string[];
  attachmentIds?: string[];
  files?: any[];
}

export interface SubmitDecisionDto {
  decision: 'Approved' | 'Rejected' | 'Changes Requested' | 'Withdrawn';
  comment?: string;
  stageInstanceId?: string;
  isEmergencyOverride?: boolean;
  emergencyJustification?: string;
}

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly authService: AuthorizationService
  ) {}

  async resolveWorkspaceForNode(nodeId: string): Promise<string | null> {
    try {
      const node = await this.prisma.node.findUnique({
        where: { id: nodeId },
        select: { workspaceId: true },
      });
      return node?.workspaceId || null;
    } catch {
      return null;
    }
  }

  /**
   * Creates a versioned approval policy with stages.
   */
  async createPolicy(workspaceId: string, actorId: string, dto: CreateApprovalPolicyDto) {
    if (!dto.stages || dto.stages.length === 0) {
      throw new BadRequestException('Approval policy must define at least one stage.');
    }

    const created = await this.prisma.approvalPolicy.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description || null,
        version: 1,
        isDefault: dto.isDefault ?? false,
        taskType: dto.taskType || null,
        projectClassification: dto.projectClassification || null,
        riskImpact: dto.riskImpact || null,
        budgetThreshold: dto.budgetThreshold ? dto.budgetThreshold : null,
        confidentiality: dto.confidentiality || null,
        departmentId: dto.departmentId || null,
        operationType: dto.operationType || 'TASK_COMPLETION',
        stages: {
          create: dto.stages.map((s, idx) => ({
            stageOrder: s.stageOrder ?? idx + 1,
            name: s.name,
            description: s.description || null,
            mode: s.mode || 'SEQUENTIAL',
            rule: s.rule || 'ANY_ONE_APPROVES',
            condition: s.condition || {},
            approverRole: s.approverRole || null,
            specificApproverId: s.specificApproverId || null,
            backupApproverId: s.backupApproverId || null,
            allowDelegation: s.allowDelegation ?? true,
            dueDurationHours: s.dueDurationHours || null,
            escalateAfterHours: s.escalateAfterHours || null,
            escalateToUserId: s.escalateToUserId || null,
            policyVersion: 1,
          })),
        },
      },
      include: { stages: true },
    });

    await this.auditService.recordAuditEvent({
      workspaceId,
      actorId,
      action: 'APPROVAL_POLICY_CREATED',
      targetType: 'policy',
      targetId: created.id,
      afterValues: { name: created.name, version: created.version, stageCount: created.stages.length },
      policyReference: `${created.id}:v1`,
      outcome: 'SUCCESS',
    });

    return created;
  }

  /**
   * Updates a policy by publishing a new version, preserving prior versions for pending requests.
   */
  async updatePolicy(policyId: string, workspaceId: string, actorId: string, dto: CreateApprovalPolicyDto) {
    const existing = await this.prisma.approvalPolicy.findUnique({
      where: { id: policyId },
      include: { stages: true },
    });
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new NotFoundException('Approval policy not found');
    }

    const nextVersion = existing.version + 1;

    // Create new version of policy
    const updated = await this.prisma.approvalPolicy.create({
      data: {
        workspaceId,
        name: dto.name || existing.name,
        description: dto.description ?? existing.description,
        version: nextVersion,
        isDefault: dto.isDefault ?? existing.isDefault,
        taskType: dto.taskType ?? existing.taskType,
        projectClassification: dto.projectClassification ?? existing.projectClassification,
        riskImpact: dto.riskImpact ?? existing.riskImpact,
        budgetThreshold: dto.budgetThreshold !== undefined ? dto.budgetThreshold : existing.budgetThreshold,
        confidentiality: dto.confidentiality ?? existing.confidentiality,
        departmentId: dto.departmentId ?? existing.departmentId,
        operationType: dto.operationType ?? existing.operationType,
        stages: {
          create: (dto.stages || existing.stages).map((s, idx) => ({
            stageOrder: s.stageOrder ?? idx + 1,
            name: s.name,
            description: s.description || null,
            mode: s.mode || 'SEQUENTIAL',
            rule: s.rule || 'ANY_ONE_APPROVES',
            condition: s.condition || {},
            approverRole: s.approverRole || null,
            specificApproverId: s.specificApproverId || null,
            backupApproverId: s.backupApproverId || null,
            allowDelegation: s.allowDelegation ?? true,
            dueDurationHours: s.dueDurationHours || null,
            escalateAfterHours: s.escalateAfterHours || null,
            escalateToUserId: s.escalateToUserId || null,
            policyVersion: nextVersion,
          })),
        },
      },
      include: { stages: true },
    });

    await this.auditService.recordAuditEvent({
      workspaceId,
      actorId,
      action: 'APPROVAL_POLICY_VERSION_BUMP',
      targetType: 'policy',
      targetId: updated.id,
      beforeValues: { version: existing.version },
      afterValues: { version: nextVersion, stageCount: updated.stages.length },
      policyReference: `${updated.id}:v${nextVersion}`,
      outcome: 'SUCCESS',
    });

    return updated;
  }

  /**
   * Retrieves policy by ID.
   */
  async getPolicy(policyId: string, workspaceId: string) {
    const policy = await this.prisma.approvalPolicy.findUnique({
      where: { id: policyId },
      include: { stages: { orderBy: { stageOrder: 'asc' } } },
    });
    if (!policy || policy.workspaceId !== workspaceId) {
      throw new NotFoundException('Approval policy not found');
    }
    return policy;
  }

  /**
   * Lists policies in workspace.
   */
  async listPolicies(workspaceId: string, operationType?: string) {
    const where: any = { workspaceId, isActive: true };
    if (operationType) where.operationType = operationType;

    return this.prisma.approvalPolicy.findMany({
      where,
      include: { stages: { orderBy: { stageOrder: 'asc' } } },
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
  }

  /**
   * Retrieves eligible approvers for a given task, project, or workspace.
   */
  async getEligibleApprovers(
    workspaceId: string,
    options: { taskId?: string; projectId?: string; submitterId?: string }
  ) {
    return this.authService.getEligibleApprovers(workspaceId, options);
  }

  /**
   * Creates an approval request bound to a chosen approver (or matched policy version).
   */
  async createApprovalRequest(
    workspaceId: string,
    submitterId: string,
    dto: CreateApprovalRequestDto
  ) {
    // 0. Reason validation: reject missing, empty or too-short reason (trim first)
    const rawReason = dto.reason ?? dto.notes ?? dto.payload?.reason ?? dto.payload?.notes;
    const trimmedReason = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (!trimmedReason || trimmedReason.length < 20) {
      throw new BadRequestException(
        'A reason of at least 20 characters is required for approval requests.'
      );
    }
    if (trimmedReason.length > 1000) {
      throw new BadRequestException('Reason cannot exceed 1000 characters.');
    }

    const fileIds: string[] = Array.isArray(dto.fileIds)
      ? dto.fileIds
      : Array.isArray(dto.attachmentIds)
      ? dto.attachmentIds
      : Array.isArray(dto.payload?.fileIds)
      ? dto.payload.fileIds
      : Array.isArray(dto.payload?.attachmentIds)
      ? dto.payload.attachmentIds
      : [];

    // 1. Fetch resource metadata for policy matching
    let task = null;
    let project = null;
    if (dto.nodeId) {
      task = await this.prisma.node.findUnique({
        where: { id: dto.nodeId },
        include: { project: true, status: true },
      });
      if (!task || task.deletedAt) {
        throw new NotFoundException('Task not found');
      }
      project = task.project;
    } else if (dto.projectId) {
      project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    }

    const opType = dto.operationType || 'TASK_COMPLETION';

    const explicitChosenApprover =
      dto.chosenApproverId ||
      dto.targetApproverId ||
      (dto.payload?.chosenApproverId as string) ||
      (dto.payload?.targetApproverId as string) ||
      (dto.payload?.approverId as string);

    // =========================================================================
    // Primary Flow: Single Chosen-Approver Request
    // =========================================================================
    if (explicitChosenApprover) {
      // Rule 1: Separation of duties
      if (explicitChosenApprover === submitterId) {
        throw new ForbiddenException(
          'Separation of duties violation: Submitter cannot select themselves as the approver.'
        );
      }
      if (task?.ownerId && explicitChosenApprover === task.ownerId) {
        throw new ForbiddenException(
          'Separation of duties violation: Task assignee cannot be their own approver.'
        );
      }

      // Validate eligibility via authorization service
      if (this.authService?.getEligibleApprovers) {
        const eligible = await this.authService.getEligibleApprovers(workspaceId, {
          taskId: task?.id,
          projectId: project?.id,
          submitterId,
        });
        const eligibleIds = eligible.map((e) => e.id);
        if (!eligibleIds.includes(explicitChosenApprover)) {
          throw new ForbiddenException(
            'Selected user is not an authorized eligible approver for this task.'
          );
        }
      }

      const submissionVersion = dto.submissionVersion || 1;

      // Auto-ensure chosen approver has workspace membership and limited project membership
      if (this.prisma.membership) {
        const approverWsMem = await this.prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: explicitChosenApprover } },
        });
        if (!approverWsMem && typeof this.prisma.membership?.create === 'function') {
          await this.prisma.membership.create({
            data: {
              workspaceId,
              userId: explicitChosenApprover,
              role: Role.MEMBER,
            },
          }).catch(() => null);
        }
      }

      if (project?.id && this.prisma.projectMember) {
        const approverProjMem = await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: project.id, userId: explicitChosenApprover } },
        });
        if (!approverProjMem && typeof this.prisma.projectMember?.create === 'function') {
          await this.prisma.projectMember.create({
            data: {
              projectId: project.id,
              userId: explicitChosenApprover,
              role: Role.GUEST,
            },
          }).catch(() => null);
        }
      }

      // Find or create default policy container for single chosen-approver request
      let activePolicy = this.prisma.approvalPolicy?.findFirst
        ? await this.prisma.approvalPolicy.findFirst({
            where: { workspaceId, isActive: true },
            orderBy: { version: 'desc' },
          })
        : (await this.prisma.approvalPolicy?.findMany?.({ where: { workspaceId, isActive: true } }))?.[0];
      if (!activePolicy) {
        activePolicy = await this.prisma.approvalPolicy.create({
          data: {
            workspaceId,
            name: 'Single Chosen-Approver Flow',
            version: 1,
            isDefault: true,
            isActive: true,
          },
        });
      }

      const request = await this.prisma.$transaction(async (tx) => {
        const createdReq = await tx.approvalRequest.create({
          data: {
            workspaceId,
            projectId: project?.id || null,
            nodeId: task?.id || null,
            submissionId: dto.submissionId || null,
            submissionVersion,
            operationType: opType,
            policyId: activePolicy.id,
            policyVersion: activePolicy.version,
            submitterId,
            status: 'PENDING',
            currentStageIndex: 0,
            payload: {
              ...(dto.payload || {}),
              subject: task?.title || 'Task Approval',
              reason: trimmedReason,
              notes: trimmedReason,
              fileIds,
              chosenApproverId: explicitChosenApprover,
            },
            stageInstances: {
              create: [
                {
                  stageOrder: 1,
                  name: 'Review & Sign-Off',
                  mode: 'SEQUENTIAL',
                  rule: 'ANY_ONE_APPROVES',
                  status: 'PENDING',
                  primaryApproverId: explicitChosenApprover,
                  assignedApproverIds: [explicitChosenApprover],
                },
              ],
            },
          },
          include: {
            stageInstances: { orderBy: { stageOrder: 'asc' } },
            policy: true,
          },
        });

        if (task) {
          await tx.node.update({
            where: { id: task.id },
            data: {
              approvalStatus: 'pending',
              submitterId,
              submittedAt: new Date(),
              reviewerId: explicitChosenApprover,
              customData: {
                ...(typeof task.customData === 'object' && task.customData !== null ? task.customData : {}),
                approvalReason: trimmedReason,
                approvalFileIds: fileIds,
              },
            },
          });
        }

        if (fileIds.length > 0 && tx.evidence?.updateMany) {
          await tx.evidence.updateMany({
            where: { id: { in: fileIds } },
            data: { approvalRequestId: createdReq.id },
          }).catch(() => null);
        }

        if (task && tx.remark?.create) {
          await tx.remark.create({
            data: {
              workspaceId,
              nodeId: task.id,
              authorId: submitterId,
              body: `📋 **Approval Request Submitted**\n**Reason**: ${trimmedReason}${fileIds.length > 0 ? `\n**Attached Files**: ${fileIds.length} file(s)` : ''}`,
            },
          }).catch(() => null);
        }

        return createdReq;
      });

      // Record audit event
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId: submitterId,
        action: 'APPROVAL_REQUEST_CREATED',
        targetType: 'approval_request',
        targetId: request.id,
        afterValues: {
          operationType: opType,
          chosenApproverId: explicitChosenApprover,
          submissionVersion,
          stageCount: 1,
        },
        policyReference: `${activePolicy.id}:v${activePolicy.version}`,
        outcome: 'SUCCESS',
      });

      // Send notification to the chosen approver
      if (this.notificationsService?.sendNotification) {
        await this.notificationsService.sendNotification({
          workspaceId,
          projectId: project?.id || undefined,
          userId: explicitChosenApprover,
          actorId: submitterId,
          type: 'APPROVAL_REQUEST',
          title: `Approval Requested: ${task?.title || opType}`,
          body: `You have been selected as the approver for "${task?.title || opType}".`,
          entityType: 'approval_request',
          entityId: request.id,
        }).catch(() => null);
      }

      return request;
    }

    // =========================================================================
    // [LEGACY / UNUSED] Multi-stage policy routing - kept for backwards compatibility
    // =========================================================================
    // RBAC: Check submitter role constraints
    const submitterMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: submitterId } },
    });
    const submitterRole = submitterMembership?.role || 'MEMBER';

    // Member: can ONLY request approval to the person who assigned them that task (or parent owner)
    if (submitterRole === 'MEMBER') {
      const explicitApprover = (dto.payload?.targetApproverId || dto.payload?.approverId) as string | undefined;
      const assignerId = task?.assignedById;

      let parentOwnerId: string | null = null;
      if (task?.parentNodeId) {
        const parent = await this.prisma.node.findUnique({
          where: { id: task.parentNodeId },
          select: { ownerId: true, assignedById: true },
        });
        parentOwnerId = parent?.ownerId || parent?.assignedById || null;
      }

      const validAssigners = [assignerId, parentOwnerId].filter(Boolean) as string[];

      if (explicitApprover && validAssigners.length > 0 && !validAssigners.includes(explicitApprover)) {
        throw new ForbiddenException(
          'Forbidden: Members can only request approval from the person who assigned them the task.'
        );
      }
    }

    // 2. Query candidate active policies
    const candidatePolicies = await this.prisma.approvalPolicy.findMany({
      where: { workspaceId, isActive: true },
      include: { stages: { orderBy: { stageOrder: 'asc' } } },
      orderBy: { version: 'desc' },
    });

    const matchedPolicy = matchApprovalPolicy(candidatePolicies, {
      workspaceId,
      operationType: opType,
      taskType: task?.nodeTypeId || null,
      projectClassification: project?.classification || null,
      riskImpact: (dto.payload?.riskImpact as string) || null,
      budgetThreshold: dto.payload?.budget ? Number(dto.payload.budget) : (task?.estimatedCost ? Number(task.estimatedCost) : null),
      confidentiality: task?.classification || project?.classification || null,
      departmentId: project?.departmentId || null,
    });

    if (!matchedPolicy || matchedPolicy.stages.length === 0) {
      throw new BadRequestException(`No active approval policy found for operation "${opType}".`);
    }

    const submissionVersion = dto.submissionVersion || 1;

    // 3. Create ApprovalRequest and instances within transaction
    const request = await this.prisma.$transaction(async (tx) => {
      const createdReq = await tx.approvalRequest.create({
        data: {
          workspaceId,
          projectId: project?.id || null,
          nodeId: task?.id || null,
          submissionId: dto.submissionId || null,
          submissionVersion,
          operationType: opType,
          policyId: matchedPolicy.id,
          policyVersion: matchedPolicy.version,
          submitterId,
          status: 'PENDING',
          currentStageIndex: 0,
          payload: {
            ...(dto.payload || {}),
            subject: task?.title || 'Task Approval',
            reason: trimmedReason,
            notes: trimmedReason,
            fileIds,
          },
          stageInstances: {
            create: matchedPolicy.stages.map((stage) => {
              const assignedIds: string[] = [];
              if (stage.specificApproverId) assignedIds.push(stage.specificApproverId);
              if (stage.backupApproverId) assignedIds.push(stage.backupApproverId);

              // If task reviewer assigned, add to stage 1
              if (stage.stageOrder === 1 && task?.reviewerId && !assignedIds.includes(task.reviewerId)) {
                assignedIds.push(task.reviewerId);
              }

              return {
                stageOrder: stage.stageOrder,
                name: stage.name,
                mode: stage.mode,
                rule: stage.rule,
                status: 'PENDING',
                assignedApproverIds: assignedIds,
                primaryApproverId: stage.specificApproverId || (stage.stageOrder === 1 ? task?.reviewerId : null),
                backupApproverId: stage.backupApproverId || null,
              };
            }),
          },
        },
        include: {
          stageInstances: { orderBy: { stageOrder: 'asc' } },
          policy: true,
        },
      });

      if (task) {
        await tx.node.update({
          where: { id: task.id },
          data: {
            approvalStatus: 'pending',
            submitterId,
            submittedAt: new Date(),
            customData: {
              ...(typeof task.customData === 'object' && task.customData !== null ? task.customData : {}),
              approvalReason: trimmedReason,
              approvalFileIds: fileIds,
            },
          },
        });
      }

      if (fileIds.length > 0 && tx.evidence?.updateMany) {
        await tx.evidence.updateMany({
          where: { id: { in: fileIds } },
          data: { approvalRequestId: createdReq.id },
        }).catch(() => null);
      }

      return createdReq;
    });

    // 4. Record audit event
    await this.auditService.recordAuditEvent({
      workspaceId,
      actorId: submitterId,
      action: 'APPROVAL_REQUEST_CREATED',
      targetType: 'approval_request',
      targetId: request.id,
      afterValues: {
        operationType: opType,
        policyId: matchedPolicy.id,
        policyVersion: matchedPolicy.version,
        submissionVersion,
        stageCount: request.stageInstances.length,
      },
      policyReference: `${matchedPolicy.id}:v${matchedPolicy.version}`,
      outcome: 'SUCCESS',
    });

    return request;
  }

  /**
   * Submits a formal decision on an approval request.
   * Enforces server-side separation of duties, delegation, and idempotent state handling.
   */
  async submitDecision(
    requestId: string,
    workspaceId: string,
    actorId: string,
    dto: SubmitDecisionDto
  ) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: {
        stageInstances: { orderBy: { stageOrder: 'asc' } },
        decisions: true,
        node: true,
      },
    });

    if (!request || request.workspaceId !== workspaceId) {
      throw new NotFoundException('Approval request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Approval request is already in final status "${request.status}".`);
    }

    // Identify current stage instance
    const currentStage =
      (dto.stageInstanceId
        ? request.stageInstances.find((s) => s.id === dto.stageInstanceId)
        : request.stageInstances[request.currentStageIndex]) || request.stageInstances[0];

    if (!currentStage) {
      throw new BadRequestException('No active approval stage found for this request.');
    }

    // Decision validation: rejection and rework require mandatory comment
    if (
      (dto.decision === APPROVAL_OUTCOMES.REJECTED || dto.decision === APPROVAL_OUTCOMES.CHANGES_REQUESTED) &&
      (!dto.comment || dto.comment.trim().length === 0)
    ) {
      throw new BadRequestException(
        `Providing an explicit reason/comment is mandatory when decision is "${dto.decision}".`
      );
    }

    // Check separation of duties and approver eligibility
    const actorMembership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorId } },
    });
    const userRole = actorMembership?.role || 'MEMBER';

    // Self-approval is strictly forbidden
    if (request.submitterId === actorId) {
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId,
        action: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
        targetType: 'approval_request',
        targetId: requestId,
        reason: 'Self-approval is forbidden: You cannot approve your own request.',
        policyReference: `${request.policyId}:v${request.policyVersion}`,
        outcome: 'BLOCKED',
      }).catch(() => null);
      throw new ForbiddenException('Self-approval is forbidden: You cannot approve your own request.');
    }

    // Members cannot approve
    if (userRole === 'MEMBER') {
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId,
        action: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
        targetType: 'approval_request',
        targetId: requestId,
        reason: 'Forbidden: Members cannot approve or reject approval requests.',
        policyReference: `${request.policyId}:v${request.policyVersion}`,
        outcome: 'BLOCKED',
      }).catch(() => null);
      throw new ForbiddenException('Forbidden: Members cannot approve or reject approval requests.');
    }

    // High-value and complex approval escalation rule
    const task = (request as any).node;
    const amountVal = (request.payload as any)?.amount ?? (request.payload as any)?.budget ?? (task?.estimatedCost ? Number(task.estimatedCost) : undefined);
    const opType = request.operationType || ((request.payload as any)?.type as string) || '';
    const isEscalated = isComplexApproval(opType, amountVal);

    if (isEscalated && userRole !== 'ADMIN') {
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId,
        action: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
        targetType: 'approval_request',
        targetId: requestId,
        reason: 'Needs Admin approval: High-value and complex approval requests can only be approved by an Admin.',
        policyReference: `${request.policyId}:v${request.policyVersion}`,
        outcome: 'BLOCKED',
      });
      throw new ForbiddenException(
        'Needs Admin approval: High-value and complex approval requests can only be approved by an Admin.'
      );
    }

    const previousDecisions = request.decisions.map((d) => {
      const stage = request.stageInstances.find((s) => s.id === d.stageInstanceId);
      return {
        approverId: d.approverId,
        stageOrder: stage ? stage.stageOrder : 1,
        decision: d.decision,
      };
    });

    const eligibility = validateApproverEligibility({
      requestSubmitterId: request.submitterId,
      actingUserId: actorId,
      stageApproverRole: (currentStage as any).approverRole || null,
      stageSpecificApproverId: (currentStage as any).specificApproverId || null,
      stagePrimaryApproverId: currentStage.primaryApproverId,
      stageBackupApproverId: currentStage.backupApproverId,
      stageDelegatedApproverId: currentStage.delegatedApproverId,
      assignedApproverIds: (currentStage.assignedApproverIds as string[]) || [],
      userRoles: [userRole],
      isEmergencyOverride: dto.isEmergencyOverride,
      emergencyJustification: dto.emergencyJustification,
      hasPrivilegedPermission: userRole === 'ADMIN',
      previousStageDecisions: previousDecisions,
      currentStageOrder: currentStage.stageOrder,
    });

    if (!eligibility.isEligible) {
      // Record security event audit
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId,
        action: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
        targetType: 'approval_request',
        targetId: requestId,
        reason: eligibility.reason,
        policyReference: `${request.policyId}:v${request.policyVersion}`,
        outcome: 'BLOCKED',
      });

      if (eligibility.statusCode === 403) {
        throw new ForbiddenException(eligibility.reason);
      }
      throw new BadRequestException(eligibility.reason);
    }

    // Record decision and evaluate stage progression in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Check for duplicate decision on this submission version
      const existingDecision = await tx.approvalDecision.findUnique({
        where: {
          approvalRequestId_approverId_submissionVersion: {
            approvalRequestId: requestId,
            approverId: actorId,
            submissionVersion: request.submissionVersion,
          },
        },
      });

      if (existingDecision) {
        throw new ConflictException(
          'Duplicate decision: You have already submitted a decision for this submission version.'
        );
      }

      // 2. Create approval decision
      const decision = await tx.approvalDecision.create({
        data: {
          approvalRequestId: requestId,
          stageInstanceId: currentStage.id,
          approverId: actorId,
          delegatedFromUserId: eligibility.isDelegated ? currentStage.primaryApproverId : null,
          decision: dto.decision,
          comment: dto.comment || null,
          policyVersion: request.policyVersion,
          submissionVersion: request.submissionVersion,
        },
      });

      // 3. Handle explicit rejection or rework
      if (dto.decision === APPROVAL_OUTCOMES.REJECTED) {
        await tx.approvalStageInstance.update({
          where: { id: currentStage.id },
          data: { status: 'REJECTED' },
        });

        await tx.approvalRequest.update({
          where: { id: requestId },
          data: { status: 'REJECTED' },
        });

        if (request.nodeId) {
          await tx.node.update({
            where: { id: request.nodeId },
            data: {
              state: 'Rejected',
              approvalStatus: 'rejected',
              approvalFeedback: dto.comment,
            },
          }).catch(() => null);
        }

        return { requestStatus: 'REJECTED', decision };
      }

      if (dto.decision === APPROVAL_OUTCOMES.CHANGES_REQUESTED) {
        await tx.approvalStageInstance.update({
          where: { id: currentStage.id },
          data: { status: 'CHANGES_REQUESTED' },
        });

        await tx.approvalRequest.update({
          where: { id: requestId },
          data: { status: 'CHANGES_REQUESTED' },
        });

        if (request.nodeId) {
          await tx.node.update({
            where: { id: request.nodeId },
            data: {
              state: TASK_LIFECYCLE_STATES.CHANGES_REQUESTED,
              approvalStatus: 'changes_requested',
              approvalFeedback: dto.comment,
            },
          });
        }

        return { requestStatus: 'CHANGES_REQUESTED', decision };
      }

      // 4. Handle Approved decision
      const currentStageDecisions = await tx.approvalDecision.findMany({
        where: { stageInstanceId: currentStage.id, submissionVersion: request.submissionVersion },
      });

      const stageEval = evaluateStageProgress({
        rule: currentStage.rule,
        assignedApproverIds: (currentStage.assignedApproverIds as string[]) || [],
        decisions: currentStageDecisions.map((d) => ({ approverId: d.approverId, decision: d.decision })),
        payload: request.payload,
      });

      let updatedReqStatus = 'PENDING';
      if (stageEval.isSatisfied) {
        await tx.approvalStageInstance.update({
          where: { id: currentStage.id },
          data: { status: 'APPROVED' },
        });

        // Check if subsequent stages exist
        const nextStageIndex = request.currentStageIndex + 1;
        if (nextStageIndex < request.stageInstances.length) {
          await tx.approvalRequest.update({
            where: { id: requestId },
            data: { currentStageIndex: nextStageIndex },
          });
        } else {
          // All stages satisfied! Request is APPROVED
          updatedReqStatus = 'APPROVED';
          await tx.approvalRequest.update({
            where: { id: requestId },
            data: { status: 'APPROVED' },
          });

          // Apply privileged operation payload atomically
          await this.applyApprovedOperation(tx, request);
        }
      }

      return { requestStatus: updatedReqStatus, decision };
    });

    // Post-action: Audit event
    await this.auditService.recordAuditEvent({
      workspaceId,
      actorId,
      action: dto.isEmergencyOverride ? 'EMERGENCY_OVERRIDE_DECISION' : 'APPROVAL_DECISION_SUBMITTED',
      targetType: 'approval_request',
      targetId: requestId,
      reason: dto.comment || dto.emergencyJustification || null,
      policyReference: `${request.policyId}:v${request.policyVersion}`,
      outcome: result.requestStatus,
      afterValues: {
        decision: dto.decision,
        requestStatus: result.requestStatus,
        submissionVersion: request.submissionVersion,
        isEmergencyOverride: dto.isEmergencyOverride,
      },
    });

    // Notify requester of decision
    if (this.notificationsService?.sendNotification && request.submitterId && request.submitterId !== actorId) {
      let deciderName = 'Approver';
      try {
        const decider = await this.prisma.user.findUnique({
          where: { id: actorId },
          select: { fullName: true },
        });
        if (decider?.fullName) deciderName = decider.fullName;
      } catch {}

      const taskTitle = request.node?.title || 'Deliverable';
      const actionText = dto.decision === APPROVAL_OUTCOMES.APPROVED
        ? 'approved'
        : dto.decision === APPROVAL_OUTCOMES.REJECTED
        ? 'rejected'
        : 'requested changes on';
      const reasonText = dto.comment || (dto as any).feedback;

      const decisionTitle = `${deciderName} ${actionText} your request for "${taskTitle}"`;
      const decisionBody = reasonText
        ? `${deciderName} ${actionText} your request for "${taskTitle}". Reason: ${reasonText}`
        : `${deciderName} ${actionText} your request for "${taskTitle}".`;

      await this.notificationsService.sendNotification({
        workspaceId,
        projectId: request.projectId || undefined,
        userId: request.submitterId,
        actorId,
        type: 'APPROVAL_DECISION',
        title: decisionTitle,
        body: decisionBody,
        entityType: 'approval_request',
        entityId: requestId,
      }).catch(() => null);
    }

    return result;
  }

  /**
   * Applies privileged operation changes atomically when approval policy is satisfied.
   */
  private async applyApprovedOperation(tx: any, request: any) {
    const payload = (request.payload as any) || {};

    if (request.nodeId) {
      await tx.node.update({
        where: { id: request.nodeId },
        data: {
          state: TASK_LIFECYCLE_STATES.APPROVED,
          approvalStatus: 'approved',
          approvedAt: new Date(),
        },
      }).catch(() => null);
    }

    if (request.operationType === PRIVILEGED_OPERATIONS.DEADLINE_CHANGE && request.nodeId) {
      if (payload.newDueDate) {
        await tx.node.update({
          where: { id: request.nodeId },
          data: { dueDate: new Date(payload.newDueDate) },
        });
      }
    } else if (request.operationType === PRIVILEGED_OPERATIONS.BUDGET_INCREASE && request.nodeId) {
      if (payload.newBudget !== undefined) {
        await tx.node.update({
          where: { id: request.nodeId },
          data: { estimatedCost: payload.newBudget },
        });
      }
    } else if (request.operationType === PRIVILEGED_OPERATIONS.CONFIDENTIALITY_CHANGE && request.nodeId) {
      if (payload.classification) {
        await tx.node.update({
          where: { id: request.nodeId },
          data: { classification: payload.classification },
        });
      }
    } else if (request.operationType === PRIVILEGED_OPERATIONS.CRITICAL_REASSIGNMENT && request.nodeId) {
      if (payload.newOwnerId) {
        await tx.node.update({
          where: { id: request.nodeId },
          data: { ownerId: payload.newOwnerId, assignedAt: new Date() },
        });
      }
    }
  }

  /**
   * Authorizes delegation of approval authority for a stage instance.
   */
  async findActiveRequestForTask(taskId: string, workspaceId: string) {
    return this.prisma.approvalRequest.findFirst({
      where: { nodeId: taskId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { stageInstances: { orderBy: { stageOrder: 'asc' } } },
    });
  }

  async submitTaskDirectDecision(
    taskId: string,
    workspaceId: string,
    actorId: string,
    dto: { decision: string; comment?: string }
  ) {
    const node = await this.prisma.node.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!node || node.deletedAt) throw new NotFoundException('Task not found');

    if (node.submitterId === actorId || node.ownerId === actorId) {
      throw new ForbiddenException('Separation of duties violation: Submitter cannot approve their own submission.');
    }

    if (
      (dto.decision === APPROVAL_OUTCOMES.REJECTED || dto.decision === APPROVAL_OUTCOMES.CHANGES_REQUESTED) &&
      (!dto.comment || !dto.comment.trim())
    ) {
      throw new BadRequestException(`A valid reason or comment is required when decision is "${dto.decision}".`);
    }

    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: node.workspaceId, userId: actorId } },
    });
    const isLeadOrManager = membership?.role === Role.ADMIN || membership?.role === Role.MANAGER || membership?.role === Role.TEAM_LEAD;
    if (!isLeadOrManager) {
      throw new ForbiddenException('Unauthorized: You are not authorized to make decisions on this task.');
    }

    const taskCost = node.estimatedCost ? Number(node.estimatedCost) : (node.actualCost ? Number(node.actualCost) : undefined);
    const isHighValue = isComplexApproval(node.approvalStatus, taskCost);
    if (isHighValue && membership?.role !== Role.ADMIN) {
      throw new ForbiddenException('Needs Admin approval: High-value and complex approval requests can only be approved by an Admin.');
    }

    let targetState: string = TASK_LIFECYCLE_STATES.APPROVED;
    let approvalStatus = 'approved';
    if (dto.decision === APPROVAL_OUTCOMES.CHANGES_REQUESTED) {
      targetState = TASK_LIFECYCLE_STATES.CHANGES_REQUESTED;
      approvalStatus = 'changes_requested';
    } else if (dto.decision === APPROVAL_OUTCOMES.REJECTED) {
      targetState = TASK_LIFECYCLE_STATES.BLOCKED;
      approvalStatus = 'rejected';
    }

    const updated = await this.prisma.node.update({
      where: { id: taskId },
      data: {
        state: targetState,
        approvalStatus,
        approvalFeedback: dto.comment,
        ...(dto.decision === APPROVAL_OUTCOMES.APPROVED && { approvedAt: new Date() }),
        version: { increment: 1 },
      },
      include: {
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
        assignedBy: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId: node.workspaceId,
        actorId,
        action: 'TASK_APPROVAL_DECISION',
        targetType: 'task',
        targetId: taskId,
        reason: dto.comment,
        outcome: dto.decision,
      });
    }

    return { requestStatus: dto.decision, node: updated };
  }

  async delegateApproval(
    requestId: string,
    workspaceId: string,
    delegatorUserId: string,
    delegateUserId: string,
    reason?: string
  ) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { stageInstances: { orderBy: { stageOrder: 'asc' } } },
    });
    if (!request || request.workspaceId !== workspaceId) {
      throw new NotFoundException('Approval request not found');
    }

    const currentStage = request.stageInstances[request.currentStageIndex];
    if (!currentStage) {
      throw new BadRequestException('No active stage found for delegation.');
    }

    await this.prisma.approvalStageInstance.update({
      where: { id: currentStage.id },
      data: { delegatedApproverId: delegateUserId },
    });

    await this.auditService.recordAuditEvent({
      workspaceId,
      actorId: delegatorUserId,
      action: 'APPROVAL_DELEGATION_AUTHORIZED',
      targetType: 'approval_request',
      targetId: requestId,
      afterValues: { delegatorUserId, delegateUserId, stageInstanceId: currentStage.id },
      reason: reason || 'Approver delegation authorized.',
      outcome: 'SUCCESS',
    });

    return { success: true, delegateUserId, stageInstanceId: currentStage.id };
  }

  /**
   * Retrieves an approval request with stage instances, decisions, and history.
   */
  async getApprovalRequest(requestId: string, workspaceId: string) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: {
        stageInstances: { orderBy: { stageOrder: 'asc' } },
        decisions: {
          include: {
            approver: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
            delegatedFromUser: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        policy: { include: { stages: true } },
        node: {
          select: {
            id: true,
            title: true,
            state: true,
            classification: true,
            customData: true,
            documents: { where: { deletedAt: null } },
          },
        },
        submitter: { select: { id: true, fullName: true, email: true } },
        evidence: true,
      },
    });

    if (!request || request.workspaceId !== workspaceId) {
      throw new NotFoundException('Approval request not found');
    }

    const payloadObj = (request.payload as any) || {};
    const reason = payloadObj.reason || payloadObj.notes || (request.node?.customData as any)?.approvalReason || '';
    const fileIds = payloadObj.fileIds || (request.node?.customData as any)?.approvalFileIds || [];
    const sanitizedNode = request.node
      ? {
          ...request.node,
          documents: (request.node.documents || []).map((d: any) => ({
            ...d,
            fileSize: d.fileSize ? Number(d.fileSize) : 0,
          })),
        }
      : null;

    return {
      ...request,
      node: sanitizedNode,
      reason,
      fileIds,
    };
  }

  /**
   * Lists approval requests in workspace.
   */
  async listApprovalRequests(
    workspaceId: string,
    filters?: { status?: string; nodeId?: string; projectId?: string },
    user?: { id?: string; role?: string }
  ) {
    const userRoleUpper = (user?.role || '').toUpperCase();
    const isAdmin = userRoleUpper === 'ADMIN';

    const where: any = { workspaceId };
    if (filters?.status) where.status = filters.status;
    if (filters?.nodeId) where.nodeId = filters.nodeId;
    if (filters?.projectId) where.projectId = filters.projectId;

    if (!isAdmin && user?.id) {
      where.OR = [
        { submitterId: user.id },
        { chosenApproverId: user.id },
        { targetApproverId: user.id },
        { stageInstances: { some: { OR: [{ primaryApproverId: user.id }, { assignedApproverIds: { has: user.id } }] } } },
        { node: { reviewerId: user.id } },
        { node: { backupReviewerId: user.id } },
        { node: { ownerId: user.id } },
      ];
    }

    let requests = await this.prisma.approvalRequest.findMany({
      where,
      include: {
        stageInstances: { orderBy: { stageOrder: 'asc' } },
        decisions: true,
        submitter: { select: { id: true, fullName: true, email: true } },
        node: {
          select: {
            id: true,
            title: true,
            state: true,
            customData: true,
            documents: { where: { deletedAt: null } },
          },
        },
        evidence: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // If no requests found in scoped workspace for user, also check across user's other workspaces
    if (requests.length === 0 && user?.id && this.prisma.membership) {
      const userMems = await this.prisma.membership.findMany({
        where: { userId: user.id },
        select: { workspaceId: true },
      });
      const otherWsIds = userMems.map((m) => m.workspaceId).filter((id) => id !== workspaceId);
      if (otherWsIds.length > 0) {
        const crossWsWhere: any = {
          workspaceId: { in: otherWsIds },
          ...(filters?.status ? { status: filters.status } : {}),
          ...(!isAdmin ? {
            OR: [
              { submitterId: user.id },
              { chosenApproverId: user.id },
              { targetApproverId: user.id },
              { stageInstances: { some: { OR: [{ primaryApproverId: user.id }, { assignedApproverIds: { has: user.id } }] } } },
              { node: { reviewerId: user.id } },
              { node: { backupReviewerId: user.id } },
              { node: { ownerId: user.id } },
            ],
          } : {}),
        };
        const crossRequests = await this.prisma.approvalRequest.findMany({
          where: crossWsWhere,
          include: {
            stageInstances: { orderBy: { stageOrder: 'asc' } },
            decisions: true,
            submitter: { select: { id: true, fullName: true, email: true } },
            node: {
              select: {
                id: true,
                title: true,
                state: true,
                customData: true,
                documents: { where: { deletedAt: null } },
              },
            },
            evidence: true,
          },
          orderBy: { createdAt: 'desc' },
        });
        requests = crossRequests;
      }
    }

    return requests.map((req) => {
      const payloadObj = (req.payload as any) || {};
      const sanitizedNode = req.node
        ? {
            ...req.node,
            documents: (req.node.documents || []).map((d: any) => ({
              ...d,
              fileSize: d.fileSize ? Number(d.fileSize) : 0,
            })),
          }
        : null;
      return {
        ...req,
        node: sanitizedNode,
        reason: payloadObj.reason || payloadObj.notes || (req.node?.customData as any)?.approvalReason || '',
        fileIds: payloadObj.fileIds || (req.node?.customData as any)?.approvalFileIds || [],
      };
    });
  }
}

