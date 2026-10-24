import { describe, it, expect } from 'vitest';
import {
  validateStatusTransition,
  deriveTaskWorkflowState,
  calculateGroupRollup,
  validateCustomData,
} from '@flowtrack/shared';

describe('Universal Task Management & Workflow Rules (Chunk 4)', () => {
  describe('Rule 1 & 2: Configurable Status Transitions & Status Sets', () => {
    it('enforces allowed transitions defined by a project workflow', () => {
      // In agile, from 'todo' can only go to 'in_progress' or 'cancelled'
      const checkInvalid = validateStatusTransition({
        fromCategory: 'not_started',
        fromStatusKey: 'todo',
        toStatusKey: 'done',
        toCategory: 'done',
        allowedTransitions: ['in_progress', 'cancelled'],
      });

      expect(checkInvalid.canTransition).toBe(false);
      expect(checkInvalid.code).toBe('INVALID_TRANSITION');
      expect(checkInvalid.reason).toContain('is not permitted by workflow rules');

      const checkValid = validateStatusTransition({
        fromCategory: 'not_started',
        fromStatusKey: 'todo',
        toStatusKey: 'in_progress',
        toCategory: 'active',
        allowedTransitions: ['in_progress', 'cancelled'],
      });

      expect(checkValid.canTransition).toBe(true);
    });
  });

  describe('Rule 3: Mandatory Custom Fields & Completion Criteria', () => {
    it('validates industry-specific custom fields generically without separate code engines', () => {
      // Construction project: requires site inspection permit number
      const constructionFields = [
        { fieldKey: 'permitNumber', label: 'Municipal Permit #', required: true, type: 'text' },
        { fieldKey: 'concreteStrengthPsi', label: 'Concrete Strength (PSI)', required: false, type: 'number' },
      ];

      const invalidConstructionData = { concreteStrengthPsi: 4000 };
      const constrRes = validateCustomData(constructionFields, invalidConstructionData);
      expect(constrRes.isValid).toBe(false);
      expect(constrRes.errors.permitNumber).toContain('is required');

      // School project: requires curriculum accreditation board ID
      const schoolFields = [
        { fieldKey: 'accreditationBoard', label: 'Accreditation Board', required: true, type: 'text' },
      ];

      const validSchoolData = { accreditationBoard: 'State Education Dept' };
      const schoolRes = validateCustomData(schoolFields, validSchoolData);
      expect(schoolRes.isValid).toBe(true);
    });

    it('rejects status transition to done when mandatory fields are missing', () => {
      const check = validateStatusTransition({
        toCategory: 'done',
        missingRequiredFields: ['Municipal Permit #', 'Safety Clearance Sign-Off'],
      });

      expect(check.canTransition).toBe(false);
      expect(check.code).toBe('FIELDS_REQUIRED');
      expect(check.reason).toContain('Missing mandatory field(s): Municipal Permit #, Safety Clearance Sign-Off');
    });
  });

  describe('Rule 4 & 5: Dependency Enforcement vs Merely Delayed Tasks', () => {
    it('distinguishes actively blocked tasks from merely delayed or overdue tasks', () => {
      const pastDueDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 24 hours ago

      // Delayed task: past due date, but has NO blocking dependencies
      const delayedTask = deriveTaskWorkflowState({
        id: 'task-delayed',
        title: 'Paint Showroom Walls',
        statusCategory: 'active',
        dueDate: pastDueDate,
        uncompletedDependencies: [],
      });

      expect(delayedTask.isOverdue).toBe(true);
      expect(delayedTask.isBlocked).toBe(false);
      expect(delayedTask.delayHours).toBeGreaterThanOrEqual(23);
      expect(delayedTask.effectiveStatusCategory).toBe('active');

      // Blocked task: has prerequisite dependencies that are NOT completed
      const blockedTask = deriveTaskWorkflowState({
        id: 'task-blocked',
        title: 'Install Showroom Glazing',
        statusCategory: 'active',
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 48), // In the future, not overdue!
        uncompletedDependencies: [
          { id: 'dep-1', title: 'Aluminium Framing Extrusion' },
        ],
      });

      expect(blockedTask.isOverdue).toBe(false);
      expect(blockedTask.isBlocked).toBe(true);
      expect(blockedTask.blockingTaskNames).toEqual(['Aluminium Framing Extrusion']);
      expect(blockedTask.effectiveStatusCategory).toBe('blocked');
      expect(blockedTask.canMarkDone).toBe(false);
      expect(blockedTask.completionBlockers[0]).toContain('Blocked by prerequisite "Aluminium Framing Extrusion"');
    });
  });

  describe('Rule 6: Reviewer Gate and Approval Responsibilities', () => {
    it('prevents completion of milestone or approval gates without verified sign-off', () => {
      const unapprovedCheck = validateStatusTransition({
        toCategory: 'done',
        isApprovalGate: true,
        approvalStatus: 'pending',
      });

      expect(unapprovedCheck.canTransition).toBe(false);
      expect(unapprovedCheck.code).toBe('APPROVAL_REQUIRED');

      const approvedCheck = validateStatusTransition({
        toCategory: 'done',
        isApprovalGate: true,
        approvalStatus: 'approved',
      });

      expect(approvedCheck.canTransition).toBe(true);
    });
  });

  describe('Rule 7 & 8: Progress Rollup & Parent Task Incompletion Guard', () => {
    it('prevents a parent task or stage from being marked complete while children are incomplete', () => {
      const parentCheck = validateStatusTransition({
        toCategory: 'done',
        uncompletedChildrenCount: 3,
      });

      expect(parentCheck.canTransition).toBe(false);
      expect(parentCheck.code).toBe('CHILDREN_OPEN');
      expect(parentCheck.reason).toContain('Cannot complete: This stage has 3 open child task(s)');
    });

    it('calculates deterministic weighted rollup progress across mixed child nodes', () => {
      const children = [
        { id: '1', progressPct: 100, weight: 1.0, statusCategory: 'done' },
        { id: '2', progressPct: 100, weight: 2.0, statusCategory: 'done' },
        { id: '3', progressPct: 0, weight: 1.0, statusCategory: 'not_started' },
      ];

      // Total weight = 4.0; progress sum = (100*1) + (100*2) + (0*1) = 300 => 300/4 = 75%
      const rollup = calculateGroupRollup(children);

      expect(rollup.progressPct).toBe(75);
      expect(rollup.doneCount).toBe(2);
      expect(rollup.openCount).toBe(1);
      expect(rollup.canMarkDone).toBe(false);
    });
  });
});
