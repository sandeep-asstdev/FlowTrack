import { describe, it, expect } from 'vitest';
import { calculateGroupRollup, isNodeOverdue } from './rollup.js';
import { STATUS_CATEGORIES } from '../constants/index.js';

describe('calculateGroupRollup', () => {
  const fixedNow = new Date('2026-10-21T12:00:00Z');

  it('handles empty children list', () => {
    const result = calculateGroupRollup([], fixedNow);
    expect(result.progressPct).toBe(0);
    expect(result.canMarkDone).toBe(true);
    expect(result.waitingCount).toBe(0);
    expect(result.isOverdue).toBe(false);
  });

  it('calculates weighted average progress accurately', () => {
    const children = [
      { id: '1', progressPct: 100, weight: 1, statusCategory: STATUS_CATEGORIES.DONE },
      { id: '2', progressPct: 50, weight: 3, statusCategory: STATUS_CATEGORIES.ACTIVE },
    ];
    // (100 * 1 + 50 * 3) / 4 = 250 / 4 = 62.5 -> 63%
    const result = calculateGroupRollup(children, fixedNow);
    expect(result.progressPct).toBe(63);
    expect(result.canMarkDone).toBe(false);
  });

  it('enforces that a group cannot be Done while any child is open', () => {
    const children = [
      { id: '1', progressPct: 100, weight: 1, statusCategory: STATUS_CATEGORIES.DONE },
      { id: '2', progressPct: 0, weight: 1, statusCategory: STATUS_CATEGORIES.NOT_STARTED },
    ];
    const result = calculateGroupRollup(children, fixedNow);
    expect(result.canMarkDone).toBe(false);
    expect(result.openCount).toBe(1);
    expect(result.doneCount).toBe(1);
  });

  it('marks group as Waiting if any child is Waiting/Blocked with correct count', () => {
    const children = [
      { id: '1', progressPct: 30, weight: 1, statusCategory: STATUS_CATEGORIES.BLOCKED },
      { id: '2', progressPct: 40, weight: 1, statusCategory: STATUS_CATEGORIES.BLOCKED },
      { id: '3', progressPct: 10, weight: 1, statusCategory: STATUS_CATEGORIES.ACTIVE },
    ];
    const result = calculateGroupRollup(children, fixedNow);
    expect(result.waitingCount).toBe(2);
    expect(result.suggestedStatusCategory).toBe(STATUS_CATEGORIES.BLOCKED);
  });

  it('detects overdue if any open child has a past due date', () => {
    const children = [
      {
        id: '1',
        progressPct: 20,
        weight: 1,
        statusCategory: STATUS_CATEGORIES.ACTIVE,
        dueDate: '2026-10-15T00:00:00Z', // past
      },
      {
        id: '2',
        progressPct: 10,
        weight: 1,
        statusCategory: STATUS_CATEGORIES.ACTIVE,
        dueDate: '2026-10-25T00:00:00Z', // future
      },
    ];
    const result = calculateGroupRollup(children, fixedNow);
    expect(result.isOverdue).toBe(true);
  });

  it('does not flag overdue if overdue child is already Done', () => {
    const children = [
      {
        id: '1',
        progressPct: 100,
        weight: 1,
        statusCategory: STATUS_CATEGORIES.DONE,
        dueDate: '2026-10-15T00:00:00Z', // past but done
      },
    ];
    const result = calculateGroupRollup(children, fixedNow);
    expect(result.isOverdue).toBe(false);
    expect(result.canMarkDone).toBe(true);
    expect(result.suggestedStatusCategory).toBe(STATUS_CATEGORIES.DONE);
  });
});

describe('isNodeOverdue', () => {
  const fixedNow = new Date('2026-10-21T12:00:00Z');

  it('returns true when past due date and active', () => {
    expect(isNodeOverdue(STATUS_CATEGORIES.ACTIVE, '2026-10-20T00:00:00Z', fixedNow)).toBe(true);
  });

  it('returns false when future due date and active', () => {
    expect(isNodeOverdue(STATUS_CATEGORIES.ACTIVE, '2026-10-25T00:00:00Z', fixedNow)).toBe(false);
  });

  it('returns false when past due date but marked done', () => {
    expect(isNodeOverdue(STATUS_CATEGORIES.DONE, '2026-10-10T00:00:00Z', fixedNow)).toBe(false);
  });
});
