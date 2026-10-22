import { STATUS_CATEGORIES } from '../constants/index.js';

export interface RollupNodeInput {
  id: string;
  progressPct: number;
  weight: number;
  statusCategory: string; // not_started | active | blocked | done | cancelled
  dueDate?: string | Date | null;
}

export interface GroupRollupResult {
  progressPct: number;
  isOverdue: boolean;
  waitingCount: number;
  openCount: number;
  doneCount: number;
  totalCount: number;
  canMarkDone: boolean;
  suggestedStatusCategory: string;
}

/**
 * Calculates weighted average progress and group status rules from child nodes.
 */
export function calculateGroupRollup(
  children: RollupNodeInput[],
  now: Date = new Date()
): GroupRollupResult {
  if (!children || children.length === 0) {
    return {
      progressPct: 0,
      isOverdue: false,
      waitingCount: 0,
      openCount: 0,
      doneCount: 0,
      totalCount: 0,
      canMarkDone: true,
      suggestedStatusCategory: STATUS_CATEGORIES.NOT_STARTED,
    };
  }

  let totalWeight = 0;
  let weightedProgressSum = 0;
  let waitingCount = 0;
  let openCount = 0;
  let doneCount = 0;
  let hasOverdueChild = false;

  for (const child of children) {
    const weight = child.weight > 0 ? child.weight : 1.0;
    totalWeight += weight;
    weightedProgressSum += (child.progressPct || 0) * weight;

    const isClosed =
      child.statusCategory === STATUS_CATEGORIES.DONE ||
      child.statusCategory === STATUS_CATEGORIES.CANCELLED;

    if (isClosed) {
      if (child.statusCategory === STATUS_CATEGORIES.DONE) {
        doneCount++;
      }
    } else {
      openCount++;

      // Check if child is waiting / blocked
      if (child.statusCategory === STATUS_CATEGORIES.BLOCKED) {
        waitingCount++;
      }

      // Check overdue: past-due open node shows an overdue marker
      if (child.dueDate) {
        const due = new Date(child.dueDate);
        if (due.getTime() < now.getTime()) {
          hasOverdueChild = true;
        }
      }
    }
  }

  const computedProgress =
    totalWeight > 0 ? Math.round(weightedProgressSum / totalWeight) : 0;

  // A group cannot be Done while any child is open
  const canMarkDone = openCount === 0;

  // Derive suggested category
  let suggestedStatusCategory: string = STATUS_CATEGORIES.ACTIVE;
  if (openCount === 0 && doneCount > 0) {
    suggestedStatusCategory = STATUS_CATEGORIES.DONE;
  } else if (waitingCount > 0) {
    suggestedStatusCategory = STATUS_CATEGORIES.BLOCKED;
  } else if (openCount === children.length && computedProgress === 0) {
    suggestedStatusCategory = STATUS_CATEGORIES.NOT_STARTED;
  }

  return {
    progressPct: Math.min(100, Math.max(0, computedProgress)),
    isOverdue: hasOverdueChild,
    waitingCount,
    openCount,
    doneCount,
    totalCount: children.length,
    canMarkDone,
    suggestedStatusCategory,
  };
}

/**
 * Checks if a single node is overdue
 */
export function isNodeOverdue(
  statusCategory: string,
  dueDate?: string | Date | null,
  now: Date = new Date()
): boolean {
  if (!dueDate) return false;
  if (
    statusCategory === STATUS_CATEGORIES.DONE ||
    statusCategory === STATUS_CATEGORIES.CANCELLED
  ) {
    return false;
  }
  return new Date(dueDate).getTime() < now.getTime();
}
