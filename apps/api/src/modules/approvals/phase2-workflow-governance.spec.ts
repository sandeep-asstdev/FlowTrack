import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalsService } from './approvals.service';
import { TaskLifecycleService } from '../nodes/task-lifecycle.service';
import { AuditService } from '../audit/audit.service';
import {
  TASK_LIFECYCLE_STATES,
  evaluateTaskStateTransition,
  evaluateCompletionReadiness,
  validateApproverEligibility,
  matchApprovalPolicy,
  validateEvidenceFile,
  PRIVILEGED_OPERATIONS,
} from '@flowtrack/shared';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PHASE 2 - WORKFLOW GOVERNANCE (Master Spec Test Suite)', () => {
  let approvalsService: ApprovalsService;
  let lifecycleService: TaskLifecycleService;
  let auditService: AuditService;
  let mockPrisma: any;
  let mockAuditService: any;
  let mockNotificationsService: any;
  let mockAuthService: any;
  let mockGateway: any;

  beforeEach(() => {
    mockPrisma = {
      approvalPolicy: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      policyStage: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      approvalRequest: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      approvalStageInstance: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      approvalDecision: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      node: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      workSubmission: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      workUpdate: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      evidence: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
      },
      edge: {
        findMany: vi.fn(),
      },
      document: {
        count: vi.fn().mockResolvedValue(1),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: 'event-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      membership: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockAuditService = {
      recordAuditEvent: vi.fn().mockResolvedValue({ id: 'audit-event-1' }),
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    mockNotificationsService = {
      sendNotification: vi.fn().mockResolvedValue(true),
    };

    mockAuthService = {
      can: vi.fn().mockResolvedValue(true),
    };

    mockGateway = {
      broadcastToProject: vi.fn(),
      broadcastToNode: vi.fn(),
    };

    auditService = new AuditService(mockPrisma);
    approvalsService = new ApprovalsService(
      mockPrisma,
      mockAuditService,
      mockNotificationsService,
      mockAuthService
    );
    lifecycleService = new TaskLifecycleService(
      mockPrisma,
      mockAuditService,
      mockNotificationsService,
      mockAuthService,
      mockGateway
    );
  });

  // =========================================================================
  // SCENARIO 1: DELEGATION
  // =========================================================================
  describe('Scenario 1: Approver Delegation', () => {
    it('allows designated delegate to approve and records delegator in audit record', async () => {
      const mockRequest = {
        id: 'req-1',
        workspaceId: 'ws-1',
        policyId: 'pol-1',
        policyVersion: 1,
        submissionVersion: 1,
        submitterId: 'submitter-user',
        status: 'PENDING',
        currentStageIndex: 0,
        stageInstances: [
          {
            id: 'stage-inst-1',
            stageOrder: 1,
            name: 'Manager Review',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            status: 'PENDING',
            primaryApproverId: 'primary-manager',
            delegatedApproverId: 'backup-delegate',
            assignedApproverIds: ['primary-manager', 'backup-delegate'],
          },
        ],
        decisions: [],
      };

      mockPrisma.approvalRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER' });
      mockPrisma.approvalDecision.findUnique.mockResolvedValue(null);
      mockPrisma.approvalDecision.create.mockResolvedValue({ id: 'dec-1' });
      mockPrisma.approvalDecision.findMany.mockResolvedValue([
        { approverId: 'backup-delegate', decision: 'Approved' },
      ]);
      mockPrisma.approvalStageInstance.update.mockResolvedValue({});
      mockPrisma.approvalRequest.update.mockResolvedValue({});

      // Backup delegate submits decision
      const result = await approvalsService.submitDecision(
        'req-1',
        'ws-1',
        'backup-delegate',
        { decision: 'Approved', comment: 'Approved on behalf of primary manager' }
      );

      expect(result.requestStatus).toBe('APPROVED');
      expect(mockPrisma.approvalDecision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          approverId: 'backup-delegate',
          delegatedFromUserId: 'primary-manager',
          decision: 'Approved',
        }),
      });
      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPROVAL_DECISION_SUBMITTED',
          outcome: 'APPROVED',
        })
      );
    });

    it('rejects approval attempt from non-delegated third party', async () => {
      const mockRequest = {
        id: 'req-1',
        workspaceId: 'ws-1',
        policyId: 'pol-1',
        policyVersion: 1,
        submissionVersion: 1,
        submitterId: 'submitter-user',
        status: 'PENDING',
        currentStageIndex: 0,
        stageInstances: [
          {
            id: 'stage-inst-1',
            stageOrder: 1,
            name: 'Review',
            rule: 'ANY_ONE_APPROVES',
            primaryApproverId: 'primary-manager',
            delegatedApproverId: 'backup-delegate',
            assignedApproverIds: ['primary-manager', 'backup-delegate'],
          },
        ],
        decisions: [],
      };

      mockPrisma.approvalRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });

      // Unrelated user tries to approve
      await expect(
        approvalsService.submitDecision('req-1', 'ws-1', 'unrelated-user', {
          decision: 'Approved',
        })
      ).rejects.toThrow(ForbiddenException);

      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
          outcome: 'BLOCKED',
        })
      );
    });
  });

  // =========================================================================
  // SCENARIO 3: EXECUTIVE APPROVAL (Multi-Stage Approval Hierarchy)
  // =========================================================================
  describe('Scenario 3: Executive Multi-Stage Approval', () => {
    it('requires both Team Lead and Executive approval sequentially before satisfying policy', async () => {
      const mockRequest = {
        id: 'req-multi',
        workspaceId: 'ws-1',
        nodeId: 'task-high-impact',
        policyId: 'pol-exec',
        policyVersion: 1,
        submissionVersion: 1,
        submitterId: 'worker-1',
        status: 'PENDING',
        currentStageIndex: 0,
        stageInstances: [
          {
            id: 'stg-1',
            stageOrder: 1,
            name: 'Lead Review',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            status: 'PENDING',
            assignedApproverIds: ['lead-user'],
            primaryApproverId: 'lead-user',
          },
          {
            id: 'stg-2',
            stageOrder: 2,
            name: 'Executive Sign-Off',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            status: 'PENDING',
            assignedApproverIds: ['cfo-user'],
            primaryApproverId: 'cfo-user',
          },
        ],
        decisions: [],
      };

      mockPrisma.approvalRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'TEAM_LEAD' });
      mockPrisma.approvalDecision.findUnique.mockResolvedValue(null);
      mockPrisma.approvalDecision.create.mockResolvedValue({ id: 'dec-1' });
      mockPrisma.approvalDecision.findMany.mockResolvedValue([{ approverId: 'lead-user', decision: 'Approved' }]);
      mockPrisma.approvalStageInstance.update.mockResolvedValue({});
      mockPrisma.approvalRequest.update.mockResolvedValue({});

      // Step 1: Lead approves Stage 1
      const step1 = await approvalsService.submitDecision('req-multi', 'ws-1', 'lead-user', {
        decision: 'Approved',
      });

      // Request must remain PENDING because Executive Stage 2 is not yet satisfied!
      expect(step1.requestStatus).toBe('PENDING');
      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-multi' },
        data: { currentStageIndex: 1 },
      });

      // Step 2: Executive approves Stage 2
      mockRequest.currentStageIndex = 1;
      mockRequest.stageInstances[0].status = 'APPROVED';
      mockRequest.decisions = [{ approverId: 'lead-user', stageInstanceId: 'stg-1', decision: 'Approved' } as any];

      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
      mockPrisma.approvalDecision.findMany.mockResolvedValue([{ approverId: 'cfo-user', decision: 'Approved' }]);
      mockPrisma.node.update.mockResolvedValue({});

      const step2 = await approvalsService.submitDecision('req-multi', 'ws-1', 'cfo-user', {
        decision: 'Approved',
        comment: 'Executive sign-off granted',
      });

      // All stages satisfied! Request is now APPROVED and task is updated
      expect(step2.requestStatus).toBe('APPROVED');
      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-multi' },
        data: { status: 'APPROVED' },
      });
    });
  });

  // =========================================================================
  // SCENARIO 4: REJECTION AND RESUBMISSION
  // =========================================================================
  describe('Scenario 4: Rejection and Resubmission Versioning', () => {
    it('requires mandatory feedback reason when rejecting', async () => {
      const mockRequest = {
        id: 'req-rej',
        workspaceId: 'ws-1',
        policyId: 'pol-1',
        policyVersion: 1,
        submissionVersion: 1,
        submitterId: 'user-dev',
        status: 'PENDING',
        currentStageIndex: 0,
        stageInstances: [
          { id: 'stg-1', stageOrder: 1, primaryApproverId: 'reviewer-1', assignedApproverIds: ['reviewer-1'], rule: 'ANY_ONE_APPROVES' },
        ],
        decisions: [],
      };

      mockPrisma.approvalRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER' });

      // Rejecting with empty or missing comment must be rejected
      await expect(
        approvalsService.submitDecision('req-rej', 'ws-1', 'reviewer-1', {
          decision: 'Rejected',
          comment: '',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('creates immutable version v2 upon resubmission, keeping old decisions bound to v1', async () => {
      const mockNode = {
        id: 'task-rework',
        workspaceId: 'ws-1',
        title: 'API Security Spec',
        state: 'Changes Requested',
      };

      mockPrisma.node.findUnique.mockResolvedValue(mockNode);
      mockPrisma.workSubmission.findFirst.mockResolvedValue({ version: 1 });
      mockPrisma.workSubmission.create.mockResolvedValue({ id: 'sub-v2', version: 2 });
      mockPrisma.node.update.mockResolvedValue({ ...mockNode, state: 'Resubmitted' });
      mockPrisma.approvalPolicy.findMany.mockResolvedValue([]);

      const submission = await lifecycleService.createSubmission('task-rework', 'author-1', {
        summary: 'Updated spec with cryptographic salt requirements',
      });

      expect(submission.version).toBe(2);
      expect(mockPrisma.workSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nodeId: 'task-rework',
          version: 2,
          submitterId: 'author-1',
        }),
      });
      expect(mockPrisma.node.update).toHaveBeenCalledWith({
        where: { id: 'task-rework' },
        data: expect.objectContaining({
          state: 'Resubmitted',
          submitterId: 'author-1',
        }),
      });
    });
  });

  // =========================================================================
  // SCENARIO 5: UNAUTHORIZED APPROVAL & SEPARATION OF DUTIES
  // =========================================================================
  describe('Scenario 5: Unauthorized Approvals & Separation of Duties', () => {
    it('forbids submitter from approving their own work', async () => {
      const mockRequest = {
        id: 'req-self',
        workspaceId: 'ws-1',
        policyId: 'pol-1',
        policyVersion: 1,
        submissionVersion: 1,
        submitterId: 'author-self',
        status: 'PENDING',
        currentStageIndex: 0,
        stageInstances: [
          { id: 'stg-1', stageOrder: 1, assignedApproverIds: ['author-self'], primaryApproverId: 'author-self', rule: 'ANY_ONE_APPROVES' },
        ],
        decisions: [],
      };

      mockPrisma.approvalRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER' });

      await expect(
        approvalsService.submitDecision('req-self', 'ws-1', 'author-self', {
          decision: 'Approved',
        })
      ).rejects.toThrow(ForbiddenException);

      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
          outcome: 'BLOCKED',
        })
      );
    });

    it('forbids the same user from approving two independent sequential stages', () => {
      const eligibility = validateApproverEligibility({
        requestSubmitterId: 'author-other',
        actingUserId: 'approver-dan',
        stageApproverRole: 'EXECUTIVE',
        assignedApproverIds: ['approver-dan'],
        userRoles: ['ADMIN'],
        previousStageDecisions: [
          { approverId: 'approver-dan', stageOrder: 1, decision: 'Approved' },
        ],
        currentStageOrder: 2,
      });

      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain('Separation of duties violation');
    });

    it('requires explicit non-empty justification for emergency override', async () => {
      const mockRequest = {
        id: 'req-ovr',
        workspaceId: 'ws-1',
        policyId: 'pol-1',
        policyVersion: 1,
        submissionVersion: 1,
        submitterId: 'author-user',
        status: 'PENDING',
        currentStageIndex: 0,
        stageInstances: [
          { id: 'stg-1', stageOrder: 1, assignedApproverIds: ['someone-else'], rule: 'ANY_ONE_APPROVES' },
        ],
        decisions: [],
      };

      mockPrisma.approvalRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });

      // Override without justification must be rejected
      await expect(
        approvalsService.submitDecision('req-ovr', 'ws-1', 'admin-user', {
          decision: 'Approved',
          isEmergencyOverride: true,
          emergencyJustification: '',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // SCENARIO 7: PARENT COMPLETION
  // =========================================================================
  describe('Scenario 7: Parent Task Completion Gates', () => {
    it('blocks parent task completion while required child tasks remain incomplete or unapproved', async () => {
      const parentTask = {
        id: 'parent-stage',
        workspaceId: 'ws-1',
        state: 'In Progress',
        approvalStatus: 'approved',
        children: [
          { id: 'child-1', title: 'Foundation Excavation', state: 'In Progress', isRequired: true, approvalStatus: 'pending' },
          { id: 'child-2', title: 'Optional Landscaping Mock', state: 'Draft', isRequired: false, approvalStatus: 'not_required' },
        ],
        submissions: [{ version: 1 }],
        evidence: [{ id: 'ev-1' }],
        mandatoryEvidenceCount: 0,
        targetEdges: [],
        approvalRequests: [{ status: 'APPROVED', submissionVersion: 1 }],
        checklist: [],
      };

      mockPrisma.node.findUnique.mockResolvedValue(parentTask);

      const readiness = await lifecycleService.evaluateNodeCompletionReadiness('parent-stage', 'lead-user');
      expect(readiness.canComplete).toBe(false);
      expect(readiness.checks.find((c) => c.code === 'REQUIRED_CHILDREN_COMPLETED_AND_APPROVED')?.satisfied).toBe(false);

      // Attempting to transition parent to Completed fails
      await expect(
        lifecycleService.transitionNode('parent-stage', 'lead-user', TASK_LIFECYCLE_STATES.COMPLETED)
      ).rejects.toThrow(BadRequestException);
    });

    it('allows parent completion when required children are complete and approved, ignoring optional children', async () => {
      const parentTask = {
        id: 'parent-stage-ok',
        workspaceId: 'ws-1',
        state: 'Approved',
        approvalStatus: 'approved',
        children: [
          { id: 'child-1', title: 'Required Task', state: 'Completed', isRequired: true, approvalStatus: 'approved' },
          { id: 'child-2', title: 'Optional Task', state: 'Draft', isRequired: false, approvalStatus: 'not_required' },
        ],
        submissions: [{ version: 1 }],
        evidence: [{ id: 'ev-1' }],
        mandatoryEvidenceCount: 1,
        targetEdges: [],
        approvalRequests: [{ status: 'APPROVED', submissionVersion: 1 }],
        checklist: [],
      };

      mockPrisma.node.findUnique.mockResolvedValue(parentTask);
      mockPrisma.node.update.mockResolvedValue({ ...parentTask, state: 'Completed', version: 2 });
      mockPrisma.edge.findMany.mockResolvedValue([]);

      const updated = await lifecycleService.transitionNode('parent-stage-ok', 'lead-user', TASK_LIFECYCLE_STATES.COMPLETED);
      expect(updated.state).toBe('Completed');
    });
  });

  // =========================================================================
  // SCENARIO 8: INVALID TRANSITION & SECURITY EVENT AUDIT
  // =========================================================================
  describe('Scenario 8: Invalid Transitions & Security Violations', () => {
    it('rejects illegal jump from Draft to Completed and records security audit event', async () => {
      const draftTask = {
        id: 'task-draft',
        workspaceId: 'ws-1',
        state: 'Draft',
        version: 1,
        submissions: [],
        evidence: [],
        targetEdges: [],
        children: [],
      };

      mockPrisma.node.findUnique.mockResolvedValue(draftTask);

      await expect(
        lifecycleService.transitionNode('task-draft', 'attacker-user', TASK_LIFECYCLE_STATES.COMPLETED)
      ).rejects.toThrow(BadRequestException);

      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVALID_TRANSITION_ATTEMPT',
          outcome: 'BLOCKED',
        })
      );
    });

    it('enforces that progressPct = 100% is never proof of completion', async () => {
      const inProgressTask = {
        id: 'task-work',
        workspaceId: 'ws-1',
        state: 'In Progress',
        progressPct: 50,
        version: 1,
      };

      mockPrisma.node.findUnique.mockResolvedValue(inProgressTask);
      mockPrisma.workUpdate.create.mockResolvedValue({ id: 'wu-1', progressPct: 100 });
      mockPrisma.node.update.mockResolvedValue({ ...inProgressTask, progressPct: 100, version: 2 });

      // User updates progress to 100%
      await lifecycleService.createWorkUpdate('task-work', 'dev-1', { progressPct: 100 });

      // Verify node progressPct is updated but state is NOT Completed
      expect(mockPrisma.node.update).toHaveBeenCalledWith({
        where: { id: 'task-work' },
        data: {
          progressPct: 100,
          version: { increment: 1 },
        },
      });
    });
  });

  // =========================================================================
  // SCENARIO 10: POLICY CHANGE & RE-EVALUATION
  // =========================================================================
  describe('Scenario 10: Policy Versioning & Immutability', () => {
    it('binds requests to initial policy version and updates create new policy versions', async () => {
      const existingPolicy = {
        id: 'pol-iso',
        workspaceId: 'ws-1',
        name: 'ISO Compliance',
        version: 1,
        isActive: true,
        isDefault: false,
        stages: [{ id: 'stg-1', stageOrder: 1, name: 'Lead Signoff' }],
      };

      mockPrisma.approvalPolicy.findUnique.mockResolvedValue(existingPolicy);
      mockPrisma.approvalPolicy.create.mockResolvedValue({
        ...existingPolicy,
        version: 2,
        stages: [
          { id: 'stg-1', stageOrder: 1, name: 'Lead Signoff' },
          { id: 'stg-2', stageOrder: 2, name: 'Compliance Officer Review' },
        ],
      });

      const updated = await approvalsService.updatePolicy('pol-iso', 'ws-1', 'admin-1', {
        name: 'ISO Compliance',
        stages: [
          { stageOrder: 1, name: 'Lead Signoff' },
          { stageOrder: 2, name: 'Compliance Officer Review' },
        ],
      });

      expect(updated.version).toBe(2);
      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPROVAL_POLICY_VERSION_BUMP',
          policyReference: expect.stringContaining(':v2'),
        })
      );
    });
  });

  // =========================================================================
  // SCENARIO 11: CONCURRENCY & OPTIMISTIC LOCKING
  // =========================================================================
  describe('Scenario 11: Concurrency & Optimistic Locking', () => {
    it('rejects concurrent modification when version token does not match', async () => {
      const taskInDb = {
        id: 'task-race',
        workspaceId: 'ws-1',
        state: 'Draft',
        version: 2, // Already updated by Worker 1
      };

      mockPrisma.node.findUnique.mockResolvedValue(taskInDb);

      // Worker 2 attempts update with stale version 1
      await expect(
        lifecycleService.transitionNode('task-race', 'worker-2', TASK_LIFECYCLE_STATES.ASSIGNED, {
          version: 1,
        })
      ).rejects.toThrow(ConflictException);
    });

    it('rejects duplicate decision submissions on the same request version (idempotent)', async () => {
      const mockRequest = {
        id: 'req-dup',
        workspaceId: 'ws-1',
        policyId: 'pol-1',
        policyVersion: 1,
        submissionVersion: 1,
        submitterId: 'dev-1',
        status: 'PENDING',
        currentStageIndex: 0,
        stageInstances: [{ id: 'stg-1', stageOrder: 1, assignedApproverIds: ['rev-1'], rule: 'ANY_ONE_APPROVES' }],
        decisions: [],
      };

      mockPrisma.approvalRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER' });
      // Simulate existing decision found
      mockPrisma.approvalDecision.findUnique.mockResolvedValue({ id: 'dec-prior', approverId: 'rev-1' });

      await expect(
        approvalsService.submitDecision('req-dup', 'ws-1', 'rev-1', {
          decision: 'Approved',
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // SCENARIO 13: AUDIT TRAIL INTEGRITY & CONFIDENTIALITY MASKING
  // =========================================================================
  describe('Scenario 13: Audit Trail Integrity & Redaction', () => {
    it('strictly forbids UPDATE and DELETE operations on audit events', async () => {
      await expect(auditService.updateAuditEvent()).rejects.toThrow(ForbiddenException);
      await expect(auditService.deleteAuditEvent()).rejects.toThrow(ForbiddenException);
    });

    it('redacts passwords, tokens, and binary credentials from audit payloads', async () => {
      mockPrisma.auditEvent.create.mockImplementation(async ({ data }: any) => ({ id: 'ev-test', ...data }));

      const recorded = await auditService.recordAuditEvent({
        workspaceId: 'ws-1',
        actorId: 'admin-1',
        action: 'USER_CREDENTIALS_ROTATED',
        targetType: 'user',
        targetId: 'user-1',
        beforeValues: {
          passwordHash: '$2b$12$e8y1017830172837198273',
          jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
          email: 'admin@flowtrack.dev',
        },
      });

      expect((recorded.beforeValues as any).passwordHash).toBe('[REDACTED]');
      expect((recorded.beforeValues as any).jwt).toBe('[REDACTED]');
      expect((recorded.beforeValues as any).email).toBe('admin@flowtrack.dev');
    });

    it('masks confidential resource titles in audit queries for unauthorized viewers', async () => {
      const mockEvent = {
        id: 'ev-conf',
        workspaceId: 'ws-1',
        actorId: 'exec-1',
        action: 'PROJECT_CLASSIFICATION_SET',
        targetType: 'task',
        targetId: 'task-classified',
        timestamp: new Date(),
        beforeValues: { title: 'Project Stealth Aerospace Merger' },
        reason: 'Classified commercial initiative',
        outcome: 'SUCCESS',
      };

      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      mockPrisma.auditEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrisma.auditEvent.count.mockResolvedValue(1);

      // Node is marked CONFIDENTIAL and viewer is not the owner or lead
      mockPrisma.node.findUnique.mockResolvedValue({
        id: 'task-classified',
        classification: 'HIGHLY_CONFIDENTIAL',
        ownerId: 'exec-1',
        responsibleLeadId: 'exec-1',
      });

      const results = await auditService.searchAuditEvents('ws-1', 'unauthorized-viewer');
      expect(results.items[0].beforeValues.title).toBe('[RESTRICTED CONTENT]');
      expect(results.items[0].reason).toBe('[RESTRICTED REASON]');
    });
  });

  // =========================================================================
  // ANTI-ASANA: REJECTION NEVER UNBLOCKS DEPENDENTS
  // =========================================================================
  describe('Anti-Asana Rule: Rejection Never Unblocks Dependents', () => {
    it('verifies that when a prerequisite task is rejected, dependent tasks remain strictly blocked', async () => {
      // Prerequisite Task A is rejected
      const taskA = {
        id: 'task-prereq-a',
        workspaceId: 'ws-1',
        title: 'Safety Foundation Inspection',
        state: 'Changes Requested',
        approvalStatus: 'rejected',
        status: { category: 'blocked' },
      };

      // Dependent Task B relies on Task A
      const taskB = {
        id: 'task-dependent-b',
        workspaceId: 'ws-1',
        title: 'Steel Framing Assembly',
        state: 'Blocked',
        mandatoryEvidenceCount: 0,
        submissions: [{ version: 1 }],
        evidence: [],
        children: [],
        targetEdges: [
          {
            kind: 'dependency',
            sourceNode: taskA,
          },
        ],
        checklist: [],
      };

      mockPrisma.node.findUnique.mockResolvedValue(taskB);

      const readiness = await lifecycleService.evaluateNodeCompletionReadiness('task-dependent-b', 'worker-b');
      expect(readiness.canComplete).toBe(false);
      expect(readiness.checks.find((c) => c.code === 'DEPENDENCIES_SATISFIED')?.satisfied).toBe(false);
      expect(readiness.checks.find((c) => c.code === 'DEPENDENCIES_SATISFIED')?.details).toContain('Safety Foundation Inspection');

      // Attempting to complete Task B while Task A is rejected must be rejected
      await expect(
        lifecycleService.transitionNode('task-dependent-b', 'worker-b', TASK_LIFECYCLE_STATES.COMPLETED)
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // EVIDENCE VALIDATION & CONTENT SNIFFING
  // =========================================================================
  describe('Evidence Validation & Binary Content Sniffing', () => {
    it('rejects disguised executables (e.g. .exe magic bytes MZ renamed to proof.pdf)', () => {
      // PE executable signature 'MZ'
      const disguisedBuffer = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

      const check = validateEvidenceFile({
        name: 'proof.pdf',
        fileSize: 1024,
        declaredMimeType: 'application/pdf',
        buffer: disguisedBuffer,
      });

      expect(check.isValid).toBe(false);
      expect(check.code).toBe('DISGUISED_EXECUTABLE');
      expect(check.error).toContain('contains executable binary signatures');
    });

    it('accepts genuine PDF document bytes (%PDF- header)', () => {
      // PDF header %PDF-
      const validPdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

      const check = validateEvidenceFile({
        name: 'compliance_report.pdf',
        fileSize: 2048,
        declaredMimeType: 'application/pdf',
        buffer: validPdfBuffer,
      });

      expect(check.isValid).toBe(true);
    });
  });

  // =========================================================================
  // PRIVILEGED OPERATIONS ENGINE
  // =========================================================================
  describe('Privileged Operations Automation', () => {
    it('applies deadline extension payload automatically when approval policy is satisfied', async () => {
      const mockRequest = {
        id: 'req-deadline',
        workspaceId: 'ws-1',
        nodeId: 'task-extend',
        operationType: PRIVILEGED_OPERATIONS.DEADLINE_CHANGE,
        policyId: 'pol-ops',
        policyVersion: 1,
        submissionVersion: 1,
        submitterId: 'lead-1',
        status: 'PENDING',
        currentStageIndex: 0,
        payload: { newDueDate: '2026-12-15T00:00:00.000Z', justification: 'Material delivery delay' },
        stageInstances: [
          { id: 'stg-1', stageOrder: 1, assignedApproverIds: ['mgr-1'], primaryApproverId: 'mgr-1', rule: 'ANY_ONE_APPROVES' },
        ],
        decisions: [],
      };

      mockPrisma.approvalRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER' });
      mockPrisma.approvalDecision.findUnique.mockResolvedValue(null);
      mockPrisma.approvalDecision.create.mockResolvedValue({ id: 'dec-op-1' });
      mockPrisma.approvalDecision.findMany.mockResolvedValue([{ approverId: 'mgr-1', decision: 'Approved' }]);
      mockPrisma.approvalStageInstance.update.mockResolvedValue({});
      mockPrisma.approvalRequest.update.mockResolvedValue({});
      mockPrisma.node.update.mockResolvedValue({});

      const result = await approvalsService.submitDecision('req-deadline', 'ws-1', 'mgr-1', {
        decision: 'Approved',
        comment: 'Schedule adjustment approved',
      });

      expect(result.requestStatus).toBe('APPROVED');
      expect(mockPrisma.node.update).toHaveBeenCalledWith({
        where: { id: 'task-extend' },
        data: { dueDate: new Date('2026-12-15T00:00:00.000Z') },
      });
    });
  });
});

