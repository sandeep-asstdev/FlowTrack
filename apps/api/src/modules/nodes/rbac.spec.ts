import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodesService } from './nodes.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { HIGH_VALUE_APPROVAL_THRESHOLD } from '@flowtrack/shared';

describe('Role-Based Access Control (RBAC) Enforcement Tests', () => {
  let nodesService: NodesService;
  let approvalsService: ApprovalsService;
  let mockPrisma: any;
  let mockAuditService: any;

  beforeEach(() => {
    mockAuditService = {
      recordAuditEvent: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      log: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    mockPrisma = {
      node: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn(),
      },
      status: {
        findUnique: vi.fn().mockResolvedValue({ id: 'stat-active', category: 'active' }),
      },
      nodeType: {
        findUnique: vi.fn().mockResolvedValue({ id: 'nt-task', fields: [], statusSet: { statuses: [{ id: 'stat-active' }] } }),
      },
      edge: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      document: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      membership: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      teamMember: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      fieldDefinition: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      approvalPolicy: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pol-default',
            workspaceId: 'ws-1',
            version: 1,
            isActive: true,
            operationType: 'TASK_COMPLETION',
            stages: [
              {
                id: 'stage-1',
                stageOrder: 1,
                name: 'Review Stage',
                approverRole: null,
                assignedApproverIds: ['mgr-a'],
              },
            ],
          },
        ]),
      },
      approvalRequest: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      approvalDecision: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn((calls) => (typeof calls === 'function' ? calls(mockPrisma) : Promise.all(calls))),
    };

    nodesService = new NodesService(mockPrisma, mockAuditService as any);
    approvalsService = new ApprovalsService(mockPrisma, mockAuditService as any);
  });

  describe('1. Manager editing another manager\'s node (403 vs 200 for Admin)', () => {
    const managerBNode = {
      id: 'node-mgr-b',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      title: 'Manager B Task',
      ownerId: 'mgr-b',
      assignedById: 'director-1',
      path: '/node-mgr-b',
      depth: 1,
      project: { id: 'proj-1', ownerId: 'director-1', responsibleManagerId: 'head-manager', members: [] },
      customData: {},
    };

    it('blocks Manager A from editing Manager B\'s node (403 Forbidden)', async () => {
      // Setup Manager A membership
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.MANAGER, workspaceId: 'ws-1', userId: 'mgr-a' });
      mockPrisma.membership.findFirst.mockResolvedValue(null); // not admin
      mockPrisma.node.findUnique.mockResolvedValue(managerBNode);

      await expect(
        nodesService.updateNode('node-mgr-b', { title: 'Illegal Edit by Manager A' }, 'mgr-a')
      ).rejects.toThrow(ForbiddenException);

      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SECURITY_VIOLATION',
          actorId: 'mgr-a',
          outcome: 'BLOCKED',
        })
      );
    });

    it('allows Admin to edit Manager B\'s node (200 OK)', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.ADMIN, workspaceId: 'ws-1', userId: 'admin-1' });
      mockPrisma.membership.findFirst.mockResolvedValue({ role: Role.ADMIN });
      mockPrisma.node.findUnique.mockResolvedValue(managerBNode);
      mockPrisma.node.update.mockResolvedValue({ ...managerBNode, title: 'Updated by Admin' });

      const result = await nodesService.updateNode('node-mgr-b', { title: 'Updated by Admin' }, 'admin-1');
      expect(result.title).toBe('Updated by Admin');
    });

    it('allows Manager A to edit their OWN node or node in their subtree', async () => {
      const managerANode = {
        ...managerBNode,
        id: 'node-mgr-a',
        ownerId: 'mgr-a',
      };
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.MANAGER, workspaceId: 'ws-1', userId: 'mgr-a' });
      mockPrisma.membership.findFirst.mockResolvedValue(null);
      mockPrisma.node.findUnique.mockResolvedValue(managerANode);
      mockPrisma.node.update.mockResolvedValue({ ...managerANode, title: 'Updated by Owner' });

      const result = await nodesService.updateNode('node-mgr-a', { title: 'Updated by Owner' }, 'mgr-a');
      expect(result.title).toBe('Updated by Owner');
    });
  });

  describe('2. Member requesting approval from a non-assigner (403 vs 200 to assigner)', () => {
    const memberTask = {
      id: 'task-mem-1',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      title: 'Member Task',
      ownerId: 'mem-1',
      assignedById: 'mgr-a', // Assigned by Manager A
      parentNodeId: null,
      nodeTypeId: 'nt-task',
      project: { id: 'proj-1', classification: 'INTERNAL' },
    };

    it('blocks Member from requesting approval from a non-assigner (403 Forbidden)', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.MEMBER, workspaceId: 'ws-1', userId: 'mem-1' });
      mockPrisma.node.findUnique.mockResolvedValue(memberTask);

      // Member attempts to request approval from Manager B instead of assigner Manager A
      await expect(
        approvalsService.createApprovalRequest('ws-1', 'mem-1', {
          nodeId: 'task-mem-1',
          operationType: 'TASK_COMPLETION',
          payload: { targetApproverId: 'mgr-b' },
        })
      ).rejects.toThrow(/Members can only request approval from the person who assigned them the task/);
    });

    it('allows Member to request approval from their assigned manager (200 OK)', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.MEMBER, workspaceId: 'ws-1', userId: 'mem-1' });
      mockPrisma.node.findUnique.mockResolvedValue(memberTask);
      mockPrisma.approvalRequest.create.mockResolvedValue({
        id: 'req-1',
        nodeId: 'task-mem-1',
        submitterId: 'mem-1',
        status: 'PENDING',
        stageInstances: [{ id: 'stg-1' }],
      });

      const res = await approvalsService.createApprovalRequest('ws-1', 'mem-1', {
        nodeId: 'task-mem-1',
        operationType: 'TASK_COMPLETION',
        payload: { targetApproverId: 'mgr-a' },
      });
      expect(res.id).toBe('req-1');
    });
  });

  describe('3. Manager approving above threshold / complex (403 Needs Admin vs 200 for Admin)', () => {
    const highValueRequest = {
      id: 'req-high-val',
      workspaceId: 'ws-1',
      nodeId: 'node-payment',
      submitterId: 'sub-1',
      status: 'PENDING',
      currentStageIndex: 0,
      policyId: 'pol-1',
      policyVersion: 1,
      operationType: 'PAYMENT',
      payload: { amount: HIGH_VALUE_APPROVAL_THRESHOLD + 50000 }, // 150000 > 100000
      stageInstances: [
        {
          id: 'stg-1',
          stageOrder: 1,
          assignedApproverIds: ['mgr-a'],
          primaryApproverId: 'mgr-a',
        },
      ],
      decisions: [],
    };

    it('blocks Manager from approving high-value / complex request (403 Needs Admin approval)', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.MANAGER, workspaceId: 'ws-1', userId: 'mgr-a' });
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(highValueRequest);

      await expect(
        approvalsService.submitDecision('req-high-val', 'ws-1', 'mgr-a', {
          decision: 'APPROVED',
          comment: 'Approved by Manager',
        })
      ).rejects.toThrow(/Needs Admin approval/);

      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
          actorId: 'mgr-a',
          outcome: 'BLOCKED',
        })
      );
    });

    it('allows Admin to approve high-value / complex requests (200 OK)', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.ADMIN, workspaceId: 'ws-1', userId: 'admin-1' });
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(highValueRequest);
      mockPrisma.approvalDecision.create.mockResolvedValue({ id: 'dec-1', decision: 'APPROVED' });
      mockPrisma.approvalRequest.update.mockResolvedValue({ ...highValueRequest, status: 'APPROVED' });

      const res = await approvalsService.submitDecision('req-high-val', 'ws-1', 'admin-1', {
        decision: 'APPROVED',
        comment: 'High value approved by CEO/Admin',
      });
      expect(res).toBeDefined();
    });

    it('blocks Member from approving any request (403 Forbidden)', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.MEMBER, workspaceId: 'ws-1', userId: 'mem-1' });
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(highValueRequest);

      await expect(
        approvalsService.submitDecision('req-high-val', 'ws-1', 'mem-1', {
          decision: 'APPROVED',
          comment: 'Member attempt',
        })
      ).rejects.toThrow(/Members cannot approve or reject approval requests/);
    });
  });

  describe('4. Member child task creation restrictions', () => {
    it('blocks Member from creating root-level task without parent (403 Forbidden)', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.MEMBER, workspaceId: 'ws-1', userId: 'mem-1' });
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        nodesService.createNode('ws-1', {
          projectId: 'proj-1',
          nodeTypeId: 'nt-task',
          title: 'Root task attempt',
          parentNodeId: undefined,
        }, 'mem-1')
      ).rejects.toThrow(/Members cannot create root-level tasks/);
    });

    it('blocks Member from creating subtask under a task not assigned to them (403 Forbidden)', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: Role.MEMBER, workspaceId: 'ws-1', userId: 'mem-1' });
      mockPrisma.membership.findFirst.mockResolvedValue(null);
      mockPrisma.node.findUnique.mockResolvedValue({
        id: 'parent-task',
        ownerId: 'mem-other', // Assigned to someone else!
      });

      await expect(
        nodesService.createNode('ws-1', {
          projectId: 'proj-1',
          nodeTypeId: 'nt-task',
          title: 'Subtask under non-owned task',
          parentNodeId: 'parent-task',
        }, 'mem-1')
      ).rejects.toThrow(/Members can only create sub-tasks under tasks assigned to them/);
    });
  });
});
