import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
   * Creates an approval request bound to the matched policy version.
   */
  async createApprovalRequest(
    workspaceId: string,
    submitterId: string,
    dto: CreateApprovalRequestDto
  ) {
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
          payload: dto.payload || {},
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

    return result;
  }

  /**
   * Applies privileged operation changes atomically when approval policy is satisfied.
   */
  private async applyApprovedOperation(tx: any, request: any) {
    const payload = (request.payload as any) || {};

    if (request.operationType === PRIVILEGED_OPERATIONS.TASK_COMPLETION && request.nodeId) {
      await tx.node.update({
        where: { id: request.nodeId },
        data: {
          state: TASK_LIFECYCLE_STATES.APPROVED,
          approvalStatus: 'approved',
          approvedAt: new Date(),
        },
      });
    } else if (request.operationType === PRIVILEGED_OPERATIONS.DEADLINE_CHANGE && request.nodeId) {
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
        node: { select: { id: true, title: true, state: true, classification: true } },
        submitter: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!request || request.workspaceId !== workspaceId) {
      throw new NotFoundException('Approval request not found');
    }

    return request;
  }

  /**
   * Lists approval requests in workspace.
   */
  async listApprovalRequests(
    workspaceId: string,
    filters?: { status?: string; nodeId?: string; projectId?: string }
  ) {
    const where: any = { workspaceId };
    if (filters?.status) where.status = filters.status;
    if (filters?.nodeId) where.nodeId = filters.nodeId;
    if (filters?.projectId) where.projectId = filters.projectId;

    return this.prisma.approvalRequest.findMany({
      where,
      include: {
        stageInstances: { orderBy: { stageOrder: 'asc' } },
        decisions: true,
        submitter: { select: { id: true, fullName: true, email: true } },
        node: { select: { id: true, title: true, state: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

