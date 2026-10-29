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

// =========================================================================
// PHASE 2 - TASK STATE MACHINE (Data-Driven, Jira-Style Governance Engine)
// =========================================================================

export const TASK_LIFECYCLE_STATES = {
  DRAFT: 'Draft',
  ASSIGNED: 'Assigned',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  READY_FOR_REVIEW: 'Ready for Review',
  IN_REVIEW: 'In Review',
  CHANGES_REQUESTED: 'Changes Requested',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  ON_HOLD: 'On Hold',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
} as const;

export type TaskLifecycleState = (typeof TASK_LIFECYCLE_STATES)[keyof typeof TASK_LIFECYCLE_STATES];

export interface StateTransitionRule {
  allowedFrom: TaskLifecycleState[];
  requiredPermission?: string;
  guards?: string[];
  validators?: string[];
  postActions: string[];
}

/**
 * Data-Driven Transitions Table
 * Maps allowed from-states, required permissions, guards, validators, and post-actions for each target state.
 */
export const TASK_STATE_TRANSITIONS: Record<TaskLifecycleState, StateTransitionRule> = {
  [TASK_LIFECYCLE_STATES.DRAFT]: {
    allowedFrom: [TASK_LIFECYCLE_STATES.CANCELLED, TASK_LIFECYCLE_STATES.ARCHIVED],
    requiredPermission: 'task.create',
    postActions: ['AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.ASSIGNED]: {
    allowedFrom: [TASK_LIFECYCLE_STATES.DRAFT],
    requiredPermission: 'task.assign',
    guards: ['HAS_ASSIGNEE'],
    postActions: ['NOTIFY_ASSIGNEE', 'AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.ACCEPTED]: {
    allowedFrom: [TASK_LIFECYCLE_STATES.ASSIGNED],
    requiredPermission: 'task.update',
    guards: ['ACTOR_IS_ASSIGNEE_OR_LEAD'],
    postActions: ['AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.IN_PROGRESS]: {
    allowedFrom: [
      TASK_LIFECYCLE_STATES.DRAFT,
      TASK_LIFECYCLE_STATES.ASSIGNED,
      TASK_LIFECYCLE_STATES.ACCEPTED,
      TASK_LIFECYCLE_STATES.BLOCKED,
      TASK_LIFECYCLE_STATES.CHANGES_REQUESTED,
      TASK_LIFECYCLE_STATES.ON_HOLD,
    ],
    requiredPermission: 'task.update',
    guards: ['DEPENDENCIES_UNBLOCKED'],
    postActions: ['AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.BLOCKED]: {
    allowedFrom: [
      TASK_LIFECYCLE_STATES.DRAFT,
      TASK_LIFECYCLE_STATES.ASSIGNED,
      TASK_LIFECYCLE_STATES.ACCEPTED,
      TASK_LIFECYCLE_STATES.IN_PROGRESS,
      TASK_LIFECYCLE_STATES.READY_FOR_REVIEW,
      TASK_LIFECYCLE_STATES.IN_REVIEW,
      TASK_LIFECYCLE_STATES.RESUBMITTED,
    ],
    requiredPermission: 'task.update',
    guards: ['HAS_BLOCKER_REASON'],
    postActions: ['NOTIFY_PROJECT_LEAD', 'AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.READY_FOR_REVIEW]: {
    allowedFrom: [
      TASK_LIFECYCLE_STATES.IN_PROGRESS,
      TASK_LIFECYCLE_STATES.RESUBMITTED,
    ],
    requiredPermission: 'work.submit',
    guards: ['HAS_SUBMISSION'],
    postActions: ['NOTIFY_REVIEWERS', 'AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.IN_REVIEW]: {
    allowedFrom: [TASK_LIFECYCLE_STATES.READY_FOR_REVIEW],
    requiredPermission: 'review.perform',
    postActions: ['AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.CHANGES_REQUESTED]: {
    allowedFrom: [TASK_LIFECYCLE_STATES.IN_REVIEW, TASK_LIFECYCLE_STATES.READY_FOR_REVIEW],
    requiredPermission: 'approve.task',
    guards: ['HAS_FEEDBACK_REASON'],
    postActions: ['NOTIFY_SUBMITTER', 'AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.RESUBMITTED]: {
    allowedFrom: [TASK_LIFECYCLE_STATES.CHANGES_REQUESTED],
    requiredPermission: 'work.submit',
    guards: ['HAS_NEW_SUBMISSION_VERSION'],
    postActions: ['NOTIFY_REVIEWERS', 'AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.APPROVED]: {
    allowedFrom: [TASK_LIFECYCLE_STATES.IN_REVIEW, TASK_LIFECYCLE_STATES.READY_FOR_REVIEW],
    requiredPermission: 'approve.task',
    validators: ['CURRENT_APPROVALS_PASSED'],
    postActions: ['NOTIFY_SUBMITTER', 'AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.COMPLETED]: {
    allowedFrom: [TASK_LIFECYCLE_STATES.APPROVED],
    requiredPermission: 'task.update',
    validators: [
      'WORK_SUBMITTED',
      'MANDATORY_EVIDENCE_PRESENT',
      'REQUIRED_CHILDREN_COMPLETED_AND_APPROVED',
      'DEPENDENCIES_SATISFIED',
      'CURRENT_APPROVALS_PASSED',
      'CHECKLIST_SATISFIED',
      'NO_BLOCKING_CONDITION',
      'ACTOR_AUTHORIZED_FOR_COMPLETION',
    ],
    postActions: ['AUDIT_EVENT', 'UNBLOCK_DEPENDENTS', 'NOTIFY_TEAM'],
  },
  [TASK_LIFECYCLE_STATES.ON_HOLD]: {
    allowedFrom: [
      TASK_LIFECYCLE_STATES.DRAFT,
      TASK_LIFECYCLE_STATES.ASSIGNED,
      TASK_LIFECYCLE_STATES.ACCEPTED,
      TASK_LIFECYCLE_STATES.IN_PROGRESS,
      TASK_LIFECYCLE_STATES.BLOCKED,
      TASK_LIFECYCLE_STATES.READY_FOR_REVIEW,
      TASK_LIFECYCLE_STATES.IN_REVIEW,
      TASK_LIFECYCLE_STATES.CHANGES_REQUESTED,
      TASK_LIFECYCLE_STATES.RESUBMITTED,
    ],
    requiredPermission: 'task.update',
    postActions: ['AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.CANCELLED]: {
    allowedFrom: [
      TASK_LIFECYCLE_STATES.DRAFT,
      TASK_LIFECYCLE_STATES.ASSIGNED,
      TASK_LIFECYCLE_STATES.ACCEPTED,
      TASK_LIFECYCLE_STATES.IN_PROGRESS,
      TASK_LIFECYCLE_STATES.BLOCKED,
      TASK_LIFECYCLE_STATES.READY_FOR_REVIEW,
      TASK_LIFECYCLE_STATES.IN_REVIEW,
      TASK_LIFECYCLE_STATES.CHANGES_REQUESTED,
      TASK_LIFECYCLE_STATES.RESUBMITTED,
      TASK_LIFECYCLE_STATES.ON_HOLD,
    ],
    requiredPermission: 'task.update',
    postActions: ['AUDIT_EVENT'],
  },
  [TASK_LIFECYCLE_STATES.ARCHIVED]: {
    allowedFrom: [
      TASK_LIFECYCLE_STATES.COMPLETED,
      TASK_LIFECYCLE_STATES.CANCELLED,
      TASK_LIFECYCLE_STATES.ON_HOLD,
    ],
    requiredPermission: 'task.archive',
    postActions: ['AUDIT_EVENT'],
  },
};

export interface CompletionReadinessCheck {
  code: string;
  title: string;
  satisfied: boolean;
  details?: string;
}

export interface CompletionReadinessReport {
  canComplete: boolean;
  isApproved: boolean;
  state: TaskLifecycleState | string;
  submissionVersion: number;
  checks: CompletionReadinessCheck[];
  outstandingItems: string[];
}

export interface CompletionEvaluationContext {
  state: TaskLifecycleState | string;
  hasSubmission: boolean;
  submissionVersion?: number;
  mandatoryEvidenceSatisfied: boolean;
  missingEvidenceCount?: number;
  requiredChildrenCompletedAndApproved: boolean;
  uncompletedChildrenTitles?: string[];
  dependenciesSatisfied: boolean;
  uncompletedDependencyTitles?: string[];
  currentApprovalsPassed: boolean;
  pendingApprovalStages?: string[];
  checklistSatisfied: boolean;
  uncompletedChecklistItems?: string[];
  isBlocked: boolean;
  blockerReason?: string;
  actorAuthorizedForCompletion: boolean;
  actorAuthReason?: string;
}

/**
 * Evaluates the strict 8-point completion readiness gates.
 * Approved is not Completed.
 */
export function evaluateCompletionReadiness(
  ctx: CompletionEvaluationContext
): CompletionReadinessReport {
  const checks: CompletionReadinessCheck[] = [
    {
      code: 'WORK_SUBMITTED',
      title: 'Work formally submitted',
      satisfied: ctx.hasSubmission,
      details: ctx.hasSubmission ? undefined : 'No work submission record attached.',
    },
    {
      code: 'MANDATORY_EVIDENCE_PRESENT',
      title: 'Mandatory evidence attached',
      satisfied: ctx.mandatoryEvidenceSatisfied,
      details: ctx.mandatoryEvidenceSatisfied
        ? undefined
        : `Missing ${ctx.missingEvidenceCount || 1} required evidence item(s).`,
    },
    {
      code: 'REQUIRED_CHILDREN_COMPLETED_AND_APPROVED',
      title: 'Required children completed and approved',
      satisfied: ctx.requiredChildrenCompletedAndApproved,
      details: ctx.requiredChildrenCompletedAndApproved
        ? undefined
        : `Open children: ${(ctx.uncompletedChildrenTitles || []).join(', ') || 'Pending children'}.`,
    },
    {
      code: 'DEPENDENCIES_SATISFIED',
      title: 'Prerequisite dependencies satisfied',
      satisfied: ctx.dependenciesSatisfied,
      details: ctx.dependenciesSatisfied
        ? undefined
        : `Blocked by: ${(ctx.uncompletedDependencyTitles || []).join(', ') || 'Uncompleted prerequisite(s)'}.`,
    },
    {
      code: 'CURRENT_APPROVALS_PASSED',
      title: 'Approved on current submission version',
      satisfied: ctx.currentApprovalsPassed,
      details: ctx.currentApprovalsPassed
        ? undefined
        : `Pending stages: ${(ctx.pendingApprovalStages || []).join(', ') || 'Awaiting reviewer sign-off'}.`,
    },
    {
      code: 'CHECKLIST_SATISFIED',
      title: 'Checklist / Acceptance criteria satisfied',
      satisfied: ctx.checklistSatisfied,
      details: ctx.checklistSatisfied
        ? undefined
        : `Open items: ${(ctx.uncompletedChecklistItems || []).join(', ') || 'Unsatisfied acceptance criteria'}.`,
    },
    {
      code: 'NO_BLOCKING_CONDITION',
      title: 'No active blockers',
      satisfied: !ctx.isBlocked,
      details: !ctx.isBlocked ? undefined : `Active blocker: ${ctx.blockerReason || 'Task is marked blocked'}.`,
    },
    {
      code: 'ACTOR_AUTHORIZED_FOR_COMPLETION',
      title: 'Actor authorized for completion',
      satisfied: ctx.actorAuthorizedForCompletion,
      details: ctx.actorAuthorizedForCompletion ? undefined : ctx.actorAuthReason || 'User lacks completion authority.',
    },
  ];

  const outstandingItems = checks.filter((c) => !c.satisfied).map((c) => c.details || c.title);
  const canComplete = checks.every((c) => c.satisfied);
  const isApproved = ctx.state === TASK_LIFECYCLE_STATES.APPROVED || ctx.currentApprovalsPassed;

  return {
    canComplete,
    isApproved,
    state: ctx.state,
    submissionVersion: ctx.submissionVersion || 1,
    checks,
    outstandingItems,
  };
}

export interface StateTransitionAttempt {
  fromState: TaskLifecycleState | string;
  toState: TaskLifecycleState | string;
  progressPct?: number;
  hasAssignee?: boolean;
  actorIsAssigneeOrLead?: boolean;
  dependenciesUnblocked?: boolean;
  hasBlockerReason?: boolean;
  hasSubmission?: boolean;
  hasFeedbackReason?: boolean;
  hasNewSubmissionVersion?: boolean;
  completionReadiness?: CompletionReadinessReport;
}

export interface StateTransitionValidationResult {
  allowed: boolean;
  code?: 'INVALID_TRANSITION' | 'GUARD_FAILED' | 'COMPLETION_GATES_FAILED' | 'SECURITY_VIOLATION';
  reason?: string;
  isSecurityViolation?: boolean;
  postActions?: string[];
}

/**
 * Validates a proposed state machine transition against the transition table, guards, and validators.
 * Direct attempts to bypass state rules (e.g. Draft -> Completed) are flagged as security violations.
 * Progress = 100% is never proof of completion.
 */
export function evaluateTaskStateTransition(
  attempt: StateTransitionAttempt
): StateTransitionValidationResult {
  const { fromState, toState, completionReadiness } = attempt;

  // No-op if same state
  if (fromState === toState) {
    return { allowed: true, postActions: [] };
  }

  const targetRule = TASK_STATE_TRANSITIONS[toState as TaskLifecycleState];
  if (!targetRule) {
    return {
      allowed: false,
      code: 'INVALID_TRANSITION',
      reason: `Unknown or unconfigured target state "${toState}".`,
      isSecurityViolation: true,
    };
  }

  // 1. Transition Table From-States Check
  const isAllowedFrom = targetRule.allowedFrom.includes(fromState as TaskLifecycleState);
  if (!isAllowedFrom) {
    return {
      allowed: false,
      code: 'INVALID_TRANSITION',
      reason: `Illegal state transition from "${fromState}" to "${toState}". This jump is strictly prohibited.`,
      isSecurityViolation: true,
    };
  }

  // 2. Guards Check
  if (targetRule.guards) {
    for (const guard of targetRule.guards) {
      if (guard === 'HAS_ASSIGNEE' && !attempt.hasAssignee) {
        return {
          allowed: false,
          code: 'GUARD_FAILED',
          reason: `Transition to "${toState}" requires an assigned task owner.`,
        };
      }
      if (guard === 'ACTOR_IS_ASSIGNEE_OR_LEAD' && attempt.actorIsAssigneeOrLead === false) {
        return {
          allowed: false,
          code: 'GUARD_FAILED',
          reason: `Only the designated assignee or team lead can accept this task.`,
        };
      }
      if (guard === 'DEPENDENCIES_UNBLOCKED' && attempt.dependenciesUnblocked === false) {
        return {
          allowed: false,
          code: 'GUARD_FAILED',
          reason: `Cannot transition to In Progress: blocked by prerequisite dependencies.`,
        };
      }
      if (guard === 'HAS_BLOCKER_REASON' && !attempt.hasBlockerReason) {
        return {
          allowed: false,
          code: 'GUARD_FAILED',
          reason: `Reporting a blocker requires an explicit blocker reason.`,
        };
      }
      if (guard === 'HAS_SUBMISSION' && !attempt.hasSubmission) {
        return {
          allowed: false,
          code: 'GUARD_FAILED',
          reason: `Submitting for review requires attaching a work submission.`,
        };
      }
      if (guard === 'HAS_FEEDBACK_REASON' && !attempt.hasFeedbackReason) {
        return {
          allowed: false,
          code: 'GUARD_FAILED',
          reason: `Requesting changes requires providing feedback notes.`,
        };
      }
      if (guard === 'HAS_NEW_SUBMISSION_VERSION' && !attempt.hasNewSubmissionVersion) {
        return {
          allowed: false,
          code: 'GUARD_FAILED',
          reason: `Resubmission requires creating a new version of the submission.`,
        };
      }
    }
  }

  // 3. Completion Gates Check
  if (toState === TASK_LIFECYCLE_STATES.COMPLETED) {
    if (completionReadiness && !completionReadiness.canComplete) {
      return {
        allowed: false,
        code: 'COMPLETION_GATES_FAILED',
        reason: `Cannot complete task: Outstanding requirements: ${completionReadiness.outstandingItems.join('; ')}`,
      };
    }
  }

  return {
    allowed: true,
    postActions: targetRule.postActions,
  };
}

export interface TaskLifecycleMetadata {
  state: TaskLifecycleState | string;
  label: string;
  category: string;
  colour: string;
  isTerminal: boolean;
}

export const TASK_LIFECYCLE_METADATA: Record<string, TaskLifecycleMetadata> = {
  [TASK_LIFECYCLE_STATES.DRAFT]: {
    state: TASK_LIFECYCLE_STATES.DRAFT,
    label: 'Draft',
    category: 'draft',
    colour: '#64748b',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.ASSIGNED]: {
    state: TASK_LIFECYCLE_STATES.ASSIGNED,
    label: 'Assigned',
    category: 'assigned',
    colour: '#0284c7',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.ACCEPTED]: {
    state: TASK_LIFECYCLE_STATES.ACCEPTED,
    label: 'Accepted',
    category: 'active',
    colour: '#0891b2',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.IN_PROGRESS]: {
    state: TASK_LIFECYCLE_STATES.IN_PROGRESS,
    label: 'In Progress',
    category: 'active',
    colour: '#2563eb',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.BLOCKED]: {
    state: TASK_LIFECYCLE_STATES.BLOCKED,
    label: 'Blocked',
    category: 'blocked',
    colour: '#e11d48',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.READY_FOR_REVIEW]: {
    state: TASK_LIFECYCLE_STATES.READY_FOR_REVIEW,
    label: 'Ready for Review',
    category: 'review',
    colour: '#7c3aed',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.IN_REVIEW]: {
    state: TASK_LIFECYCLE_STATES.IN_REVIEW,
    label: 'In Review',
    category: 'review',
    colour: '#9333ea',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.CHANGES_REQUESTED]: {
    state: TASK_LIFECYCLE_STATES.CHANGES_REQUESTED,
    label: 'Changes Requested',
    category: 'changes_requested',
    colour: '#d97706',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.RESUBMITTED]: {
    state: TASK_LIFECYCLE_STATES.RESUBMITTED,
    label: 'Resubmitted',
    category: 'review',
    colour: '#4f46e5',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.APPROVED]: {
    state: TASK_LIFECYCLE_STATES.APPROVED,
    label: 'Approved',
    category: 'approved',
    colour: '#0d9488',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.COMPLETED]: {
    state: TASK_LIFECYCLE_STATES.COMPLETED,
    label: 'Completed',
    category: 'done',
    colour: '#16a34a',
    isTerminal: true,
  },
  [TASK_LIFECYCLE_STATES.ON_HOLD]: {
    state: TASK_LIFECYCLE_STATES.ON_HOLD,
    label: 'On Hold',
    category: 'hold',
    colour: '#71717a',
    isTerminal: false,
  },
  [TASK_LIFECYCLE_STATES.CANCELLED]: {
    state: TASK_LIFECYCLE_STATES.CANCELLED,
    label: 'Cancelled',
    category: 'cancelled',
    colour: '#78716c',
    isTerminal: true,
  },
  [TASK_LIFECYCLE_STATES.ARCHIVED]: {
    state: TASK_LIFECYCLE_STATES.ARCHIVED,
    label: 'Archived',
    category: 'archived',
    colour: '#52525b',
    isTerminal: true,
  },
};

export function getTaskStateMetadata(state?: string | null): TaskLifecycleMetadata {
  if (!state) return TASK_LIFECYCLE_METADATA[TASK_LIFECYCLE_STATES.DRAFT];
  return TASK_LIFECYCLE_METADATA[state] || {
    state,
    label: state,
    category: 'active',
    colour: '#3b82f6',
    isTerminal: false,
  };
}

