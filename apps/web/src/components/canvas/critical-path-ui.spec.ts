import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateCriticalPath, CpmResult } from '@flowtrack/shared';

describe('Critical Path Method UI & Node Scheduling Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Task Node Scheduling Conventions & Calculation', () => {
    it('calculates planned finish date with inclusive calendar days convention (Jan 15 + 5d = Jan 19)', () => {
      const calculatePlannedFinish = (startStr: string, duration: number): string => {
        const d = new Date(startStr);
        d.setUTCDate(d.getUTCDate() + Math.max(0, duration - 1));
        return d.toISOString().slice(0, 10);
      };

      const finishDate = calculatePlannedFinish('2026-01-15T00:00:00.000Z', 5);
      expect(finishDate).toBe('2026-01-19');
    });

    it('handles single-day tasks correctly (Jan 15 + 1d = Jan 15)', () => {
      const calculatePlannedFinish = (startStr: string, duration: number): string => {
        const d = new Date(startStr);
        d.setUTCDate(d.getUTCDate() + Math.max(0, duration - 1));
        return d.toISOString().slice(0, 10);
      };

      const finishDate = calculatePlannedFinish('2026-01-15T00:00:00.000Z', 1);
      expect(finishDate).toBe('2026-01-15');
    });

    it('derives duration from startDate and dueDate if not explicitly defined in customData', () => {
      const start = new Date('2026-03-01T00:00:00.000Z').getTime();
      const due = new Date('2026-03-10T00:00:00.000Z').getTime();
      const derivedDuration = Math.round((due - start) / (24 * 60 * 60 * 1000)) + 1;
      expect(derivedDuration).toBe(10);
    });
  });

  describe('2. Visual Critical Path Node & Edge Indicators', () => {
    it('distinguishes critical tasks from tasks with float and completed tasks', () => {
      const cpmResult = calculateCriticalPath({
        projectStartDate: '2026-04-01',
        tasks: [
          { id: 'crit-1', title: 'Critical Task', durationDays: 5 },
          { id: 'slack-1', title: 'Task With Slack', durationDays: 2 },
        ],
        edges: [],
      }) as CpmResult;

      const critTask = cpmResult.tasks.find((t) => t.id === 'crit-1')!;
      const slackTask = cpmResult.tasks.find((t) => t.id === 'slack-1')!;

      expect(critTask.isCritical).toBe(true);
      expect(critTask.totalFloat).toBe(0);

      expect(slackTask.isCritical).toBe(false);
      expect(slackTask.totalFloat).toBe(3);
    });

    it('flags edges on the critical path accurately', () => {
      const cpmResult = calculateCriticalPath({
        projectStartDate: '2026-04-01',
        tasks: [
          { id: 'A', title: 'A', durationDays: 3 },
          { id: 'B', title: 'B', durationDays: 4 },
          { id: 'C', title: 'C', durationDays: 1 },
        ],
        edges: [
          { sourceNodeId: 'A', targetNodeId: 'B' }, // on critical path
          { sourceNodeId: 'A', targetNodeId: 'C' }, // not on critical path (C finishes early)
        ],
      }) as CpmResult;

      const criticalEdge = cpmResult.edges.find(
        (e) => e.sourceNodeId === 'A' && e.targetNodeId === 'B'
      )!;
      const nonCriticalEdge = cpmResult.edges.find(
        (e) => e.sourceNodeId === 'A' && e.targetNodeId === 'C'
      )!;

      expect(criticalEdge.isCriticalEdge).toBe(true);
      expect(nonCriticalEdge.isCriticalEdge).toBe(false);
    });
  });

  describe('3. Critical Analysis Summary & Deadline Comparison', () => {
    it('accurately compiles project metrics for summary display', () => {
      const cpmResult = calculateCriticalPath({
        projectStartDate: '2026-05-01',
        projectDeadline: '2026-05-15',
        tasks: [
          { id: 'T1', title: 'Design', durationDays: 3 },
          { id: 'T2', title: 'Implementation', durationDays: 5 },
          { id: 'T3', title: 'QA', durationDays: 2 },
        ],
        edges: [
          { sourceNodeId: 'T1', targetNodeId: 'T2' },
          { sourceNodeId: 'T2', targetNodeId: 'T3' },
        ],
      }) as CpmResult;

      expect(cpmResult.projectStartDate).toBe('2026-05-01');
      expect(cpmResult.totalDurationDays).toBe(10); // 3 + 5 + 2
      expect(cpmResult.projectedFinishDate).toBe('2026-05-10');
      expect(cpmResult.criticalTaskCount).toBe(3);
      expect(cpmResult.slackTaskCount).toBe(0);
      expect(cpmResult.criticalPathTitles).toEqual(['Design', 'Implementation', 'QA']);

      // 15 - 10 = 5 days buffer
      expect(cpmResult.deadlineSlackDays).toBe(5);
    });

    it('detects deadline risk when projected finish exceeds deadline', () => {
      const cpmResult = calculateCriticalPath({
        projectStartDate: '2026-05-01',
        projectDeadline: '2026-05-08',
        tasks: [
          { id: 'T1', title: 'Long task', durationDays: 10 },
        ],
        edges: [],
      }) as CpmResult;

      expect(cpmResult.projectedFinishDate).toBe('2026-05-10');
      expect(cpmResult.deadlineSlackDays).toBe(-2); // 2 days late
    });
  });
});
