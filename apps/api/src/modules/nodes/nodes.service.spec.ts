import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodesService } from './nodes.service';
import { BadRequestException } from '@nestjs/common';

describe('NodesService - Workflow Transition Rules, Progress Rollup & Approvals', () => {
  let service: NodesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      node: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      status: {
        findUnique: vi.fn(),
      },
      nodeType: {
        findUnique: vi.fn(),
      },
      edge: {
        findMany: vi.fn(),
      },
      document: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      remark: {
        create: vi.fn().mockResolvedValue({ id: 'remark-1' }),
      },
      fieldDefinition: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN' }),
      },
      $transaction: vi.fn((calls) => Promise.all(calls)),
    };

    service = new NodesService(mockPrisma);
  });

  describe('Workflow Transition Rules & Completion Gates', () => {
    it('blocks parent task completion if child tasks remain uncompleted (Rule 8)', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'stage-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        nodeTypeId: 'nt-stage',
        statusId: 'status-active',
        approvalStatus: 'not_required',
        customData: {},
      });

      mockPrisma.status.findUnique
        .mockResolvedValueOnce({ id: 'status-done', key: 'done', category: 'done' }) // target
        .mockResolvedValueOnce({ id: 'status-active', key: 'in_progress', category: 'active' }); // existing

      // 2 open child tasks remain!
      mockPrisma.node.count.mockResolvedValueOnce(2);
      mockPrisma.edge.findMany.mockResolvedValueOnce([]);
      mockPrisma.nodeType.findUnique.mockResolvedValueOnce({ id: 'nt-stage', fields: [] });

      await expect(
        service.updateNode('stage-1', { statusId: 'status-done' }, 'user-1')
      ).rejects.toThrow(/Cannot complete: This stage has 2 open child task/);
    });

    it('blocks task completion when incoming enforceable dependency is not done (Rule 4 & 5)', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'task-pour-concrete',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        nodeTypeId: 'nt-task',
        statusId: 'status-active',
        approvalStatus: 'not_required',
        customData: {},
      });

      mockPrisma.status.findUnique
        .mockResolvedValueOnce({ id: 'status-done', key: 'done', category: 'done' })
        .mockResolvedValueOnce({ id: 'status-active', key: 'in_progress', category: 'active' });

      mockPrisma.node.count.mockResolvedValueOnce(0); // no child tasks
      // Prerequisite foundation inspection task is still active (not done)!
      mockPrisma.edge.findMany.mockResolvedValueOnce([
        {
          id: 'edge-1',
          kind: 'dependency',
          sourceNode: { id: 'task-foundation-insp', title: 'Foundation Excavation & Inspection', status: { category: 'active' } },
        },
      ]);
      mockPrisma.nodeType.findUnique.mockResolvedValueOnce({ id: 'nt-task', fields: [] });

      await expect(
        service.updateNode('task-pour-concrete', { statusId: 'status-done' }, 'user-1')
      ).rejects.toThrow(/Blocked by prerequisite "Foundation Excavation & Inspection"/);
    });

    it('blocks task completion if mandatory custom fields are missing (Rule 3)', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'task-inspection',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        nodeTypeId: 'nt-quality',
        statusId: 'status-active',
        approvalStatus: 'not_required',
        customData: {}, // Missing required 'inspectorLicenseNumber'
      });

      mockPrisma.status.findUnique
        .mockResolvedValueOnce({ id: 'status-done', key: 'done', category: 'done' })
        .mockResolvedValueOnce({ id: 'status-active', key: 'in_progress', category: 'active' });

      mockPrisma.node.count.mockResolvedValueOnce(0);
      mockPrisma.edge.findMany.mockResolvedValueOnce([]);
      mockPrisma.nodeType.findUnique.mockResolvedValueOnce({
        id: 'nt-quality',
      });
      mockPrisma.fieldDefinition.findMany.mockResolvedValueOnce([
        { fieldKey: 'inspectorLicenseNumber', label: 'Inspector License Number', required: true, type: 'text', isActive: true },
      ]);

      await expect(
        service.updateNode('task-inspection', { statusId: 'status-done' }, 'user-1')
      ).rejects.toThrow(/Missing mandatory field\(s\): Inspector License Number/);
    });

    it('blocks milestone gate completion if approvalStatus is not approved (Rule 6)', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'gate-handover',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        nodeTypeId: 'nt-milestone',
        statusId: 'status-review',
        isMilestone: true,
        approvalStatus: 'pending', // Pending reviewer sign-off!
        reviewerId: 'rev-lead-1',
        customData: {},
      });

      mockPrisma.status.findUnique
        .mockResolvedValueOnce({ id: 'status-done', key: 'done', category: 'done' })
        .mockResolvedValueOnce({ id: 'status-review', key: 'under_review', category: 'active' });

      mockPrisma.node.count.mockResolvedValueOnce(0);
      mockPrisma.edge.findMany.mockResolvedValueOnce([]);
      mockPrisma.nodeType.findUnique.mockResolvedValueOnce({ id: 'nt-milestone', fields: [] });

      await expect(
        service.updateNode('gate-handover', { statusId: 'status-done' }, 'user-1')
      ).rejects.toThrow(/Approval required: This milestone gate must be approved before completion/);
    });
  });

  describe('Parent Progress Rollup (Rule 7)', () => {
    it('computes weighted progress deterministically from children and updates parent', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'stage-construction',
        parentNodeId: null,
        children: [
          { id: 'c-1', progressPct: 100, weight: 2.0, status: { category: 'done' } },
          { id: 'c-2', progressPct: 50, weight: 2.0, status: { category: 'active' } },
        ],
      });

      // Total weight = 4.0; weighted sum = (100*2) + (50*2) = 300 => 300 / 4 = 75%
      await service.rollupParentProgress('stage-construction');

      expect(mockPrisma.node.update).toHaveBeenCalledWith({
        where: { id: 'stage-construction' },
        data: { progressPct: 75 },
      });
    });
  });

  describe('Reviewer and Approval Logic (Rule 6)', () => {
    it('allows designated reviewer to sign off and updates approval status with audit history', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'task-audit-gate',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        reviewerId: 'reviewer-sarah',
        approvalStatus: 'pending',
        workspace: { memberships: [{ role: 'MEMBER' }] },
        project: { members: [{ role: 'MEMBER' }] },
      });

      mockPrisma.node.update.mockResolvedValueOnce({
        id: 'task-audit-gate',
        approvalStatus: 'approved',
        approvalFeedback: 'All compliance checks passed.',
      });

      const result = await service.approveTask('task-audit-gate', 'reviewer-sarah', {
        decision: 'approved',
        feedback: 'All compliance checks passed.',
      });

      expect(result.approvalStatus).toBe('approved');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'APPROVAL_DECISION',
          newValues: expect.objectContaining({
            decision: 'approved',
            approvalStatus: 'approved',
          }),
        }),
      });
      expect(mockPrisma.remark.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: expect.stringContaining('Task Approved'),
        }),
      });
    });

    it('rejects approval attempt by unauthorized user', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'task-audit-gate',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        reviewerId: 'reviewer-sarah', // Assigned to Sarah
        workspace: { memberships: [{ role: 'MEMBER' }] }, // Tom is only a regular member
        project: { members: [{ role: 'MEMBER' }] },
      });

      await expect(
        service.approveTask('task-audit-gate', 'unauthorized-tom', { decision: 'approved' })
      ).rejects.toThrow(/Unauthorized: Only the designated reviewer/);
    });
  });

  describe('Blocker Reporting & Deadline Extensions (Rule 5, 9, 10)', () => {
    it('records blocker report with reason, switches status, and writes audit record', async () => {
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'task-steel',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        statusId: 'status-active',
        nodeType: {
          statusSet: {
            statuses: [
              { id: 'status-blocked', category: 'blocked' },
            ],
          },
        },
      });

      mockPrisma.node.update.mockResolvedValueOnce({
        id: 'task-steel',
        statusId: 'status-blocked',
      });

      const result = await service.reportBlocker('task-steel', 'engineer-mike', {
        reason: 'Awaiting structural steel shipment from supplier',
      });

      expect(result.statusId).toBe('status-blocked');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'BLOCKER_REPORTED',
          newValues: expect.objectContaining({
            reason: 'Awaiting structural steel shipment from supplier',
          }),
        }),
      });
    });

    it('records deadline extension request with justification and audit record', async () => {
      const oldDate = new Date('2026-11-01');
      const newDate = new Date('2026-11-15');

      mockPrisma.node.findUnique.mockResolvedValueOnce({
        id: 'task-electrical',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        dueDate: oldDate,
      });

      mockPrisma.node.update.mockResolvedValueOnce({
        id: 'task-electrical',
        dueDate: newDate,
      });

      const result = await service.requestDeadlineExtension('task-electrical', 'pm-alex', {
        newDueDate: newDate.toISOString(),
        justification: 'Severe weather delayed external trenching',
      });

      expect(result.dueDate).toEqual(newDate);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DEADLINE_CHANGE',
          newValues: expect.objectContaining({
            justification: 'Severe weather delayed external trenching',
          }),
        }),
      });
    });
  });
});
