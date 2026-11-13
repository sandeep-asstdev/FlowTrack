import { z } from 'zod';
import { MEMBERSHIP_ROLES } from '../constants/index.js';

export type Role = (typeof MEMBERSHIP_ROLES)[keyof typeof MEMBERSHIP_ROLES];

export const roleSchema = z.enum([
  MEMBERSHIP_ROLES.ADMIN,
  MEMBERSHIP_ROLES.MANAGER,
  MEMBERSHIP_ROLES.TEAM_LEAD,
  MEMBERSHIP_ROLES.MEMBER,
  MEMBERSHIP_ROLES.GUEST,
]);

/**
 * Standardized permission vocabulary across FlowTrack.
 */
export const PERMISSIONS = {
  // User Management
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DEACTIVATE: 'users:deactivate',

  // Role Assignment
  ROLES_ASSIGN: 'roles:assign',

  // Scope Management
  TEAMS_MANAGE: 'teams:manage',
  PROJECTS_MANAGE: 'projects:manage',

  // Task Workflow
  TASKS_CREATE: 'tasks:create',
  TASKS_ASSIGN: 'tasks:assign',
  TASKS_UPDATE_ASSIGNED: 'tasks:update_assigned',
  TASKS_SUBMIT: 'tasks:submit',

  // Approvals (Platform Admin has ultimate approval; Managers & Team Leads review within non-high-value scope)
  APPROVALS_REVIEW: 'approvals:review',

  // Audit & Reporting
  AUDIT_READ: 'audit:read',
  REPORTS_VIEW: 'reports:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const permissionSchema = z.enum([
  PERMISSIONS.USERS_READ,
  PERMISSIONS.USERS_CREATE,
  PERMISSIONS.USERS_UPDATE,
  PERMISSIONS.USERS_DEACTIVATE,
  PERMISSIONS.ROLES_ASSIGN,
  PERMISSIONS.TEAMS_MANAGE,
  PERMISSIONS.PROJECTS_MANAGE,
  PERMISSIONS.TASKS_CREATE,
  PERMISSIONS.TASKS_ASSIGN,
  PERMISSIONS.TASKS_UPDATE_ASSIGNED,
  PERMISSIONS.TASKS_SUBMIT,
  PERMISSIONS.APPROVALS_REVIEW,
  PERMISSIONS.AUDIT_READ,
  PERMISSIONS.REPORTS_VIEW,
]);

/**
 * Baseline Role-to-Permissions Mapping Dictionary.
 * Strict Rule: Platform Admin (ADMIN) must NEVER possess APPROVALS_REVIEW.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DEACTIVATE,
    PERMISSIONS.ROLES_ASSIGN,
    PERMISSIONS.TEAMS_MANAGE,
    PERMISSIONS.PROJECTS_MANAGE,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    PERMISSIONS.TASKS_SUBMIT,
    PERMISSIONS.APPROVALS_REVIEW,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.REPORTS_VIEW,
  ],
  MANAGER: [
    PERMISSIONS.TEAMS_MANAGE,
    PERMISSIONS.PROJECTS_MANAGE,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    PERMISSIONS.TASKS_SUBMIT,
    PERMISSIONS.APPROVALS_REVIEW,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.REPORTS_VIEW,
  ],
  TEAM_LEAD: [
    PERMISSIONS.TEAMS_MANAGE,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    PERMISSIONS.TASKS_SUBMIT,
    PERMISSIONS.APPROVALS_REVIEW,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.REPORTS_VIEW,
  ],
  MEMBER: [
    PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    PERMISSIONS.TASKS_SUBMIT,
    PERMISSIONS.AUDIT_READ,
  ],
  GUEST: [
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.REPORTS_VIEW,
  ],
};

/**
 * Checks if a given role inherently possesses a specific permission.
 */
export function hasRolePermission(role: Role | string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const normalized = role.toUpperCase() as Role;
  const permissions = ROLE_PERMISSIONS[normalized];
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * Generic authorization outcome adhering to HTTP status conventions.
 */
export interface AuthorizationResult {
  allowed: boolean;
  statusCode: 200 | 400 | 401 | 403;
  reason?: string;
}

/**
 * Scope Context to separate inherent role capabilities from boundary scope evaluation.
 */
export interface ScopeContext {
  workspaceId: string;
  userWorkspaceId?: string;
  projectId?: string;
  userProjectIds?: string[];
  teamId?: string;
  userTeamIds?: string[];
}

/**
 * Evaluates whether an action falls within the user's authorized organizational / project / team scope.
 */
export function isWithinScope(
  scope: ScopeContext,
  level: 'workspace' | 'project' | 'team'
): boolean {
  // Workspace boundary check
  if (scope.userWorkspaceId && scope.userWorkspaceId !== scope.workspaceId) {
    return false;
  }

  if (level === 'workspace') {
    return true;
  }

  if (level === 'project') {
    if (!scope.projectId) return true;
    if (!scope.userProjectIds || scope.userProjectIds.length === 0) return true; // Workspace-level wide if unassigned
    return scope.userProjectIds.includes(scope.projectId);
  }

  if (level === 'team') {
    if (!scope.teamId) return true;
    if (!scope.userTeamIds || scope.userTeamIds.length === 0) return false;
    return scope.userTeamIds.includes(scope.teamId);
  }

  return true;
}

export interface ApprovalCheckParams {
  userRole?: Role | string | null;
  userId: string;
  taskOwnerId?: string | null;
  taskSubmitterId?: string | null;
  taskReviewerId?: string | null;
  scopeMatches?: boolean;
}

/**
 * Centralized authorization validator for approving or rejecting tasks.
 * Enforces non-negotiable rules:
 * 1. Platform Admin is NEVER an approver.
 * 2. No one can approve their own work or a task they submitted.
 * 3. Only Manager and Team Lead can approve/reject.
 * 4. Respects scope boundaries.
 */
export function canApproveTask(params: ApprovalCheckParams): AuthorizationResult {
  if (!params.userId) {
    return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
  }

  const role = (params.userRole || '').toUpperCase() as Role;

  // Platform Admin (Head of Organization) can oversee and approve anything across the organization
  if (role === MEMBERSHIP_ROLES.ADMIN) {
    return { allowed: true, statusCode: 200 };
  }

  // Rule 2: No one can approve their own work or submission
  if (params.taskOwnerId && params.taskOwnerId === params.userId) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Self-approval is forbidden: You cannot approve or reject a task you are assigned to.',
    };
  }

  if (params.taskSubmitterId && params.taskSubmitterId === params.userId) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Self-approval is forbidden: You cannot approve or reject work you submitted.',
    };
  }

  // Rule 3: Only Manager and Team Lead can approve/reject
  if (role !== MEMBERSHIP_ROLES.MANAGER && role !== MEMBERSHIP_ROLES.TEAM_LEAD) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Unauthorized: Only Managers, Team Leads, and Platform Admins can approve or reject tasks.',
    };
  }

  // Rule 4: Scope check
  if (params.scopeMatches === false) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: Reviewer is outside the authorized project or team scope.',
    };
  }

  return { allowed: true, statusCode: 200 };
}

export interface TaskAssignmentCheckParams {
  userRole?: Role | string | null;
  userId: string;
  targetAssigneeId?: string | null;
  targetReviewerId?: string | null;
  scopeMatches?: boolean;
}

/**
 * Centralized authorization validator for assigning tasks and designating reviewers.
 * Enforces:
 * 1. Basic task assignees (MEMBER / GUEST) cannot assign tasks.
 * 2. Only Admin, Manager, and Team Lead can assign tasks within allowed scope.
 */
export function canAssignTask(params: TaskAssignmentCheckParams): AuthorizationResult {
  if (!params.userId) {
    return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
  }

  const role = (params.userRole || '').toUpperCase() as Role;

  if (
    role !== MEMBERSHIP_ROLES.ADMIN &&
    role !== MEMBERSHIP_ROLES.MANAGER &&
    role !== MEMBERSHIP_ROLES.TEAM_LEAD
  ) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Unauthorized: Only Admins, Managers, and Team Leads can assign tasks or designate reviewers.',
    };
  }

  if (params.scopeMatches === false) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: Cannot assign work outside of your authorized team or project scope.',
    };
  }

  return { allowed: true, statusCode: 200 };
}

/**
 * Schemas for task submission and status lifecycle
 */
export const submitTaskForReviewSchema = z.object({
  feedback: z.string().optional(),
});
export type SubmitTaskForReviewDto = z.infer<typeof submitTaskForReviewSchema>;

export const updateUserStatusSchema = z.object({
  isActive: z.boolean().optional(),
  active: z.boolean().optional(),
}).refine((data) => data.isActive !== undefined || data.active !== undefined, {
  message: 'Either isActive or active must be provided',
});
export type UpdateUserStatusDto = z.infer<typeof updateUserStatusSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'TEAM_LEAD', 'MEMBER', 'GUEST']),
});
export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;

/**
 * Global threshold for high-value approvals.
 * Amounts strictly greater than this threshold MUST escalate to ADMIN.
 */
export const HIGH_VALUE_APPROVAL_THRESHOLD = 100000;

/**
 * Approval types considered complex / sensitive that strictly escalate to ADMIN.
 */
export const COMPLEX_APPROVAL_TYPES = [
  'payment',
  'payments',
  'budget_change',
  'budget',
  'project_archive',
  'archive',
  'role_promotion',
  'role_change',
  'high_value',
] as const;

export function isComplexApproval(type?: string | null, amount?: number | null): boolean {
  if (amount !== undefined && amount !== null && Number(amount) > HIGH_VALUE_APPROVAL_THRESHOLD) {
    return true;
  }
  if (!type) return false;
  const normalized = type.toLowerCase().trim();
  return COMPLEX_APPROVAL_TYPES.some((t) => normalized === t || normalized.includes(t));
}

export function normalizeRole(role?: string | null): Role {
  if (!role) return MEMBERSHIP_ROLES.MEMBER;
  const upper = role.toUpperCase().trim();
  if (upper === 'SUPER_ADMIN' || upper === 'CEO') return MEMBERSHIP_ROLES.ADMIN;
  if (upper === 'TEAM_LEADER' || upper === 'TEAM_LEAD') return MEMBERSHIP_ROLES.TEAM_LEAD;
  if (upper === 'MANAGER') return MEMBERSHIP_ROLES.MANAGER;
  if (upper === 'ADMIN') return MEMBERSHIP_ROLES.ADMIN;
  if (upper === 'GUEST') return MEMBERSHIP_ROLES.GUEST;
  return MEMBERSHIP_ROLES.MEMBER;
}

export interface UserAuthContext {
  id: string;
  role: Role | string;
}

export interface NodeScopeContext {
  id: string;
  projectId?: string;
  createdById?: string | null;
  assigneeId?: string | null;
  assignedById?: string | null;
  parentNodeId?: string | null;
  isInUserSubtree?: boolean;
  isContextForUser?: boolean;
}

export function canViewNode(user: UserAuthContext, node: NodeScopeContext): AuthorizationResult {
  if (!user?.id) return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
  const role = normalizeRole(user.role);

  // ADMIN, MANAGER, TEAM_LEADER can view any task in the project (read-only for non-owned)
  if (role === MEMBERSHIP_ROLES.ADMIN || role === MEMBERSHIP_ROLES.MANAGER || role === MEMBERSHIP_ROLES.TEAM_LEAD) {
    return { allowed: true, statusCode: 200 };
  }

  // MEMBER: Can view if assigned to them, created by them, or context needed to do their task
  const isAssigned = node.assigneeId === user.id;
  const isCreator = node.createdById === user.id;
  const isSubtree = !!node.isInUserSubtree;
  const isContext = !!node.isContextForUser;

  if (isAssigned || isCreator || isSubtree || isContext) {
    return { allowed: true, statusCode: 200 };
  }

  return {
    allowed: false,
    statusCode: 403,
    reason: 'Forbidden: Members can only view tasks assigned to them and their context.',
  };
}

export function canEditNode(user: UserAuthContext, node: NodeScopeContext): AuthorizationResult {
  if (!user?.id) return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
  const role = normalizeRole(user.role);

  // ADMIN: Full CRUD on everything
  if (role === MEMBERSHIP_ROLES.ADMIN) {
    return { allowed: true, statusCode: 200 };
  }

  // MANAGER and TEAM_LEADER:
  // Full CRUD ONLY on data they own or that sits inside their own scope:
  // nodes they created, nodes assigned to them, and the subtree beneath those nodes.
  // They can VIEW other managers'/TL's nodes but NOT edit.
  if (role === MEMBERSHIP_ROLES.MANAGER || role === MEMBERSHIP_ROLES.TEAM_LEAD) {
    const isOwnerOrCreator = node.createdById === user.id || node.assigneeId === user.id;
    const isInScopeSubtree = !!node.isInUserSubtree;

    if (isOwnerOrCreator || isInScopeSubtree) {
      return { allowed: true, statusCode: 200 };
    }

    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: Managers and Team Leaders can only edit nodes within their own scope or subtree.',
    };
  }

  // MEMBER: Worker role. Can ONLY update their own assigned tasks (status, progress, comments, attachments).
  if (role === MEMBERSHIP_ROLES.MEMBER) {
    if (node.assigneeId === user.id) {
      return { allowed: true, statusCode: 200 };
    }
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: Members can only update tasks assigned to them.',
    };
  }

  return { allowed: false, statusCode: 403, reason: 'Forbidden: Insufficient permissions.' };
}

export function canDeleteNode(user: UserAuthContext, node: NodeScopeContext): AuthorizationResult {
  if (!user?.id) return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
  const role = normalizeRole(user.role);

  if (role === MEMBERSHIP_ROLES.ADMIN) {
    return { allowed: true, statusCode: 200 };
  }

  if (role === MEMBERSHIP_ROLES.MANAGER || role === MEMBERSHIP_ROLES.TEAM_LEAD) {
    const isOwnerOrCreator = node.createdById === user.id || node.assigneeId === user.id;
    const isInScopeSubtree = !!node.isInUserSubtree;

    if (isOwnerOrCreator || isInScopeSubtree) {
      return { allowed: true, statusCode: 200 };
    }

    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: You can only delete nodes within your own scope or subtree.',
    };
  }

  // MEMBER cannot delete anything
  return {
    allowed: false,
    statusCode: 403,
    reason: 'Forbidden: Members cannot delete tasks or nodes.',
  };
}

export function canAssign(user: UserAuthContext, node: NodeScopeContext): AuthorizationResult {
  if (!user?.id) return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
  const role = normalizeRole(user.role);

  if (role === MEMBERSHIP_ROLES.ADMIN) {
    return { allowed: true, statusCode: 200 };
  }

  if (role === MEMBERSHIP_ROLES.MANAGER || role === MEMBERSHIP_ROLES.TEAM_LEAD) {
    const isOwnerOrCreator = node.createdById === user.id || node.assigneeId === user.id;
    const isInScopeSubtree = !!node.isInUserSubtree;

    if (isOwnerOrCreator || isInScopeSubtree) {
      return { allowed: true, statusCode: 200 };
    }

    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: You can only assign tasks within your own scope or subtree.',
    };
  }

  return {
    allowed: false,
    statusCode: 403,
    reason: 'Forbidden: Members cannot assign tasks to others.',
  };
}

export function canCreateChild(user: UserAuthContext, parentNode?: NodeScopeContext | null): AuthorizationResult {
  if (!user?.id) return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
  const role = normalizeRole(user.role);

  if (role === MEMBERSHIP_ROLES.ADMIN) {
    return { allowed: true, statusCode: 200 };
  }

  // Root task creation (parentNode is null/undefined)
  if (!parentNode) {
    if (role === MEMBERSHIP_ROLES.MANAGER || role === MEMBERSHIP_ROLES.TEAM_LEAD) {
      return { allowed: true, statusCode: 200 };
    }
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: Members cannot create root-level tasks or projects.',
    };
  }

  if (role === MEMBERSHIP_ROLES.MANAGER || role === MEMBERSHIP_ROLES.TEAM_LEAD) {
    const isOwnerOrCreator = parentNode.createdById === user.id || parentNode.assigneeId === user.id;
    const isInScopeSubtree = !!parentNode.isInUserSubtree;

    if (isOwnerOrCreator || isInScopeSubtree) {
      return { allowed: true, statusCode: 200 };
    }

    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: Managers and Team Leaders can only create child tasks within their own scope.',
    };
  }

  // MEMBER: Can add sub-tasks/tasks ONLY under tasks assigned to them
  if (role === MEMBERSHIP_ROLES.MEMBER) {
    if (parentNode.assigneeId === user.id) {
      return { allowed: true, statusCode: 200 };
    }
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: Members can only create sub-tasks under tasks assigned to them.',
    };
  }

  return { allowed: false, statusCode: 403, reason: 'Forbidden: Insufficient permissions.' };
}

export interface ApprovalRequestParams {
  nodeAssigneeId?: string | null;
  nodeAssignedById?: string | null;
  parentOwnerId?: string | null;
  targetApproverId: string;
}

export function canRequestApproval(user: UserAuthContext, params: ApprovalRequestParams): AuthorizationResult {
  if (!user?.id) return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
  const role = normalizeRole(user.role);

  if (role === MEMBERSHIP_ROLES.ADMIN || role === MEMBERSHIP_ROLES.MANAGER || role === MEMBERSHIP_ROLES.TEAM_LEAD) {
    return { allowed: true, statusCode: 200 };
  }

  if (role === MEMBERSHIP_ROLES.MEMBER) {
    // Member can create approval requests ONLY to the person who assigned them that task (the assigner/parent owner)
    const validAssigners = [params.nodeAssignedById, params.parentOwnerId].filter(Boolean);

    if (validAssigners.length === 0) {
      return {
        allowed: false,
        statusCode: 403,
        reason: 'Forbidden: No assigner found for this task to request approval from.',
      };
    }

    if (!validAssigners.includes(params.targetApproverId)) {
      return {
        allowed: false,
        statusCode: 403,
        reason: 'Forbidden: Members can only request approval from the person who assigned them the task.',
      };
    }

    return { allowed: true, statusCode: 200 };
  }

  return { allowed: false, statusCode: 403, reason: 'Forbidden: Insufficient permissions.' };
}

export interface ApprovalContext {
  id?: string;
  type?: string | null;
  amount?: number | null;
  approverId?: string | null;
  requesterId?: string | null;
}

export function canApprove(user: UserAuthContext, approval: ApprovalContext): AuthorizationResult {
  if (!user?.id) return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
  const role = normalizeRole(user.role);

  // Self-approval is strictly forbidden
  if (approval.requesterId && approval.requesterId === user.id) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Self-approval is forbidden: You cannot approve your own request.',
    };
  }

  // ADMIN: Can approve/reject ANY approval request, including high-value ones.
  if (role === MEMBERSHIP_ROLES.ADMIN) {
    return { allowed: true, statusCode: 200 };
  }

  // MEMBER: Cannot approve
  if (role === MEMBERSHIP_ROLES.MEMBER || role === MEMBERSHIP_ROLES.GUEST) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: Members cannot approve or reject approval requests.',
    };
  }

  // MANAGER / TEAM_LEADER:
  // High-value rule: amount > HIGH_VALUE_APPROVAL_THRESHOLD or complex type MUST escalate to ADMIN
  const isHighValueOrComplex = isComplexApproval(approval.type, approval.amount);
  if (isHighValueOrComplex) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Needs Admin approval: High-value and complex approval requests can only be approved by an Admin.',
    };
  }

  // Must be addressed to this user if approverId is specified
  if (approval.approverId && approval.approverId !== user.id) {
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Forbidden: This approval request is addressed to another approver.',
    };
  }

  return { allowed: true, statusCode: 200 };
}

