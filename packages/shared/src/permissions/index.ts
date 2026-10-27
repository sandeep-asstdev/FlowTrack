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

  // Approvals (Managers & Team Leads ONLY. Platform Admin NEVER has this permission!)
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
    // Note: APPROVALS_REVIEW is strictly omitted. Platform Admin is never an approver.
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
