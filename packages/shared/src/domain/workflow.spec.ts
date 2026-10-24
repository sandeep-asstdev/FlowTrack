import { describe, it, expect } from 'vitest';
import { validateStatusTransition, deriveTaskWorkflowState } from './workflow.js';
import { STATUS_CATEGORIES } from '../constants/index.js';

describe('Workflow Transition & Task Rules Engine', () => {
  describe('Status Transition Validation', () => {
    it('allows completion when node has no open children and is not a gate', () => {
      const res = validateStatusTransition({
        toCategory: STATUS_CATEGORIES.DONE,
        uncompletedChildrenCount: 0,
        isApprovalGate: false,
      });
      expect(res.canTransition).toBe(true);
    });

    it('blocks completion when group has open children', () => {
      const res = validateStatusTransition({
        toCategory: STATUS_CATEGORIES.DONE,
        uncompletedChildrenCount: 3,
      });
      expect(res.canTransition).toBe(false);
      expect(res.code).toBe('CHILDREN_OPEN');
      expect(res.reason).toContain('has 3 open child task(s)');
    });

    it('blocks completion of approval gate if approval status is pending or rejected', () => {
      const resPending = validateStatusTransition({
        toCategory: STATUS_CATEGORIES.DONE,
        isApprovalGate: true,
        approvalStatus: 'pending',
      });
      expect(resPending.canTransition).toBe(false);
      expect(resPending.code).toBe('APPROVAL_REQUIRED');
      expect(resPending.reason).toContain('Approval required');

      const resApproved = validateStatusTransition({
        toCategory: STATUS_CATEGORIES.DONE,
        isApprovalGate: true,
        approvalStatus: 'approved',
      });
      expect(resApproved.canTransition).toBe(true);
    });

    it('enforces configured status transitions when allowedTransitions is defined', () => {
      const allowed = ['in_review', 'cancelled'];
      const invalidRes = validateStatusTransition({
        fromStatusKey: 'in_progress',
        toStatusKey: 'completed',
        toCategory: STATUS_CATEGORIES.DONE,
        allowedTransitions: allowed,
      });
      expect(invalidRes.canTransition).toBe(false);
      expect(invalidRes.code).toBe('INVALID_TRANSITION');

      const validRes = validateStatusTransition({
        fromStatusKey: 'in_progress',
        toStatusKey: 'in_review',
        toCategory: STATUS_CATEGORIES.ACTIVE,
        allowedTransitions: allowed,
      });
      expect(validRes.canTransition).toBe(true);
    });

    it('blocks completion when unsatisfied prerequisite blocking dependencies exist', () => {
      const res = validateStatusTransition({
        toCategory: STATUS_CATEGORIES.DONE,
        uncompletedDependenciesCount: 2,
        uncompletedDependencyNames: ['Excavation Soil Test', 'Structural Engineering Sign-Off'],
      });
      expect(res.canTransition).toBe(false);
      expect(res.code).toBe('DEPENDENCY_BLOCKED');
      expect(res.reason).toContain('Excavation Soil Test');
    });

    it('blocks completion when mandatory custom fields are missing', () => {
      const res = validateStatusTransition({
        toCategory: STATUS_CATEGORIES.DONE,
        missingRequiredFields: ['Safety Clearance Code', 'Inspector License No'],
      });
      expect(res.canTransition).toBe(false);
      expect(res.code).toBe('FIELDS_REQUIRED');
      expect(res.reason).toContain('Safety Clearance Code');
    });

    it('blocks completion when required evidence documents are missing', () => {
      const res = validateStatusTransition({
        toCategory: STATUS_CATEGORIES.DONE,
        missingEvidenceCount: 1,
      });
      expect(res.canTransition).toBe(false);
      expect(res.code).toBe('EVIDENCE_REQUIRED');
      expect(res.reason).toContain('Requires 1 additional evidence document(s)');
    });
  });

  describe('Task Workflow State Derivation (Delayed vs Blocked)', () => {
    const fixedNow = new Date('2026-10-25T12:00:00Z');

    it('identifies overdue task without blocking dependencies as delayed but NOT blocked', () => {
      const state = deriveTaskWorkflowState(
        {
          id: 'task-1',
          title: 'Classroom Painting',
          statusCategory: 'active',
          dueDate: '2026-10-24T12:00:00Z', // 24 hours in the past
          uncompletedDependencies: [],
        },
        fixedNow
      );

      expect(state.isOverdue).toBe(true);
      expect(state.delayHours).toBe(24);
      expect(state.isBlocked).toBe(false);
      expect(state.effectiveStatusCategory).toBe('active');
    });

    it('identifies task with unsatisfied prerequisite dependencies as actively blocked', () => {
      const state = deriveTaskWorkflowState(
        {
          id: 'task-2',
          title: 'Showroom Interior Fitting',
          statusCategory: 'active',
          dueDate: '2026-10-30T12:00:00Z', // In future (not overdue)
          uncompletedDependencies: [{ id: 'p1', title: 'Tile Flooring Inspection' }],
        },
        fixedNow
      );

      expect(state.isOverdue).toBe(false);
      expect(state.isBlocked).toBe(true);
      expect(state.blockingTaskNames).toEqual(['Tile Flooring Inspection']);
      expect(state.effectiveStatusCategory).toBe('blocked');
      expect(state.canMarkDone).toBe(false);
    });

    it('distinguishes task that is both delayed and blocked simultaneously', () => {
      const state = deriveTaskWorkflowState(
        {
          id: 'task-3',
          title: 'Hospital HVAC Commissioning',
          statusCategory: 'active',
          dueDate: '2026-10-20T12:00:00Z', // 5 days overdue
          uncompletedDependencies: [{ id: 'p2', title: 'Electrical Load Balancing' }],
        },
        fixedNow
      );

      expect(state.isOverdue).toBe(true);
      expect(state.isBlocked).toBe(true);
      expect(state.completionBlockers.length).toBeGreaterThan(0);
    });
  });
});
