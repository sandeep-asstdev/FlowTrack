import { describe, it, expect } from 'vitest';
import {
  calculateCriticalPath,
  CpmInput,
  CpmResult,
  CpmValidationError,
} from './critical-path.js';

describe('Critical Path Method (CPM)', () => {
  const isResult = (res: CpmResult | CpmValidationError): res is CpmResult =>
    !('code' in res);

  describe('1. Single Task', () => {
    it('calculates ES, EF, LS, LF, zero float and critical status for a single task', () => {
      const input: CpmInput = {
        projectStartDate: '2026-01-15',
        tasks: [{ id: 'T1', title: 'Task 1', durationDays: 5 }],
        edges: [],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(5);
      expect(res.projectedFinishDate).toBe('2026-01-19'); // Inclusive: 15, 16, 17, 18, 19
      expect(res.criticalTaskCount).toBe(1);
      expect(res.slackTaskCount).toBe(0);
      expect(res.criticalPathIds).toEqual(['T1']);

      const t1 = res.tasks.find((t) => t.id === 'T1')!;
      expect(t1.earlyStart).toBe(0);
      expect(t1.earlyFinish).toBe(4);
      expect(t1.lateStart).toBe(0);
      expect(t1.lateFinish).toBe(4);
      expect(t1.totalFloat).toBe(0);
      expect(t1.isCritical).toBe(true);
      expect(t1.earlyStartDate).toBe('2026-01-15');
      expect(t1.earlyFinishDate).toBe('2026-01-19');
    });
  });

  describe('2. Sequential Tasks', () => {
    it('chains finish-to-start dependencies sequentially', () => {
      const input: CpmInput = {
        projectStartDate: '2026-02-01',
        tasks: [
          { id: 'A', title: 'Task A', durationDays: 3 },
          { id: 'B', title: 'Task B', durationDays: 2 },
          { id: 'C', title: 'Task C', durationDays: 4 },
        ],
        edges: [
          { sourceNodeId: 'A', targetNodeId: 'B' },
          { sourceNodeId: 'B', targetNodeId: 'C' },
        ],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(9); // 3 + 2 + 4
      expect(res.criticalTaskCount).toBe(3);
      expect(res.criticalPathIds).toEqual(['A', 'B', 'C']);

      const [a, b, c] = [
        res.tasks.find((t) => t.id === 'A')!,
        res.tasks.find((t) => t.id === 'B')!,
        res.tasks.find((t) => t.id === 'C')!,
      ];

      // A: days 0..2 (Feb 1 - Feb 3)
      expect(a.earlyStart).toBe(0);
      expect(a.earlyFinish).toBe(2);
      expect(a.earlyStartDate).toBe('2026-02-01');
      expect(a.earlyFinishDate).toBe('2026-02-03');

      // B: days 3..4 (Feb 4 - Feb 5)
      expect(b.earlyStart).toBe(3);
      expect(b.earlyFinish).toBe(4);
      expect(b.earlyStartDate).toBe('2026-02-04');
      expect(b.earlyFinishDate).toBe('2026-02-05');

      // C: days 5..8 (Feb 6 - Feb 9)
      expect(c.earlyStart).toBe(5);
      expect(c.earlyFinish).toBe(8);
      expect(c.earlyStartDate).toBe('2026-02-06');
      expect(c.earlyFinishDate).toBe('2026-02-09');

      // Edges should be critical
      expect(res.edges.every((e) => e.isCriticalEdge)).toBe(true);
    });
  });

  describe('3. Parallel Independent Tasks', () => {
    it('identifies the longer task as critical and shorter with float', () => {
      const input: CpmInput = {
        projectStartDate: '2026-03-01',
        tasks: [
          { id: 'Long', title: 'Long Task', durationDays: 5 },
          { id: 'Short', title: 'Short Task', durationDays: 2 },
        ],
        edges: [],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(5);
      expect(res.criticalTaskCount).toBe(1);
      expect(res.slackTaskCount).toBe(1);

      const longTask = res.tasks.find((t) => t.id === 'Long')!;
      const shortTask = res.tasks.find((t) => t.id === 'Short')!;

      expect(longTask.isCritical).toBe(true);
      expect(longTask.totalFloat).toBe(0);

      expect(shortTask.isCritical).toBe(false);
      expect(shortTask.totalFloat).toBe(3); // 5 - 2 = 3 days slack
      expect(shortTask.lateStart).toBe(3);
      expect(shortTask.lateFinish).toBe(4);
    });
  });

  describe('4. Parallel Paths that Converge', () => {
    it('handles parallel paths converging into a single milestone/task', () => {
      // Path 1: A (4d) -> C (3d) => 7 days
      // Path 2: B (2d) -> C (3d) => 5 days
      const input: CpmInput = {
        projectStartDate: '2026-04-01',
        tasks: [
          { id: 'A', title: 'Task A', durationDays: 4 },
          { id: 'B', title: 'Task B', durationDays: 2 },
          { id: 'C', title: 'Converged C', durationDays: 3 },
        ],
        edges: [
          { sourceNodeId: 'A', targetNodeId: 'C' },
          { sourceNodeId: 'B', targetNodeId: 'C' },
        ],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(7); // 4 + 3
      expect(res.criticalPathIds).toEqual(['A', 'C']);

      const b = res.tasks.find((t) => t.id === 'B')!;
      expect(b.isCritical).toBe(false);
      expect(b.totalFloat).toBe(2); // Can be delayed by 2 days without delaying C
      expect(b.lateFinish).toBe(3); // C starts at 4, so B must finish by 3
    });
  });

  describe('5. Multiple Critical Paths with Equal Duration', () => {
    it('flags both parallel paths as critical when durations are equal', () => {
      const input: CpmInput = {
        projectStartDate: '2026-05-01',
        tasks: [
          { id: 'Branch1', title: 'Branch 1', durationDays: 3 },
          { id: 'Branch2', title: 'Branch 2', durationDays: 3 },
          { id: 'End', title: 'End Task', durationDays: 2 },
        ],
        edges: [
          { sourceNodeId: 'Branch1', targetNodeId: 'End' },
          { sourceNodeId: 'Branch2', targetNodeId: 'End' },
        ],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(5);
      expect(res.criticalTaskCount).toBe(3); // Branch1, Branch2, and End are all critical
      expect(res.slackTaskCount).toBe(0);

      const b1 = res.tasks.find((t) => t.id === 'Branch1')!;
      const b2 = res.tasks.find((t) => t.id === 'Branch2')!;
      expect(b1.isCritical).toBe(true);
      expect(b2.isCritical).toBe(true);
      expect(b1.totalFloat).toBe(0);
      expect(b2.totalFloat).toBe(0);
    });
  });

  describe('6. Tasks with Nonzero Slack', () => {
    it('accurately calculates float for intermediary non-critical tasks', () => {
      // Start (1) -> P1 (2) -> End (1) => total 4
      // Start (1) -> P2 (1) -> End (1) => total 3 (P2 has 1 day slack)
      const input: CpmInput = {
        projectStartDate: '2026-06-01',
        tasks: [
          { id: 'Start', title: 'Start', durationDays: 1 },
          { id: 'P1', title: 'Path 1', durationDays: 2 },
          { id: 'P2', title: 'Path 2', durationDays: 1 },
          { id: 'End', title: 'End', durationDays: 1 },
        ],
        edges: [
          { sourceNodeId: 'Start', targetNodeId: 'P1' },
          { sourceNodeId: 'Start', targetNodeId: 'P2' },
          { sourceNodeId: 'P1', targetNodeId: 'End' },
          { sourceNodeId: 'P2', targetNodeId: 'End' },
        ],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      const p2 = res.tasks.find((t) => t.id === 'P2')!;
      expect(p2.totalFloat).toBe(1);
      expect(p2.earlyStart).toBe(1);
      expect(p2.earlyFinish).toBe(1);
      expect(p2.lateStart).toBe(2);
      expect(p2.lateFinish).toBe(2);
    });
  });

  describe('7. Duration Changes that Alter Critical Path', () => {
    it('shifts critical path to previously non-critical branch when duration increases', () => {
      // Initially: A(4) > B(2)
      const initial = calculateCriticalPath({
        projectStartDate: '2026-07-01',
        tasks: [
          { id: 'A', title: 'A', durationDays: 4 },
          { id: 'B', title: 'B', durationDays: 2 },
        ],
        edges: [],
      }) as CpmResult;

      expect(initial.criticalPathIds).toEqual(['A']);

      // Now B duration increased to 6
      const updated = calculateCriticalPath({
        projectStartDate: '2026-07-01',
        tasks: [
          { id: 'A', title: 'A', durationDays: 4 },
          { id: 'B', title: 'B', durationDays: 6 },
        ],
        edges: [],
      }) as CpmResult;

      expect(updated.criticalPathIds).toEqual(['B']);
      expect(updated.tasks.find((t) => t.id === 'A')!.isCritical).toBe(false);
      expect(updated.tasks.find((t) => t.id === 'B')!.isCritical).toBe(true);
    });
  });

  describe('8. Adding or Removing Dependencies', () => {
    it('recalculates schedule when a dependency edge is added or removed', () => {
      // Without dependency: parallel tasks
      const noEdge = calculateCriticalPath({
        projectStartDate: '2026-08-01',
        tasks: [
          { id: 'A', title: 'A', durationDays: 3 },
          { id: 'B', title: 'B', durationDays: 3 },
        ],
        edges: [],
      }) as CpmResult;
      expect(noEdge.totalDurationDays).toBe(3);

      // With dependency A -> B
      const withEdge = calculateCriticalPath({
        projectStartDate: '2026-08-01',
        tasks: [
          { id: 'A', title: 'A', durationDays: 3 },
          { id: 'B', title: 'B', durationDays: 3 },
        ],
        edges: [{ sourceNodeId: 'A', targetNodeId: 'B' }],
      }) as CpmResult;
      expect(withEdge.totalDurationDays).toBe(6);
    });
  });

  describe('9. Circular Dependency Rejection', () => {
    it('returns a validation error when a cycle exists (A -> B -> A)', () => {
      const input: CpmInput = {
        projectStartDate: '2026-09-01',
        tasks: [
          { id: 'A', title: 'A', durationDays: 2 },
          { id: 'B', title: 'B', durationDays: 2 },
        ],
        edges: [
          { sourceNodeId: 'A', targetNodeId: 'B' },
          { sourceNodeId: 'B', targetNodeId: 'A' },
        ],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(false);
      if (isResult(res)) return;

      expect(res.code).toBe('CYCLE');
      expect(res.message).toContain('circular dependency');
    });

    it('returns a validation error for a 3-node cycle (A -> B -> C -> A)', () => {
      const input: CpmInput = {
        tasks: [
          { id: 'A', title: 'A', durationDays: 1 },
          { id: 'B', title: 'B', durationDays: 1 },
          { id: 'C', title: 'C', durationDays: 1 },
        ],
        edges: [
          { sourceNodeId: 'A', targetNodeId: 'B' },
          { sourceNodeId: 'B', targetNodeId: 'C' },
          { sourceNodeId: 'C', targetNodeId: 'A' },
        ],
      };
      const res = calculateCriticalPath(input);
      expect(!isResult(res) && res.code === 'CYCLE').toBe(true);
    });
  });

  describe('10. Invalid, Zero, or Negative Duration Handling', () => {
    it('clamps 0 or negative duration to 1 day without crashing', () => {
      const input: CpmInput = {
        projectStartDate: '2026-10-01',
        tasks: [
          { id: 'T1', title: 'Task zero', durationDays: 0 },
          { id: 'T2', title: 'Task neg', durationDays: -5 },
        ],
        edges: [{ sourceNodeId: 'T1', targetNodeId: 'T2' }],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(2); // 1 + 1
      expect(res.tasks.find((t) => t.id === 'T1')!.durationDays).toBe(1);
      expect(res.tasks.find((t) => t.id === 'T2')!.durationDays).toBe(1);
    });
  });

  describe('11. Inclusive Finish Date Convention & Month/Year Boundaries', () => {
    it('correctly calculates inclusive finish date across month and leap-year boundaries', () => {
      // Leap year 2024: Feb 26 with 5 days -> Feb 26, 27, 28, 29, Mar 1 => Mar 01
      const leapInput: CpmInput = {
        projectStartDate: '2024-02-26',
        tasks: [{ id: 'Leap', title: 'Leap Task', durationDays: 5 }],
        edges: [],
      };
      const leapRes = calculateCriticalPath(leapInput) as CpmResult;
      expect(leapRes.projectedFinishDate).toBe('2024-03-01');

      // Non-leap year 2025: Feb 26 with 5 days -> Feb 26, 27, 28, Mar 1, Mar 2 => Mar 02
      const nonLeapInput: CpmInput = {
        projectStartDate: '2025-02-26',
        tasks: [{ id: 'NonLeap', title: 'Non-Leap Task', durationDays: 5 }],
        edges: [],
      };
      const nonLeapRes = calculateCriticalPath(nonLeapInput) as CpmResult;
      expect(nonLeapRes.projectedFinishDate).toBe('2025-03-02');
    });

    it('satisfies user prompt example: task starting Jan 15 with duration 5 finishes Jan 19', () => {
      const res = calculateCriticalPath({
        projectStartDate: '2026-01-15',
        tasks: [{ id: 'T', title: 'Prompt Example', durationDays: 5 }],
        edges: [],
      }) as CpmResult;
      expect(res.projectedFinishDate).toBe('2026-01-19');
    });
  });

  describe('12. Deadline Comparison', () => {
    it('calculates positive deadline slack when ahead of schedule', () => {
      const res = calculateCriticalPath({
        projectStartDate: '2026-01-01',
        projectDeadline: '2026-01-15',
        tasks: [{ id: 'T', title: 'Quick task', durationDays: 5 }], // finishes Jan 5
        edges: [],
      }) as CpmResult;
      expect(res.projectedFinishDate).toBe('2026-01-05');
      expect(res.deadlineSlackDays).toBe(10); // 15 - 5 = 10 days ahead
    });

    it('calculates negative deadline slack when project is projected to be overdue', () => {
      const res = calculateCriticalPath({
        projectStartDate: '2026-01-01',
        projectDeadline: '2026-01-05',
        tasks: [{ id: 'T', title: 'Long task', durationDays: 10 }], // finishes Jan 10
        edges: [],
      }) as CpmResult;
      expect(res.projectedFinishDate).toBe('2026-01-10');
      expect(res.deadlineSlackDays).toBe(-5); // 5 days late
    });
  });
});
