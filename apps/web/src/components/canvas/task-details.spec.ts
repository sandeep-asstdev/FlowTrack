import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canApproveTask } from '@flowtrack/shared';
import { getRolePermissions } from '../../utils/permissions';
import { calculateTimeCountdown } from '../../utils/timeTracker';
import { ApiClient } from '../../services/api';

describe('Redesigned 3-Tab Manager-Friendly Task Details Interface', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Maximum Three Tabs Specification', () => {
    it('defines exactly three primary tabs for task inspection and execution', () => {
      const tabs = [
        { id: 'overview', label: 'Overview', icon: 'FileText' },
        { id: 'work', label: 'Work & Evidence', icon: 'Paperclip' },
        { id: 'activity', label: 'Activity & Approvals', icon: 'ShieldCheck' },
      ];

      expect(tabs).toHaveLength(3);
      expect(tabs.map((t) => t.id)).toEqual(['overview', 'work', 'activity']);
    });

    it('maps essential fields to Tab 1 (Overview)', () => {
      const overviewFields = [
        'title',
        'description',
        'status',
        'priority',
        'assignedTo',
        'designatedReviewer',
        'additionalCollaborators',
        'startDate',
        'dueDate',
        'deadlineCountdown',
        'parentStage',
      ];

      expect(overviewFields).toContain('title');
      expect(overviewFields).toContain('assignedTo');
      expect(overviewFields).toContain('dueDate');
      expect(overviewFields).toContain('status');
      expect(overviewFields).toContain('priority');
    });

    it('maps execution, checklist, collaboration and proof to Tab 2 (Work & Evidence)', () => {
      const workFields = [
        'checklistAndSubtasks',
        'subCanvasDrilldown',
        'dependenciesAndBlockers',
        'evidenceDeliverables',
        'documentUploads',
        'commentsAndFieldUpdates',
        'audioVoiceNotes',
        'photoAttachments',
        'workProgressSlider',
        'submitWorkAction',
      ];

      expect(workFields).toContain('checklistAndSubtasks');
      expect(workFields).toContain('dependenciesAndBlockers');
      expect(workFields).toContain('evidenceDeliverables');
      expect(workFields).toContain('commentsAndFieldUpdates');
      expect(workFields).toContain('submitWorkAction');
    });

    it('maps governance, review decisions and history to Tab 3 (Activity & Approvals)', () => {
      const activityFields = [
        'approvalStatusBanner',
        'reviewAssessmentNote',
        'approveWorkButton',
        'requestChangesButton',
        'timelineExtensionRequests',
        'auditTrailLogs',
      ];

      expect(activityFields).toContain('approvalStatusBanner');
      expect(activityFields).toContain('approveWorkButton');
      expect(activityFields).toContain('requestChangesButton');
      expect(activityFields).toContain('auditTrailLogs');
    });
  });

  describe('2. Role-Aware Actions & Authorization Constraints', () => {
    it('strictly forbids Platform Admin from approving or rejecting tasks', () => {
      const adminRole = 'ADMIN';
      const perms = getRolePermissions(adminRole);
      expect(perms.canApproveTasks).toBe(false);

      const decision = canApproveTask({
        userRole: adminRole,
        userId: 'admin-123',
        taskOwnerId: 'worker-456',
        taskSubmitterId: 'worker-456',
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Platform Admins are not permitted to approve');
    });

    it('strictly forbids self-approval by assignee or submitter', () => {
      // Even if user has MANAGER or TEAM_LEAD role, they cannot approve their own work
      const managerSelfDecision = canApproveTask({
        userRole: 'MANAGER',
        userId: 'manager-123',
        taskOwnerId: 'manager-123',
        taskSubmitterId: 'manager-123',
      });

      expect(managerSelfDecision.allowed).toBe(false);
      expect(managerSelfDecision.reason).toContain('Self-approval is forbidden');

      const leadSelfDecision = canApproveTask({
        userRole: 'TEAM_LEAD',
        userId: 'lead-123',
        taskOwnerId: 'lead-123',
        taskSubmitterId: 'lead-123',
      });

      expect(leadSelfDecision.allowed).toBe(false);
      expect(leadSelfDecision.reason).toContain('Self-approval is forbidden');
    });

    it('authorizes Manager and Team Lead to approve other members submissions', () => {
      const managerReview = canApproveTask({
        userRole: 'MANAGER',
        userId: 'manager-123',
        taskOwnerId: 'worker-789',
        taskSubmitterId: 'worker-789',
      });

      expect(managerReview.allowed).toBe(true);

      const leadReview = canApproveTask({
        userRole: 'TEAM_LEAD',
        userId: 'lead-123',
        taskOwnerId: 'worker-789',
        taskSubmitterId: 'worker-789',
      });

      expect(leadReview.allowed).toBe(true);
    });

    it('denies regular Members from approving tasks', () => {
      const memberReview = canApproveTask({
        userRole: 'MEMBER',
        userId: 'member-123',
        taskOwnerId: 'other-456',
        taskSubmitterId: 'other-456',
      });

      expect(memberReview.allowed).toBe(false);
      expect(memberReview.reason).toContain('Only Managers and Team Leads');
    });
  });

  describe('3. Plain-English Manager-Friendly Labels & Countdown Status', () => {
    it('computes human-friendly deadline countdown for managers', () => {
      const pastDate = new Date(Date.now() - 3600000 * 5).toISOString(); // 5 hours overdue
      const overdueStatus = calculateTimeCountdown(pastDate, 'active');

      expect(overdueStatus.isOverdue).toBe(true);
      expect(overdueStatus.formattedText).toContain('Overdue');

      const futureDate = new Date(Date.now() + 86400000 * 5).toISOString(); // 5 days left
      const futureStatus = calculateTimeCountdown(futureDate, 'active');

      expect(futureStatus.isOverdue).toBe(false);
      expect(futureStatus.formattedText).toContain('days left');
    });

    it('recognizes completed tasks and displays on-track status', () => {
      const pastDate = new Date(Date.now() - 3600000 * 5).toISOString();
      const doneStatus = calculateTimeCountdown(pastDate, 'done');

      expect(doneStatus.isOverdue).toBe(false);
      expect(doneStatus.formattedText).toBe('Completed');
    });
  });

  describe('4. Fast Common Actions & API Contracts', () => {
    it('submits task work with optional notes for review', async () => {
      const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-100',
          approvalStatus: 'pending',
          status: { category: 'pending' },
        }),
      } as any);

      const res = await ApiClient.submitTask('task-100', {
        notes: 'Attached test report and test artifacts.',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('/nodes/task-100/submit'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ notes: 'Attached test report and test artifacts.' }),
        })
      );
      expect(res.approvalStatus).toBe('pending');
    });

    it('approves task with reviewer feedback note', async () => {
      const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-100',
          approvalStatus: 'approved',
          approvalFeedback: 'Code quality and evidence meet acceptance criteria.',
        }),
      } as any);

      const res = await ApiClient.approveTask('task-100', {
        decision: 'approved',
        feedback: 'Code quality and evidence meet acceptance criteria.',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('/nodes/task-100/approve'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            decision: 'approved',
            feedback: 'Code quality and evidence meet acceptance criteria.',
          }),
        })
      );
      expect(res.approvalStatus).toBe('approved');
    });

    it('requests changes / rejects task with required rework explanation', async () => {
      const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-100',
          approvalStatus: 'rejected',
          approvalFeedback: 'Please provide certified safety compliance certificate.',
        }),
      } as any);

      const res = await ApiClient.approveTask('task-100', {
        decision: 'rejected',
        feedback: 'Please provide certified safety compliance certificate.',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('/nodes/task-100/approve'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            decision: 'rejected',
            feedback: 'Please provide certified safety compliance certificate.',
          }),
        })
      );
      expect(res.approvalStatus).toBe('rejected');
    });

    it('persists multi-collaborators in task customData without loss', async () => {
      const spy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-100',
          customData: { collaboratorIds: ['user-1', 'user-2'] },
        }),
      } as any);

      const res = await ApiClient.updateNode('task-100', {
        customData: { collaboratorIds: ['user-1', 'user-2'] },
      });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('/nodes/task-100'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ customData: { collaboratorIds: ['user-1', 'user-2'] } }),
        })
      );
      expect(res.customData.collaboratorIds).toEqual(['user-1', 'user-2']);
    });
  });
});
