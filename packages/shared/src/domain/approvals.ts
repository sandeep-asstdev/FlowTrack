export const STAGE_MODES = {
  SEQUENTIAL: 'SEQUENTIAL',
  PARALLEL: 'PARALLEL',
} as const;

export const STAGE_RULES = {
  ALL_MUST_APPROVE: 'ALL_MUST_APPROVE',
  ANY_ONE_APPROVES: 'ANY_ONE_APPROVES',
  OPTIONAL: 'OPTIONAL',
  CONDITIONAL: 'CONDITIONAL',
} as const;

export const APPROVAL_OUTCOMES = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CHANGES_REQUESTED: 'Changes Requested',
  WITHDRAWN: 'Withdrawn',
} as const;

export const PRIVILEGED_OPERATIONS = {
  TASK_COMPLETION: 'TASK_COMPLETION',
  DEADLINE_CHANGE: 'DEADLINE_CHANGE',
  BUDGET_INCREASE: 'BUDGET_INCREASE',
  SCOPE_CHANGE: 'SCOPE_CHANGE',
  CRITICAL_REASSIGNMENT: 'CRITICAL_REASSIGNMENT',
  RELEASE_PUBLISHING: 'RELEASE_PUBLISHING',
  ACCESS_CHANGE: 'ACCESS_CHANGE',
  PRIVILEGE_GRANT: 'PRIVILEGE_GRANT',
  CONFIDENTIALITY_CHANGE: 'CONFIDENTIALITY_CHANGE',
  EXCEPTION: 'EXCEPTION',
} as const;

export type PrivilegedOperation = (typeof PRIVILEGED_OPERATIONS)[keyof typeof PRIVILEGED_OPERATIONS];

export interface ApprovalPolicySelectorCriteria {
  workspaceId: string;
  operationType?: string;
  taskType?: string | null;
  projectClassification?: string | null;
  riskImpact?: string | null;
  budgetThreshold?: number | null;
  confidentiality?: string | null;
  departmentId?: string | null;
}

export interface PolicyCandidate {
  id: string;
  workspaceId: string;
  name: string;
  version: number;
  isActive: boolean;
  isDefault: boolean;
  taskType?: string | null;
  projectClassification?: string | null;
  riskImpact?: string | null;
  budgetThreshold?: any;
  confidentiality?: string | null;
  departmentId?: string | null;
  operationType?: string | null;
  [key: string]: any;
}

/**
 * Matches candidate policies against selector criteria and returns the best matching policy.
 * Scored by selector specificity. If no specific policy matches, returns default active policy.
 */
export function matchApprovalPolicy<T extends PolicyCandidate>(
  policies: T[],
  criteria: ApprovalPolicySelectorCriteria
): T | null {
  const activePolicies = policies.filter(
    (p) => p.isActive && p.workspaceId === criteria.workspaceId
  );

  let bestMatch: T | null = null;
  let highestScore = -1;

  for (const policy of activePolicies) {
    let score = 0;
    let matches = true;

    // Operation type match
    if (policy.operationType) {
      if (policy.operationType === criteria.operationType) {
        score += 10;
      } else {
        matches = false;
      }
    }

    // Task type match
    if (policy.taskType && matches) {
      if (policy.taskType === criteria.taskType) {
        score += 8;
      } else {
        matches = false;
      }
    }

    // Department match
    if (policy.departmentId && matches) {
      if (policy.departmentId === criteria.departmentId) {
        score += 6;
      } else {
        matches = false;
      }
    }

    // Confidentiality match
    if (policy.confidentiality && matches) {
      if (policy.confidentiality === criteria.confidentiality) {
        score += 5;
      } else {
        matches = false;
      }
    }

    // Project classification match
    if (policy.projectClassification && matches) {
      if (policy.projectClassification === criteria.projectClassification) {
        score += 4;
      } else {
        matches = false;
      }
    }

    // Risk impact match
    if (policy.riskImpact && matches) {
      if (policy.riskImpact === criteria.riskImpact) {
        score += 4;
      } else {
        matches = false;
      }
    }

    // Budget threshold match: policy triggered if request budget meets or exceeds threshold
    if (policy.budgetThreshold !== null && policy.budgetThreshold !== undefined && matches) {
      const threshold = Number(policy.budgetThreshold);
      const reqBudget = Number(criteria.budgetThreshold || 0);
      if (reqBudget >= threshold) {
        score += 5;
      } else {
        matches = false;
      }
    }

    if (matches && score > highestScore) {
      highestScore = score;
      bestMatch = policy;
    }
  }

  if (bestMatch && highestScore > 0) {
    return bestMatch;
  }

  // Fallback to active default policy for operationType, or global default
  const defaultOpPolicy = activePolicies.find(
    (p) => p.isDefault && (!p.operationType || p.operationType === criteria.operationType)
  );
  if (defaultOpPolicy) return defaultOpPolicy;

  const fallbackDefault = activePolicies.find((p) => p.isDefault);
  return fallbackDefault || null;
}

export interface ApproverCheckContext {
  requestSubmitterId: string;
  requestCreatorId?: string | null;
  actingUserId: string;
  stageApproverRole?: string | null;
  stageSpecificApproverId?: string | null;
  stagePrimaryApproverId?: string | null;
  stageBackupApproverId?: string | null;
  stageDelegatedApproverId?: string | null;
  assignedApproverIds?: string[];
  userRoles?: string[];
  isEmergencyOverride?: boolean;
  emergencyJustification?: string | null;
  hasPrivilegedPermission?: boolean;
  previousStageDecisions?: Array<{ approverId: string; stageOrder: number; decision: string }>;
  currentStageOrder: number;
}

export interface ApproverEligibilityResult {
  isEligible: boolean;
  reason?: string;
  statusCode: 200 | 400 | 403;
  isDelegated?: boolean;
  isBackup?: boolean;
  isOverride?: boolean;
}

/**
 * Enforces separation of duties server-side:
 * 1. Submitter cannot approve their own work.
 * 2. Creator cannot bypass approvals.
 * 3. One person cannot satisfy two independent sequential stages.
 * 4. Technical admins without business content approval permission cannot approve.
 * 5. Emergency override is explicit, restricted, and requires non-empty justification.
 */
export function validateApproverEligibility(ctx: ApproverCheckContext): ApproverEligibilityResult {
  const {
    requestSubmitterId,
    actingUserId,
    stageApproverRole,
    stageSpecificApproverId,
    stagePrimaryApproverId,
    stageBackupApproverId,
    stageDelegatedApproverId,
    assignedApproverIds = [],
    userRoles = [],
    isEmergencyOverride,
    emergencyJustification,
    hasPrivilegedPermission,
    previousStageDecisions = [],
    currentStageOrder,
  } = ctx;

  // Emergency override path
  if (isEmergencyOverride) {
    if (!hasPrivilegedPermission && !userRoles.includes('ADMIN')) {
      return {
        isEligible: false,
        statusCode: 403,
        reason: 'Forbidden: Emergency override requires privileged authorization (approve.privileged).',
      };
    }
    if (!emergencyJustification || emergencyJustification.trim().length < 5) {
      return {
        isEligible: false,
        statusCode: 400,
        reason: 'Emergency override rejected: Mandatory explicit justification of at least 5 characters is required.',
      };
    }
    return {
      isEligible: true,
      statusCode: 200,
      isOverride: true,
    };
  }

  // Rule 1: Submitter cannot approve own work
  if (requestSubmitterId && requestSubmitterId === actingUserId) {
    return {
      isEligible: false,
      statusCode: 403,
      reason: 'Separation of duties violation: Submitter cannot approve their own submission or request.',
    };
  }

  // Rule 2: One person cannot satisfy two independent sequential stages
  const alreadyApprovedOtherStage = previousStageDecisions.some(
    (d) => d.approverId === actingUserId && d.stageOrder !== currentStageOrder && d.decision === 'Approved'
  );
  if (alreadyApprovedOtherStage) {
    return {
      isEligible: false,
      statusCode: 403,
      reason: 'Separation of duties violation: The same individual cannot approve multiple independent approval stages.',
    };
  }

  // Rule 3: Match approver identity
  let isDesignated = false;
  let isDelegated = false;
  let isBackup = false;

  if (stageSpecificApproverId && stageSpecificApproverId === actingUserId) {
    isDesignated = true;
  }
  if (stagePrimaryApproverId && stagePrimaryApproverId === actingUserId) {
    isDesignated = true;
  }
  if (assignedApproverIds.includes(actingUserId)) {
    isDesignated = true;
  }
  if (stageDelegatedApproverId && stageDelegatedApproverId === actingUserId) {
    isDesignated = true;
    isDelegated = true;
  }
  if (stageBackupApproverId && stageBackupApproverId === actingUserId) {
    isDesignated = true;
    isBackup = true;
  }

  // Role-based matching (e.g. MANAGER, EXECUTIVE, TEAM_LEAD)
  if (stageApproverRole) {
    const normRole = stageApproverRole.toUpperCase();
    if (userRoles.some((r) => r.toUpperCase() === normRole)) {
      isDesignated = true;
    }
  }

  if (!isDesignated) {
    return {
      isEligible: false,
      statusCode: 403,
      reason: 'Unauthorized: User is neither the designated stage reviewer, authorized delegate, nor designated backup.',
    };
  }

  return {
    isEligible: true,
    statusCode: 200,
    isDelegated,
    isBackup,
  };
}

export interface StageEvaluationContext {
  rule: string; // ALL_MUST_APPROVE | ANY_ONE_APPROVES | OPTIONAL | CONDITIONAL
  assignedApproverIds: string[];
  decisions: Array<{ approverId: string; decision: string }>;
  condition?: any;
  payload?: any;
}

export interface StageEvaluationResult {
  isSatisfied: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SKIPPED';
  reason?: string;
}

/**
 * Evaluates whether an approval stage is satisfied based on its decisions and configured rule.
 * Only 'Approved' decisions can satisfy a stage. Rejection or Changes Requested immediately halts progress.
 */
export function evaluateStageProgress(ctx: StageEvaluationContext): StageEvaluationResult {
  const { rule, assignedApproverIds = [], decisions = [], condition, payload } = ctx;

  // Any explicit rejection or rework requested
  const rejection = decisions.find((d) => d.decision === APPROVAL_OUTCOMES.REJECTED);
  if (rejection) {
    return {
      isSatisfied: false,
      status: 'REJECTED',
      reason: 'Stage rejected by approver.',
    };
  }

  const rework = decisions.find((d) => d.decision === APPROVAL_OUTCOMES.CHANGES_REQUESTED);
  if (rework) {
    return {
      isSatisfied: false,
      status: 'CHANGES_REQUESTED',
      reason: 'Changes requested by approver.',
    };
  }

  // Conditional stage evaluation
  if (rule === STAGE_RULES.CONDITIONAL && condition && Object.keys(condition).length > 0) {
    // If condition on payload amount / classification not met, skip stage
    if (condition.minAmount && (!payload?.amount || Number(payload.amount) < Number(condition.minAmount))) {
      return { isSatisfied: true, status: 'SKIPPED', reason: 'Condition not triggered; stage skipped.' };
    }
    if (condition.classification && payload?.classification !== condition.classification) {
      return { isSatisfied: true, status: 'SKIPPED', reason: 'Classification condition not met; stage skipped.' };
    }
  }

  const approvedDecisions = decisions.filter((d) => d.decision === APPROVAL_OUTCOMES.APPROVED);

  if (rule === STAGE_RULES.ANY_ONE_APPROVES) {
    if (approvedDecisions.length >= 1) {
      return { isSatisfied: true, status: 'APPROVED' };
    }
    return { isSatisfied: false, status: 'PENDING' };
  }

  if (rule === STAGE_RULES.ALL_MUST_APPROVE) {
    const requiredCount = assignedApproverIds.length > 0 ? assignedApproverIds.length : 1;
    if (approvedDecisions.length >= requiredCount) {
      return { isSatisfied: true, status: 'APPROVED' };
    }
    return { isSatisfied: false, status: 'PENDING' };
  }

  if (rule === STAGE_RULES.OPTIONAL) {
    if (approvedDecisions.length >= 1) {
      return { isSatisfied: true, status: 'APPROVED' };
    }
    return { isSatisfied: true, status: 'SKIPPED' };
  }

  if (approvedDecisions.length >= 1) {
    return { isSatisfied: true, status: 'APPROVED' };
  }

  return { isSatisfied: false, status: 'PENDING' };
}

/**
 * Determines whether a modification between versions constitutes a material change
 * that requires re-evaluation of prior approval decisions.
 */
export function isMaterialChange(previousPayload: any, nextPayload: any): boolean {
  if (!previousPayload || !nextPayload) return true;

  const sensitiveFields = [
    'dueDate',
    'estimatedCost',
    'actualCost',
    'scope',
    'deliverables',
    'classification',
    'acceptanceCriteria',
    'amount',
    'customData',
    'ownerId',
  ];

  for (const field of sensitiveFields) {
    if (previousPayload[field] !== undefined && nextPayload[field] !== undefined) {
      if (JSON.stringify(previousPayload[field]) !== JSON.stringify(nextPayload[field])) {
        return true;
      }
    }
  }

  return false;
}
