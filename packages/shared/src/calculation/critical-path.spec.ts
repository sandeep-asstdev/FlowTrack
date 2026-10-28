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

  describe('Section 2 — Mandatory Regression Network Verification', () => {
    /**
     * Exact network from prompt:
     * - A — Create website template: 5 days, no predecessor.
     * - B — Write content: 10 days, no predecessor.
     * - C — Source images: 5 days, depends on B.
     * - D — Populate website: 5 days, depends on A and C.
     * - E — Launch website: 2 days, depends on D.
     *
     * Expected results using inclusive calendar-day durations and finish-to-start dependencies:
     * - Path A → D → E: 12 days.
     * - Path B → C → D → E: 22 days.
     * - Critical path: B → C → D → E.
     * - Critical tasks: B, C, D and E.
     * - Task A: 10 days of total float.
     */
    it('accurately solves the mandatory regression network with exact float and critical tasks', () => {
      const input: CpmInput = {
        projectStartDate: '2026-01-01',
        tasks: [
          { id: 'A', title: 'Create website template', durationDays: 5 },
          { id: 'B', title: 'Write content', durationDays: 10 },
          { id: 'C', title: 'Source images', durationDays: 5 },
          { id: 'D', title: 'Populate website', durationDays: 5 },
          { id: 'E', title: 'Launch website', durationDays: 2 },
        ],
        edges: [
          { sourceNodeId: 'B', targetNodeId: 'C' },
          { sourceNodeId: 'A', targetNodeId: 'D' },
          { sourceNodeId: 'C', targetNodeId: 'D' },
          { sourceNodeId: 'D', targetNodeId: 'E' },
        ],
      };

      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      // Project Total Duration: 22 days (Path B -> C -> D -> E = 10 + 5 + 5 + 2 = 22)
      expect(res.totalDurationDays).toBe(22);

      // Critical Tasks Count: exactly 4 (B, C, D, E)
      expect(res.criticalTaskCount).toBe(4);
      expect(res.slackTaskCount).toBe(1); // Task A

      // Critical Path Sequence
      expect(res.criticalPathIds).toEqual(['B', 'C', 'D', 'E']);
      expect(res.criticalPathTitles).toEqual([
        'Write content',
        'Source images',
        'Populate website',
        'Launch website',
      ]);

      const [taskA, taskB, taskC, taskD, taskE] = [
        res.tasks.find((t) => t.id === 'A')!,
        res.tasks.find((t) => t.id === 'B')!,
        res.tasks.find((t) => t.id === 'C')!,
        res.tasks.find((t) => t.id === 'D')!,
        res.tasks.find((t) => t.id === 'E')!,
      ];

      // Task A: 5d duration, ES=0, EF=4, LS=10, LF=14, Total Float = 10!
      expect(taskA.durationDays).toBe(5);
      expect(taskA.earlyStart).toBe(0);
      expect(taskA.earlyFinish).toBe(4);
      expect(taskA.lateStart).toBe(10);
      expect(taskA.lateFinish).toBe(14);
      expect(taskA.totalFloat).toBe(10);
      expect(taskA.isCritical).toBe(false);

      // Task B: 10d duration, ES=0, EF=9, LS=0, LF=9, Total Float = 0
      expect(taskB.durationDays).toBe(10);
      expect(taskB.earlyStart).toBe(0);
      expect(taskB.earlyFinish).toBe(9);
      expect(taskB.lateStart).toBe(0);
      expect(taskB.lateFinish).toBe(9);
      expect(taskB.totalFloat).toBe(0);
      expect(taskB.isCritical).toBe(true);

      // Task C: 5d duration, ES=10, EF=14, LS=10, LF=14, Total Float = 0
      expect(taskC.durationDays).toBe(5);
      expect(taskC.earlyStart).toBe(10);
      expect(taskC.earlyFinish).toBe(14);
      expect(taskC.lateStart).toBe(10);
      expect(taskC.lateFinish).toBe(14);
      expect(taskC.totalFloat).toBe(0);
      expect(taskC.isCritical).toBe(true);

      // Task D: 5d duration, ES=15, EF=19, LS=15, LF=19, Total Float = 0
      expect(taskD.durationDays).toBe(5);
      expect(taskD.earlyStart).toBe(15);
      expect(taskD.earlyFinish).toBe(19);
      expect(taskD.lateStart).toBe(15);
      expect(taskD.lateFinish).toBe(19);
      expect(taskD.totalFloat).toBe(0);
      expect(taskD.isCritical).toBe(true);

      // Task E: 2d duration, ES=20, EF=21, LS=20, LF=21, Total Float = 0
      expect(taskE.durationDays).toBe(2);
      expect(taskE.earlyStart).toBe(20);
      expect(taskE.earlyFinish).toBe(21);
      expect(taskE.lateStart).toBe(20);
      expect(taskE.lateFinish).toBe(21);
      expect(taskE.totalFloat).toBe(0);
      expect(taskE.isCritical).toBe(true);

      // Edge criticality: only B->C, C->D, D->E are critical edges
      const edgeBC = res.edges.find((e) => e.sourceNodeId === 'B' && e.targetNodeId === 'C')!;
      const edgeCD = res.edges.find((e) => e.sourceNodeId === 'C' && e.targetNodeId === 'D')!;
      const edgeDE = res.edges.find((e) => e.sourceNodeId === 'D' && e.targetNodeId === 'E')!;
      const edgeAD = res.edges.find((e) => e.sourceNodeId === 'A' && e.targetNodeId === 'D')!;

      expect(edgeBC.isCriticalEdge).toBe(true);
      expect(edgeCD.isCriticalEdge).toBe(true);
      expect(edgeDE.isCriticalEdge).toBe(true);
      expect(edgeAD.isCriticalEdge).toBe(false); // Non-critical edge
    });
  });

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

      expect(a.earlyStart).toBe(0);
      expect(a.earlyFinish).toBe(2);
      expect(b.earlyStart).toBe(3);
      expect(b.earlyFinish).toBe(4);
      expect(c.earlyStart).toBe(5);
      expect(c.earlyFinish).toBe(8);

      expect(res.edges.every((e) => e.isCriticalEdge)).toBe(true);
    });
  });

  describe('3. Two Independent Branches with Different Durations', () => {
    it('evaluates shorter independent branch terminal sink against project completion horizon giving positive slack', () => {
      // Long Branch: L1 (10d) -> L2 (5d) => 15 days (critical)
      // Short Branch: S1 (4d) -> S2 (3d) => 7 days (slack = 8 days)
      const input: CpmInput = {
        projectStartDate: '2026-03-01',
        tasks: [
          { id: 'L1', title: 'Long 1', durationDays: 10 },
          { id: 'L2', title: 'Long 2', durationDays: 5 },
          { id: 'S1', title: 'Short 1', durationDays: 4 },
          { id: 'S2', title: 'Short 2', durationDays: 3 },
        ],
        edges: [
          { sourceNodeId: 'L1', targetNodeId: 'L2' },
          { sourceNodeId: 'S1', targetNodeId: 'S2' },
        ],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(15);
      expect(res.criticalTaskCount).toBe(2); // L1, L2
      expect(res.slackTaskCount).toBe(2); // S1, S2

      expect(res.criticalPathIds).toEqual(['L1', 'L2']);

      const l1 = res.tasks.find((t) => t.id === 'L1')!;
      const l2 = res.tasks.find((t) => t.id === 'L2')!;
      const s1 = res.tasks.find((t) => t.id === 'S1')!;
      const s2 = res.tasks.find((t) => t.id === 'S2')!;

      expect(l1.isCritical).toBe(true);
      expect(l2.isCritical).toBe(true);
      expect(l1.totalFloat).toBe(0);
      expect(l2.totalFloat).toBe(0);

      // Shorter branch must have 8 days float (15 - 7 = 8)
      expect(s1.isCritical).toBe(false);
      expect(s2.isCritical).toBe(false);
      expect(s1.totalFloat).toBe(8);
      expect(s2.totalFloat).toBe(8);
    });
  });

  describe('4. Equal-Length Paths with Multiple Critical Paths', () => {
    it('flags both parallel paths as critical and records multiple critical paths', () => {
      const input: CpmInput = {
        projectStartDate: '2026-05-01',
        tasks: [
          { id: 'Start', title: 'Start', durationDays: 2 },
          { id: 'Branch1', title: 'Branch 1', durationDays: 3 },
          { id: 'Branch2', title: 'Branch 2', durationDays: 3 },
          { id: 'End', title: 'End Task', durationDays: 2 },
        ],
        edges: [
          { sourceNodeId: 'Start', targetNodeId: 'Branch1' },
          { sourceNodeId: 'Start', targetNodeId: 'Branch2' },
          { sourceNodeId: 'Branch1', targetNodeId: 'End' },
          { sourceNodeId: 'Branch2', targetNodeId: 'End' },
        ],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(7); // 2 + 3 + 2
      expect(res.criticalTaskCount).toBe(4); // All 4 are on critical paths
      expect(res.slackTaskCount).toBe(0);

      const b1 = res.tasks.find((t) => t.id === 'Branch1')!;
      const b2 = res.tasks.find((t) => t.id === 'Branch2')!;
      expect(b1.isCritical).toBe(true);
      expect(b2.isCritical).toBe(true);

      // Verify multiple paths captured
      expect(res.criticalPaths.length).toBe(2);
      expect(res.criticalPaths).toContainEqual(['Start', 'Branch1', 'End']);
      expect(res.criticalPaths).toContainEqual(['Start', 'Branch2', 'End']);
    });
  });

  describe('5. Disconnected / Unconnected Tasks Handling', () => {
    it('handles disconnected tasks in network: shorter task receives positive float', () => {
      // Main critical network: A (5d) -> B (5d) => 10 days
      // Disconnected task: U (5d) has 5 days of float (10 - 5 = 5d)
      const input: CpmInput = {
        projectStartDate: '2026-06-01',
        tasks: [
          { id: 'A', title: 'Connected A', durationDays: 5 },
          { id: 'B', title: 'Connected B', durationDays: 5 },
          { id: 'U', title: 'Unconnected Standup', durationDays: 5 },
        ],
        edges: [{ sourceNodeId: 'A', targetNodeId: 'B' }],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(10);
      expect(res.criticalTaskCount).toBe(2); // Only A and B
      expect(res.criticalPathIds).toEqual(['A', 'B']);

      const u = res.tasks.find((t) => t.id === 'U')!;
      expect(u.isCritical).toBe(false); // Shorter isolated task is NOT critical
      expect(u.totalFloat).toBe(5); // 10 - 5 = 5 days float
    });

    it('evaluates multiple independent tasks without edges against the project completion horizon', () => {
      const input: CpmInput = {
        projectStartDate: '2026-06-01',
        tasks: [
          { id: 'T1', title: 'Longer Task', durationDays: 5 },
          { id: 'T2', title: 'Shorter Task', durationDays: 2 },
        ],
        edges: [],
      };
      const res = calculateCriticalPath(input);
      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;

      expect(res.totalDurationDays).toBe(5);
      expect(res.criticalTaskCount).toBe(1); // T1 determines project duration
      const t1 = res.tasks.find((t) => t.id === 'T1')!;
      const t2 = res.tasks.find((t) => t.id === 'T2')!;
      expect(t1.isCritical).toBe(true);
      expect(t1.totalFloat).toBe(0);
      expect(t2.isCritical).toBe(false);
      expect(t2.totalFloat).toBe(3);
    });
  });

  describe('6. Duration Changes that Alter Critical Path', () => {
    it('shifts critical path to previously non-critical branch when duration increases', () => {
      // Initially: Start -> A(2d) -> End (total 5d) vs Start -> B(4d) -> End (total 7d)
      const initial = calculateCriticalPath({
        projectStartDate: '2026-07-01',
        tasks: [
          { id: 'Start', title: 'Start', durationDays: 1 },
          { id: 'A', title: 'A', durationDays: 2 },
          { id: 'B', title: 'B', durationDays: 4 },
          { id: 'End', title: 'End', durationDays: 2 },
        ],
        edges: [
          { sourceNodeId: 'Start', targetNodeId: 'A' },
          { sourceNodeId: 'Start', targetNodeId: 'B' },
          { sourceNodeId: 'A', targetNodeId: 'End' },
          { sourceNodeId: 'B', targetNodeId: 'End' },
        ],
      }) as CpmResult;

      expect(initial.criticalPathIds).toEqual(['Start', 'B', 'End']);

      // Now A duration increases from 2 to 8 (making Start -> A -> End total 11d)
      const updated = calculateCriticalPath({
        projectStartDate: '2026-07-01',
        tasks: [
          { id: 'Start', title: 'Start', durationDays: 1 },
          { id: 'A', title: 'A', durationDays: 8 },
          { id: 'B', title: 'B', durationDays: 4 },
          { id: 'End', title: 'End', durationDays: 2 },
        ],
        edges: [
          { sourceNodeId: 'Start', targetNodeId: 'A' },
          { sourceNodeId: 'Start', targetNodeId: 'B' },
          { sourceNodeId: 'A', targetNodeId: 'End' },
          { sourceNodeId: 'B', targetNodeId: 'End' },
        ],
      }) as CpmResult;

      expect(updated.criticalPathIds).toEqual(['Start', 'A', 'End']);
      expect(updated.tasks.find((t) => t.id === 'A')!.isCritical).toBe(true);
      expect(updated.tasks.find((t) => t.id === 'B')!.isCritical).toBe(false);
      expect(updated.tasks.find((t) => t.id === 'B')!.totalFloat).toBe(4);
    });
  });

  describe('7. Adding or Removing Dependencies', () => {
    it('recalculates schedule when a dependency edge is added or removed', () => {
      const baseTasks = [
        { id: 'A', title: 'A', durationDays: 3 },
        { id: 'B', title: 'B', durationDays: 3 },
      ];

      // With dependency A -> B
      const withEdge = calculateCriticalPath({
        tasks: baseTasks,
        edges: [{ sourceNodeId: 'A', targetNodeId: 'B' }],
      }) as CpmResult;
      expect(withEdge.totalDurationDays).toBe(6);
      expect(withEdge.criticalPathIds).toEqual(['A', 'B']);

      // Without dependency
      const noEdge = calculateCriticalPath({
        tasks: baseTasks,
        edges: [],
      }) as CpmResult;
      expect(noEdge.totalDurationDays).toBe(3);
    });
  });

  describe('8. Edge Deduplication & Self-Dependency Rejection', () => {
    it('safely ignores duplicate edges and self-dependencies without crashing or false cycle errors', () => {
      const res = calculateCriticalPath({
        tasks: [
          { id: 'A', title: 'A', durationDays: 3 },
          { id: 'B', title: 'B', durationDays: 2 },
        ],
        edges: [
          { sourceNodeId: 'A', targetNodeId: 'B' },
          { sourceNodeId: 'A', targetNodeId: 'B' }, // duplicate edge
          { sourceNodeId: 'A', targetNodeId: 'A' }, // self-dependency
          { sourceNodeId: 'A', targetNodeId: 'B', kind: 'related' }, // related edge
        ],
      });

      expect(isResult(res)).toBe(true);
      if (!isResult(res)) return;
      expect(res.totalDurationDays).toBe(5);
      expect(res.criticalPathIds).toEqual(['A', 'B']);
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

      expect(res.totalDurationDays).toBe(2);
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
        tasks: [{ id: 'T', title: 'Quick task', durationDays: 5 }],
        edges: [],
      }) as CpmResult;
      expect(res.projectedFinishDate).toBe('2026-01-05');
      expect(res.deadlineSlackDays).toBe(10);
    });

    it('calculates negative deadline slack when project is projected to be overdue', () => {
      const res = calculateCriticalPath({
        projectStartDate: '2026-01-01',
        projectDeadline: '2026-01-05',
        tasks: [{ id: 'T', title: 'Long task', durationDays: 10 }],
        edges: [],
      }) as CpmResult;
      expect(res.projectedFinishDate).toBe('2026-01-10');
      expect(res.deadlineSlackDays).toBe(-5);
    });
  });
});
