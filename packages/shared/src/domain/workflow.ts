import { STATUS_CATEGORIES } from '../constants/index.js';

export interface WorkflowTransitionCheck {
  canTransition: boolean;
  reason?: string;
  code?: 'CHILDREN_OPEN' | 'APPROVAL_REQUIRED' | 'DEPENDENCY_BLOCKED' | 'INVALID_TRANSITION' | 'FIELDS_REQUIRED' | 'EVIDENCE_REQUIRED';
}

export interface NodeStatusTransitionContext {
  fromCategory?: string;
  toCategory: string;
  fromStatusKey?: string;
  toStatusKey?: string;
  allowedTransitions?: string[]; // If configured on the status set
  isApprovalGate?: boolean;
  approvalStatus?: string; // 'pending' | 'approved' | 'rejected' | 'not_required'
  uncompletedChildrenCount?: number;
  uncompletedDependenciesCount?: number;
  uncompletedDependencyNames?: string[];
  missingRequiredFields?: string[];
  missingEvidenceCount?: number;
}

/**
 * Validates whether a node can transition to a target status category and key.
 * Enforces:
 * 1. Configured status transitions (if defined)
 * 2. Parent-group completion constraints (no open children)
 * 3. Enforced prerequisite dependency satisfaction (uncompleted dependencies)
 * 4. Approval gate sign-off requirements
 * 5. Mandatory custom fields & required evidence completion criteria
 */
export function validateStatusTransition(
  context: NodeStatusTransitionContext
): WorkflowTransitionCheck {
  const {
    fromStatusKey,
    toStatusKey,
    allowedTransitions,
    toCategory,
    isApprovalGate,
    approvalStatus,
    uncompletedChildrenCount = 0,
    uncompletedDependenciesCount = 0,
    uncompletedDependencyNames = [],
    missingRequiredFields = [],
    missingEvidenceCount = 0,
  } = context;

  // Rule 1: Configured status transition validation
  if (
    allowedTransitions &&
    allowedTransitions.length > 0 &&
    toStatusKey &&
    !allowedTransitions.includes(toStatusKey)
  ) {
    return {
      canTransition: false,
      code: 'INVALID_TRANSITION',
      reason: `Status transition from "${fromStatusKey || 'current'}" to "${toStatusKey}" is not permitted by workflow rules.`,
    };
  }

  // Rule 2: Cannot complete parent group/stage if open children remain
  if (toCategory === STATUS_CATEGORIES.DONE && uncompletedChildrenCount > 0) {
    return {
      canTransition: false,
      code: 'CHILDREN_OPEN',
      reason: `Cannot complete: This stage has ${uncompletedChildrenCount} open child task(s).`,
    };
  }

  // Rule 3: Enforced blocking dependencies must be completed before a dependent task can finish or start
  if (
    (toCategory === STATUS_CATEGORIES.DONE || toCategory === STATUS_CATEGORIES.ACTIVE) &&
    uncompletedDependenciesCount > 0
  ) {
    const prereqList =
      uncompletedDependencyNames.length > 0
        ? uncompletedDependencyNames.map((n) => `"${n}"`).join(', ')
        : `${uncompletedDependenciesCount} prerequisite task(s)`;
    return {
      canTransition: false,
      code: 'DEPENDENCY_BLOCKED',
      reason: `Cannot ${toCategory === STATUS_CATEGORIES.DONE ? 'complete' : 'progress'}: Blocked by prerequisite ${prereqList}.`,
    };
  }

  // Rule 4: Mandatory custom fields completion criteria
  if (toCategory === STATUS_CATEGORIES.DONE && missingRequiredFields.length > 0) {
    return {
      canTransition: false,
      code: 'FIELDS_REQUIRED',
      reason: `Cannot complete: Missing mandatory field(s): ${missingRequiredFields.join(', ')}.`,
    };
  }

  // Rule 5: Required evidence/document attachment completion criteria
  if (toCategory === STATUS_CATEGORIES.DONE && missingEvidenceCount > 0) {
    return {
      canTransition: false,
      code: 'EVIDENCE_REQUIRED',
      reason: `Cannot complete: Requires ${missingEvidenceCount} additional evidence document(s).`,
    };
  }

  // Rule 6: Cannot mark an approval gate as 'done' without verified approval sign-off
  if (toCategory === STATUS_CATEGORIES.DONE && isApprovalGate) {
    if (approvalStatus !== 'approved') {
      return {
        canTransition: false,
        code: 'APPROVAL_REQUIRED',
        reason: 'Approval required: This milestone gate must be approved before completion.',
      };
    }
  }

  return { canTransition: true };
}

export interface TaskWorkflowItem {
  id: string;
  title: string;
  statusCategory: string; // not_started | active | blocked | done | cancelled
  dueDate?: string | Date | null;
  approvalStatus?: string;
  isApprovalGate?: boolean;
  uncompletedChildrenCount?: number;
  uncompletedDependencies?: Array<{ id: string; title: string }>;
  missingRequiredFields?: string[];
  missingEvidenceCount?: number;
}

export interface TaskDerivedWorkflowState {
  isDone: boolean;
  isCancelled: boolean;
  isOverdue: boolean;
  isBlocked: boolean;
  blockingTaskNames: string[];
  delayHours: number;
  canMarkDone: boolean;
  completionBlockers: string[];
  effectiveStatusCategory: string;
}

/**
 * Derives comprehensive runtime workflow state for a task, clearly distinguishing
 * between merely delayed/overdue tasks and actively blocked tasks.
 */
export function deriveTaskWorkflowState(
  task: TaskWorkflowItem,
  now: Date = new Date()
): TaskDerivedWorkflowState {
  const isDone = task.statusCategory === STATUS_CATEGORIES.DONE;
  const isCancelled = task.statusCategory === STATUS_CATEGORIES.CANCELLED;
  const isClosed = isDone || isCancelled;

  // Check overdue: Past due date and not completed/cancelled
  let isOverdue = false;
  let delayHours = 0;
  if (!isClosed && task.dueDate) {
    const dueTime = new Date(task.dueDate).getTime();
    if (!isNaN(dueTime) && dueTime < now.getTime()) {
      isOverdue = true;
      delayHours = Math.max(0, Math.round((now.getTime() - dueTime) / (1000 * 60 * 60)));
    }
  }

  // Check blocked: Unsatisfied incoming dependencies
  const uncompletedDeps = task.uncompletedDependencies || [];
  const isBlocked = !isClosed && (task.statusCategory === STATUS_CATEGORIES.BLOCKED || uncompletedDeps.length > 0);
  const blockingTaskNames = uncompletedDeps.map((d) => d.title);

  // Evaluate completion readiness
  const transitionCheck = validateStatusTransition({
    fromCategory: task.statusCategory,
    toCategory: STATUS_CATEGORIES.DONE,
    isApprovalGate: task.isApprovalGate,
    approvalStatus: task.approvalStatus,
    uncompletedChildrenCount: task.uncompletedChildrenCount || 0,
    uncompletedDependenciesCount: uncompletedDeps.length,
    uncompletedDependencyNames: blockingTaskNames,
    missingRequiredFields: task.missingRequiredFields || [],
    missingEvidenceCount: task.missingEvidenceCount || 0,
  });

  const completionBlockers: string[] = [];
  if (!transitionCheck.canTransition && transitionCheck.reason) {
    completionBlockers.push(transitionCheck.reason);
  }

  // Effective status category reflects runtime blocking
  let effectiveStatusCategory = task.statusCategory;
  if (!isClosed) {
    if (isBlocked) {
      effectiveStatusCategory = STATUS_CATEGORIES.BLOCKED;
    }
  }

  return {
    isDone,
    isCancelled,
    isOverdue,
    isBlocked,
    blockingTaskNames,
    delayHours,
    canMarkDone: transitionCheck.canTransition,
    completionBlockers,
    effectiveStatusCategory,
  };
}
