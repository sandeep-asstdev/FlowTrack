import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthorizationService } from '../auth/authorization.service';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';
import {
  TASK_LIFECYCLE_STATES,
  TaskLifecycleState,
  evaluateTaskStateTransition,
  evaluateCompletionReadiness,
  CompletionReadinessReport,
  validateEvidenceFile,
  matchApprovalPolicy,
  GRANULAR_PERMISSIONS,
} from '@flowtrack/shared';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

@Injectable()
export class TaskLifecycleService {
  private readonly logger = new Logger(TaskLifecycleService.name);
  private readonly vaultPath: string;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly authService?: AuthorizationService,
    @Optional() private readonly gateway?: CollaborationGateway
  ) {
    this.vaultPath = path.resolve(process.cwd(), 'vault_storage');
    if (!fs.existsSync(this.vaultPath)) {
      try {
        fs.mkdirSync(this.vaultPath, { recursive: true });
      } catch (err: any) {
        this.logger.warn(`Could not create vault storage: ${err.message}`);
      }
    }
  }

  /**
   * Evaluates the strict 8-point completion readiness gates for a task.
   * Approved is not Completed.
   */
  async evaluateNodeCompletionReadiness(nodeId: string, actorId?: string): Promise<CompletionReadinessReport> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        children: { where: { deletedAt: null } },
        submissions: { orderBy: { version: 'desc' }, take: 1 },
        evidence: { where: { deletedAt: null } },
        targetEdges: {
          where: { kind: 'dependency', deletedAt: null },
          include: { sourceNode: { select: { id: true, title: true, state: true, status: { select: { category: true } } } } },
        },
        approvalRequests: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { stageInstances: true },
        },
        status: true,
        project: true,
      },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('Task not found');
    }

    // 1. Work submitted
    const hasSubmission = (node.submissions && node.submissions.length > 0) || !!node.submitterId;
    const currentSubmissionVersion = node.submissions?.[0]?.version || 1;

    // 2. Mandatory evidence present
    const mandatoryCount = node.mandatoryEvidenceCount || 0;
    const evidenceCount = node.evidence ? node.evidence.length : 0;
    let mandatoryEvidenceSatisfied = evidenceCount >= mandatoryCount;

    const fileDocCount = await this.prisma.document.count({
      where: { nodeId, deletedAt: null },
    });
    if (mandatoryCount > 0 && evidenceCount === 0 && fileDocCount === 0) {
      mandatoryEvidenceSatisfied = false;
    }

    // 3. Required children completed and approved
    const requiredChildren = (node.children || []).filter((c: any) => c.isRequired !== false);
    const uncompletedChildren = requiredChildren.filter((c: any) => {
      const isComplete = c.state === TASK_LIFECYCLE_STATES.COMPLETED || c.status?.category === 'done';
      const isApproved = c.approvalStatus === 'approved' || c.approvalStatus === 'not_required' || !c.approvalStatus;
      return !isComplete || !isApproved;
    });
    const requiredChildrenSatisfied = uncompletedChildren.length === 0;

    // 4. Dependencies satisfied (all incoming prerequisite sources must be Completed)
    const uncompletedPrereqs = (node.targetEdges || []).filter((e: any) => {
      const src = e.sourceNode;
      const isComplete = src?.state === TASK_LIFECYCLE_STATES.COMPLETED || src?.status?.category === 'done';
      return !isComplete;
    });
    const dependenciesSatisfied = uncompletedPrereqs.length === 0;

    // 5. Approvals on current submission version passed
    const latestApprovalReq = node.approvalRequests?.[0];
    let currentApprovalsPassed = false;
    let pendingApprovalStages: string[] = [];

    if (node.approvalStatus === 'approved') {
      currentApprovalsPassed = true;
    } else if (latestApprovalReq) {
      if (latestApprovalReq.status === 'APPROVED' && latestApprovalReq.submissionVersion === currentSubmissionVersion) {
        currentApprovalsPassed = true;
      } else {
        pendingApprovalStages = (latestApprovalReq.stageInstances || [])
          .filter((s: any) => s.status !== 'APPROVED' && s.status !== 'SKIPPED')
          .map((s: any) => s.name);
      }
    }

    // 6. Checklist / Acceptance criteria satisfied
    let checklistSatisfied = true;
    const uncompletedChecklistItems: string[] = [];
    if (Array.isArray(node.checklist) && node.checklist.length > 0) {
      for (const item of node.checklist as any[]) {
        if (!item.completed) {
          checklistSatisfied = false;
          uncompletedChecklistItems.push(item.text || item.title || 'Checklist item');
        }
      }
    }

    // 7. No blocking condition
    const isBlocked = node.state === TASK_LIFECYCLE_STATES.BLOCKED || node.status?.category === 'blocked';

    // 8. Actor authorized for completion
    let actorAuthorizedForCompletion = true;
    let actorAuthReason: string | undefined = undefined;
    if (actorId && this.authService) {
      const allowed = await this.authService.can(
        { id: actorId, workspaceId: node.workspaceId },
        GRANULAR_PERMISSIONS.TASK_UPDATE,
        {
          type: 'task',
          id: node.id,
          projectId: node.projectId,
          workspaceId: node.workspaceId,
          classification: node.classification,
        }
      );
      if (!allowed) {
        actorAuthorizedForCompletion = false;
        actorAuthReason = 'Actor is not authorized to complete this task.';
      }
    }

    return evaluateCompletionReadiness({
      state: node.state || TASK_LIFECYCLE_STATES.DRAFT,
      hasSubmission,
      submissionVersion: currentSubmissionVersion,
      mandatoryEvidenceSatisfied,
      missingEvidenceCount: Math.max(0, mandatoryCount - evidenceCount),
      requiredChildrenCompletedAndApproved: requiredChildrenSatisfied,
      uncompletedChildrenTitles: uncompletedChildren.map((c: any) => c.title),
      dependenciesSatisfied,
      uncompletedDependencyTitles: uncompletedPrereqs.map((e: any) => e.sourceNode?.title || 'Prerequisite'),
      currentApprovalsPassed,
      pendingApprovalStages,
      checklistSatisfied,
      uncompletedChecklistItems,
      isBlocked,
      actorAuthorizedForCompletion,
      actorAuthReason,
    });
  }

  /**
   * Transitions a node through the Jira-style state machine.
   * Enforces optimistic locking, guard checks, and logs invalid transition security events.
   * Post-actions execute after commit.
   */
  async transitionNode(
    nodeId: string,
    actorId: string,
    toState: TaskLifecycleState | string,
    options?: {
      version?: number;
      reason?: string;
      feedback?: string;
      isEmergencyOverride?: boolean;
      emergencyJustification?: string;
    }
  ) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        project: true,
        status: true,
        submissions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('Task not found');
    }

    // Optimistic locking check
    if (options?.version !== undefined && node.version !== options.version) {
      throw new ConflictException(
        `Conflict: Task version mismatch. Expected version ${options.version}, but current version is ${node.version}. Another concurrent operation modified this task.`
      );
    }

    const readiness = await this.evaluateNodeCompletionReadiness(nodeId, actorId);

    const transitionAttempt = evaluateTaskStateTransition({
      fromState: node.state || TASK_LIFECYCLE_STATES.DRAFT,
      toState: toState as TaskLifecycleState,
      hasAssignee: !!node.ownerId,
      actorIsAssigneeOrLead: node.ownerId === actorId || node.responsibleLeadId === actorId,
      dependenciesUnblocked: readiness.checks.find((c) => c.code === 'DEPENDENCIES_SATISFIED')?.satisfied ?? true,
      hasBlockerReason: !!options?.reason,
      hasSubmission: readiness.checks.find((c) => c.code === 'WORK_SUBMITTED')?.satisfied ?? false,
      hasFeedbackReason: !!options?.feedback || !!options?.reason,
      hasNewSubmissionVersion: true,
      completionReadiness: readiness,
    });

    if (!transitionAttempt.allowed) {
      if (transitionAttempt.isSecurityViolation) {
        if (this.auditService) {
          await this.auditService.recordAuditEvent({
            workspaceId: node.workspaceId,
            actorId,
            action: 'INVALID_TRANSITION_ATTEMPT',
            targetType: 'task',
            targetId: nodeId,
            beforeValues: { state: node.state, version: node.version },
            afterValues: { attemptedState: toState },
            reason: transitionAttempt.reason,
            outcome: 'BLOCKED',
          });
        }
      }
      throw new BadRequestException(transitionAttempt.reason);
    }

    // Strict completion gates check
    if (toState === TASK_LIFECYCLE_STATES.COMPLETED) {
      if (!readiness.canComplete) {
        throw new BadRequestException(
          `Cannot complete task: Outstanding requirements: ${readiness.outstandingItems.join('; ')}`
        );
      }
    }

    // Atomic update
    const updated = await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        state: toState,
        version: { increment: 1 },
        ...(toState === TASK_LIFECYCLE_STATES.COMPLETED && { progressPct: 100 }),
        ...(toState === TASK_LIFECYCLE_STATES.APPROVED && { approvalStatus: 'approved', approvedAt: new Date() }),
        ...(toState === TASK_LIFECYCLE_STATES.CHANGES_REQUESTED && { approvalStatus: 'changes_requested', approvalFeedback: options?.feedback }),
        ...(toState === TASK_LIFECYCLE_STATES.BLOCKED && { approvalStatus: 'blocked' }),
      },
      include: {
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
        nodeType: true,
      },
    });

    // Post-actions run only after transaction commits
    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId: node.workspaceId,
        actorId,
        action: 'TASK_STATE_TRANSITION',
        targetType: 'task',
        targetId: nodeId,
        beforeValues: { state: node.state, version: node.version },
        afterValues: { state: toState, version: updated.version },
        reason: options?.reason || null,
        outcome: 'SUCCESS',
      });
    }

    if (toState === TASK_LIFECYCLE_STATES.COMPLETED) {
      await this.unblockDependentTasks(nodeId, actorId);
    }

    this.gateway?.broadcastToProject(node.projectId, 'node:updated', updated);

    return updated;
  }

  /**
   * Post-action: Checks and unblocks dependent tasks when a prerequisite completes.
   */
  async unblockDependentTasks(completedNodeId: string, actorId: string) {
    try {
      const edges = await this.prisma.edge.findMany({
        where: { sourceNodeId: completedNodeId, kind: 'dependency', deletedAt: null },
        include: { targetNode: true },
      });

      for (const edge of edges) {
        const dependent = edge.targetNode;
        if (!dependent || dependent.deletedAt) continue;

        const inEdges = await this.prisma.edge.findMany({
          where: { targetNodeId: dependent.id, kind: 'dependency', deletedAt: null },
          include: { sourceNode: { select: { id: true, state: true, status: { select: { category: true } } } } },
        });

        const allPrereqsComplete = inEdges.every(
          (e) => e.sourceNode?.state === TASK_LIFECYCLE_STATES.COMPLETED || e.sourceNode?.status?.category === 'done'
        );

        if (allPrereqsComplete && dependent.state === TASK_LIFECYCLE_STATES.BLOCKED) {
          await this.prisma.node.update({
            where: { id: dependent.id },
            data: { state: TASK_LIFECYCLE_STATES.IN_PROGRESS, version: { increment: 1 } },
          });

          if (this.notificationsService) {
            await this.notificationsService.sendNotification({
              workspaceId: dependent.workspaceId,
              projectId: dependent.projectId,
              userId: dependent.ownerId || actorId,
              actorId,
              type: 'ASSIGNMENT',
              title: `🔓 Task Unblocked: ${dependent.title}`,
              body: `All prerequisite tasks have been completed. Task "${dependent.title}" is now ready to proceed.`,
              entityType: 'task',
              entityId: dependent.id,
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Unblocking dependents skipped or failed: ${err.message}`);
    }
  }

  /**
   * Creates an immutable, versioned work submission.
   * Resubmissions create a new version; nothing is overwritten.
   */
  async createSubmission(
    nodeId: string,
    actorId: string,
    dto: { summary?: string; deliverables?: string; customData?: any; metadata?: any }
  ) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { project: true },
    });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Task not found');
    }

    const isOwner = node.ownerId === actorId;
    const isCollaborator = Array.isArray(node.collaboratorIds) && (node.collaboratorIds as string[]).includes(actorId);
    if (!isOwner && !isCollaborator) {
      if (this.auditService) {
        await this.auditService.recordAuditEvent({
          workspaceId: node.workspaceId,
          actorId,
          action: 'SECURITY_VIOLATION',
          targetType: 'task',
          targetId: nodeId,
          reason: `Unauthorized submission attempt: User ${actorId} is not an assignee or collaborator on task "${node.title}".`,
          outcome: 'BLOCKED',
        });
      }
      throw new ForbiddenException('Forbidden: Only the task assignee or collaborators can submit work.');
    }

    const latest = await this.prisma.workSubmission.findFirst({
      where: { nodeId },
      orderBy: { version: 'desc' },
    });
    const nextVersion = latest ? latest.version + 1 : 1;

    const remarkBody = (dto as any).remarks || (dto as any).notes || dto.summary;
    if (remarkBody && this.prisma.remark?.create) {
      const links = (dto as any).links;
      const linksText = Array.isArray(links) && links.length ? `\n\n**Links**:\n${links.map((l) => `• ${l}`).join('\n')}` : '';
      await this.prisma.remark.create({
        data: {
          workspaceId: node.workspaceId,
          nodeId: node.id,
          authorId: actorId,
          body: `📝 **Work Submission (v${nextVersion})**:\n${remarkBody}${linksText}`,
        },
      }).catch(() => null);
    }

    const submission = await this.prisma.workSubmission.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId,
        version: nextVersion,
        submitterId: actorId,
        summary: dto.summary || (dto as any).remarks || (dto as any).notes || null,
        deliverables: dto.deliverables || null,
        customData: dto.customData || {},
        metadata: dto.metadata || {},
        status: 'submitted',
      },
    });

    const targetState = nextVersion === 1 ? TASK_LIFECYCLE_STATES.READY_FOR_REVIEW : TASK_LIFECYCLE_STATES.RESUBMITTED;

    await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        state: targetState,
        submitterId: actorId,
        submittedAt: new Date(),
        approvalStatus: 'pending',
        version: { increment: 1 },
      },
    });

    // Auto-create matching approval request if matching policy exists
    try {
      const candidatePolicies = await this.prisma.approvalPolicy.findMany({
        where: { workspaceId: node.workspaceId, isActive: true },
        include: { stages: { orderBy: { stageOrder: 'asc' } } },
      });
      const policy = matchApprovalPolicy(candidatePolicies, {
        workspaceId: node.workspaceId,
        operationType: 'TASK_COMPLETION',
        taskType: node.nodeTypeId,
        projectClassification: node.project?.classification,
        confidentiality: node.classification,
        departmentId: node.project?.departmentId,
      });

      if (policy && policy.stages.length > 0) {
        await this.prisma.approvalRequest.create({
          data: {
            workspaceId: node.workspaceId,
            projectId: node.projectId,
            nodeId: node.id,
            submissionId: submission.id,
            submissionVersion: nextVersion,
            operationType: 'TASK_COMPLETION',
            policyId: policy.id,
            policyVersion: policy.version,
            submitterId: actorId,
            status: 'PENDING',
            currentStageIndex: 0,
            stageInstances: {
              create: policy.stages.map((s) => ({
                stageOrder: s.stageOrder,
                name: s.name,
                mode: s.mode,
                rule: s.rule,
                status: 'PENDING',
                assignedApproverIds: s.specificApproverId ? [s.specificApproverId] : (node.reviewerId ? [node.reviewerId] : []),
                primaryApproverId: s.specificApproverId || node.reviewerId,
                backupApproverId: s.backupApproverId,
              })),
            },
          },
        });
      }
    } catch (e: any) {
      this.logger.warn(`Automatic approval request creation skipped: ${e.message}`);
    }

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId: node.workspaceId,
        actorId,
        action: 'WORK_SUBMISSION',
        targetType: 'submission',
        targetId: submission.id,
        afterValues: { version: nextVersion, summary: dto.summary },
        outcome: 'SUCCESS',
      });
    }

    return submission;
  }

  /**
   * Lists versioned submissions for a task.
   */
  async listSubmissions(nodeId: string) {
    return this.prisma.workSubmission.findMany({
      where: { nodeId },
      include: {
        submitter: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        evidence: true,
      },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Records a work update. Progress = 100% is never proof of completion.
   */
  async createWorkUpdate(
    nodeId: string,
    actorId: string,
    dto: {
      status?: string;
      progressPct?: number;
      doneSinceLast?: string;
      nextPlanned?: string;
      blockers?: string;
      actualStart?: string | Date;
      actualFinish?: string | Date;
      notes?: string;
      links?: string[];
    }
  ) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Task not found');
    }

    const isOwner = node.ownerId === actorId;
    const isCollaborator = Array.isArray(node.collaboratorIds) && (node.collaboratorIds as string[]).includes(actorId);
    if (!isOwner && !isCollaborator) {
      if (this.auditService) {
        await this.auditService.recordAuditEvent({
          workspaceId: node.workspaceId,
          actorId,
          action: 'SECURITY_VIOLATION',
          targetType: 'task',
          targetId: nodeId,
          reason: `Unauthorized work update attempt: User ${actorId} is not an assignee or collaborator on task "${node.title}".`,
          outcome: 'BLOCKED',
        });
      }
      throw new ForbiddenException('Forbidden: Only the task assignee or collaborators can submit work updates.');
    }

    const workUpdate = await this.prisma.workUpdate.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId,
        authorId: actorId,
        status: dto.status || node.state || 'In Progress',
        progressPct: dto.progressPct !== undefined ? Math.min(100, Math.max(0, dto.progressPct)) : node.progressPct,
        doneSinceLast: dto.doneSinceLast || null,
        nextPlanned: dto.nextPlanned || null,
        blockers: dto.blockers || null,
        actualStart: dto.actualStart ? new Date(dto.actualStart) : null,
        actualFinish: dto.actualFinish ? new Date(dto.actualFinish) : null,
        notes: dto.notes || null,
        links: dto.links || [],
      },
    });

    if (dto.progressPct !== undefined) {
      // Progress = 100% does NOT complete the task
      await this.prisma.node.update({
        where: { id: nodeId },
        data: {
          progressPct: Math.min(100, Math.max(0, dto.progressPct)),
          version: { increment: 1 },
        },
      });
    }

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId: node.workspaceId,
        actorId,
        action: 'WORK_UPDATE_RECORDED',
        targetType: 'task',
        targetId: nodeId,
        afterValues: { progressPct: dto.progressPct, doneSinceLast: dto.doneSinceLast },
        outcome: 'SUCCESS',
      });
    }

    return workUpdate;
  }

  /**
   * Lists work progress updates for a task.
   */
  async listWorkUpdates(nodeId: string) {
    return this.prisma.workUpdate.findMany({
      where: { nodeId },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Attaches evidence with file validation (type allowlist, size, content sniffing).
   */
  async attachEvidence(
    nodeId: string,
    actorId: string,
    dto: {
      name: string;
      category?: string;
      description?: string;
      mimeType: string;
      fileSize: number;
      submissionId?: string;
      approvalRequestId?: string;
      metadata?: any;
    },
    fileBuffer?: Buffer
  ) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { project: true },
    });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Task not found');
    }

    const isOwner = node.ownerId === actorId;
    const isCollaborator = Array.isArray(node.collaboratorIds) && (node.collaboratorIds as string[]).includes(actorId);
    if (!isOwner && !isCollaborator) {
      if (this.auditService) {
        await this.auditService.recordAuditEvent({
          workspaceId: node.workspaceId,
          actorId,
          action: 'SECURITY_VIOLATION',
          targetType: 'task',
          targetId: nodeId,
          reason: `Unauthorized evidence attachment: User ${actorId} is not an assignee or collaborator on task "${node.title}".`,
          outcome: 'BLOCKED',
        });
      }
      throw new ForbiddenException('Forbidden: Only the task assignee or collaborators can attach evidence.');
    }

    // Rigorous file validation and content sniffing
    const validation = validateEvidenceFile({
      name: dto.name,
      fileSize: dto.fileSize,
      declaredMimeType: dto.mimeType,
      buffer: fileBuffer,
    });

    if (!validation.isValid) {
      if (validation.code === 'DISGUISED_EXECUTABLE') {
        if (this.auditService) {
          await this.auditService.recordAuditEvent({
            workspaceId: node.workspaceId,
            actorId,
            action: 'DISGUISED_EXECUTABLE_ATTEMPT',
            targetType: 'task',
            targetId: nodeId,
            reason: validation.error,
            outcome: 'BLOCKED',
          });
        }
      }
      throw new BadRequestException(validation.error);
    }

    let storageKey = `vault://${Date.now()}-${dto.name}`;
    let fileHash: string | null = null;

    if (fileBuffer) {
      const safeName = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${path.extname(dto.name)}`;
      fs.writeFileSync(path.join(this.vaultPath, safeName), fileBuffer);
      storageKey = `vault://${safeName}`;
      fileHash = createHash('sha256').update(fileBuffer).digest('hex');
    }

    const evidence = await this.prisma.evidence.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId,
        submissionId: dto.submissionId || null,
        approvalRequestId: dto.approvalRequestId || null,
        uploadedBy: actorId,
        name: dto.name,
        category: dto.category || 'general',
        description: dto.description || null,
        mimeType: dto.mimeType,
        fileSize: BigInt(dto.fileSize),
        storageKey,
        fileHash,
        metadata: dto.metadata || {},
      },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    if (this.auditService) {
      await this.auditService.recordAuditEvent({
        workspaceId: node.workspaceId,
        actorId,
        action: 'EVIDENCE_ATTACHED',
        targetType: 'evidence',
        targetId: evidence.id,
        afterValues: { name: evidence.name, category: evidence.category, size: Number(evidence.fileSize) },
        outcome: 'SUCCESS',
      });
    }

    return {
      ...evidence,
      fileSize: Number(evidence.fileSize),
    };
  }

  /**
   * Lists evidence for a task with confidentiality access checking.
   */
  async listEvidence(nodeId: string, actorId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { project: true },
    });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Task not found');
    }

    if (this.authService) {
      const allowed = await this.authService.can(
        { id: actorId, workspaceId: node.workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_VIEW,
        {
          type: 'task',
          id: node.id,
          projectId: node.projectId,
          workspaceId: node.workspaceId,
          classification: node.classification,
        }
      );
      if (!allowed) {
        throw new NotFoundException('Task not found');
      }
    }

    const items = await this.prisma.evidence.findMany({
      where: { nodeId, deletedAt: null },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((e) => ({
      ...e,
      fileSize: Number(e.fileSize),
    }));
  }

  /**
   * Protected download endpoint checking authorization on every request, including for confidential tasks.
   */
  async getEvidenceForDownload(evidenceId: string, actorId: string) {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { node: { include: { project: true } } },
    });
    if (!evidence || evidence.deletedAt) {
      throw new NotFoundException('Evidence not found');
    }

    if (evidence.node && this.authService) {
      const allowed = await this.authService.can(
        { id: actorId, workspaceId: evidence.workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_VIEW,
        {
          type: 'task',
          id: evidence.node.id,
          projectId: evidence.node.projectId,
          workspaceId: evidence.workspaceId,
          classification: evidence.node.classification,
        }
      );
      if (!allowed) {
        throw new NotFoundException('Evidence not found');
      }
    }

    return {
      ...evidence,
      fileSize: Number(evidence.fileSize),
    };
  }
}
