import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasRolePermission,
  canApproveTask,
  canAssignTask,
  isWithinScope,
  submitTaskForReviewSchema,
  updateUserStatusSchema,
} from './index.js';

describe('Shared Role and Permission Contracts', () => {
  describe('Inherent Role Permissions (hasRolePermission)', () => {
    it('Platform Admin possesses administrative and task creation permissions', () => {
      expect(hasRolePermission('ADMIN', PERMISSIONS.USERS_READ)).toBe(true);
      expect(hasRolePermission('ADMIN', PERMISSIONS.USERS_CREATE)).toBe(true);
      expect(hasRolePermission('ADMIN', PERMISSIONS.USERS_DEACTIVATE)).toBe(true);
      expect(hasRolePermission('ADMIN', PERMISSIONS.ROLES_ASSIGN)).toBe(true);
      expect(hasRolePermission('ADMIN', PERMISSIONS.TEAMS_MANAGE)).toBe(true);
      expect(hasRolePermission('ADMIN', PERMISSIONS.PROJECTS_MANAGE)).toBe(true);
      expect(hasRolePermission('ADMIN', PERMISSIONS.TASKS_ASSIGN)).toBe(true);
    });

    it('Platform Admin MUST NEVER possess APPROVALS_REVIEW permission', () => {
      expect(hasRolePermission('ADMIN', PERMISSIONS.APPROVALS_REVIEW)).toBe(false);
      expect(ROLE_PERMISSIONS.ADMIN).not.toContain(PERMISSIONS.APPROVALS_REVIEW);
    });

    it('Manager possesses approval, project, team, and assignment permissions', () => {
      expect(hasRolePermission('MANAGER', PERMISSIONS.APPROVALS_REVIEW)).toBe(true);
      expect(hasRolePermission('MANAGER', PERMISSIONS.PROJECTS_MANAGE)).toBe(true);
      expect(hasRolePermission('MANAGER', PERMISSIONS.TEAMS_MANAGE)).toBe(true);
      expect(hasRolePermission('MANAGER', PERMISSIONS.TASKS_ASSIGN)).toBe(true);
      // But lacks platform-wide user management / role assignment
      expect(hasRolePermission('MANAGER', PERMISSIONS.USERS_CREATE)).toBe(false);
      expect(hasRolePermission('MANAGER', PERMISSIONS.ROLES_ASSIGN)).toBe(false);
    });

    it('Team Lead possesses approval, team, and assignment permissions', () => {
      expect(hasRolePermission('TEAM_LEAD', PERMISSIONS.APPROVALS_REVIEW)).toBe(true);
      expect(hasRolePermission('TEAM_LEAD', PERMISSIONS.TEAMS_MANAGE)).toBe(true);
      expect(hasRolePermission('TEAM_LEAD', PERMISSIONS.TASKS_ASSIGN)).toBe(true);
      expect(hasRolePermission('TEAM_LEAD', PERMISSIONS.PROJECTS_MANAGE)).toBe(false);
      expect(hasRolePermission('TEAM_LEAD', PERMISSIONS.USERS_CREATE)).toBe(false);
    });

    it('Member (Assignee) possesses task updating/submitting but strictly lacks assignment and approval', () => {
      expect(hasRolePermission('MEMBER', PERMISSIONS.TASKS_UPDATE_ASSIGNED)).toBe(true);
      expect(hasRolePermission('MEMBER', PERMISSIONS.TASKS_SUBMIT)).toBe(true);
      expect(hasRolePermission('MEMBER', PERMISSIONS.TASKS_ASSIGN)).toBe(false);
      expect(hasRolePermission('MEMBER', PERMISSIONS.APPROVALS_REVIEW)).toBe(false);
      expect(hasRolePermission('MEMBER', PERMISSIONS.USERS_CREATE)).toBe(false);
    });
  });

  describe('Centralized Task Approval Authorization (canApproveTask)', () => {
    it('rejects unauthenticated requests (missing userId) with 401', () => {
      const res = canApproveTask({
        userId: '',
        userRole: 'MANAGER',
      });
      expect(res.allowed).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it('allows Platform Admin to oversee and approve tasks as Head of Organization', () => {
      const res = canApproveTask({
        userId: 'admin-1',
        userRole: 'ADMIN',
        taskOwnerId: 'worker-1',
      });
      expect(res.allowed).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('rejects self-approval for Manager with 403 when assigned to task', () => {
      const res = canApproveTask({
        userId: 'manager-1',
        userRole: 'MANAGER',
        taskOwnerId: 'manager-1', // Same user!
      });
      expect(res.allowed).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.reason).toContain('Self-approval is forbidden');
    });

    it('rejects self-approval for Team Lead with 403 when assigned to task', () => {
      const res = canApproveTask({
        userId: 'lead-1',
        userRole: 'TEAM_LEAD',
        taskOwnerId: 'lead-1', // Same user!
      });
      expect(res.allowed).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.reason).toContain('Self-approval is forbidden');
    });

    it('rejects Member with 403', () => {
      const res = canApproveTask({
        userId: 'member-1',
        userRole: 'MEMBER',
        taskOwnerId: 'worker-2',
      });
      expect(res.allowed).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.reason).toContain('Only Managers, Team Leads, and Platform Admins can approve or reject tasks');
    });

    it('allows Manager to approve task assigned to someone else', () => {
      const res = canApproveTask({
        userId: 'manager-1',
        userRole: 'MANAGER',
        taskOwnerId: 'worker-1',
      });
      expect(res.allowed).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('allows Team Lead to approve task assigned to someone else', () => {
      const res = canApproveTask({
        userId: 'lead-1',
        userRole: 'TEAM_LEAD',
        taskOwnerId: 'worker-1',
      });
      expect(res.allowed).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('rejects approval when scopeMatches is false', () => {
      const res = canApproveTask({
        userId: 'manager-1',
        userRole: 'MANAGER',
        taskOwnerId: 'worker-1',
        scopeMatches: false,
      });
      expect(res.allowed).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.reason).toContain('outside the authorized project or team scope');
    });
  });

  describe('Centralized Task Assignment Authorization (canAssignTask)', () => {
    it('rejects unauthenticated requests with 401', () => {
      const res = canAssignTask({
        userId: '',
        userRole: 'ADMIN',
      });
      expect(res.allowed).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it('rejects Member from assigning tasks with 403', () => {
      const res = canAssignTask({
        userId: 'member-1',
        userRole: 'MEMBER',
        targetAssigneeId: 'member-2',
      });
      expect(res.allowed).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.reason).toContain('Only Admins, Managers, and Team Leads can assign tasks');
    });

    it('allows Admin, Manager, and Team Lead to assign tasks within scope', () => {
      expect(canAssignTask({ userId: 'u1', userRole: 'ADMIN' }).allowed).toBe(true);
      expect(canAssignTask({ userId: 'u2', userRole: 'MANAGER' }).allowed).toBe(true);
      expect(canAssignTask({ userId: 'u3', userRole: 'TEAM_LEAD' }).allowed).toBe(true);
    });

    it('rejects assignment when scopeMatches is false', () => {
      const res = canAssignTask({
        userId: 'lead-1',
        userRole: 'TEAM_LEAD',
        targetAssigneeId: 'worker-99',
        scopeMatches: false,
      });
      expect(res.allowed).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.reason).toContain('Cannot assign work outside of your authorized team or project scope');
    });
  });

  describe('Scope Boundaries (isWithinScope)', () => {
    it('rejects action if workspace IDs do not match', () => {
      const inScope = isWithinScope(
        { workspaceId: 'ws-1', userWorkspaceId: 'ws-2' },
        'workspace'
      );
      expect(inScope).toBe(false);
    });

    it('enforces project scope when user project list is restricted', () => {
      const inScope = isWithinScope(
        {
          workspaceId: 'ws-1',
          userWorkspaceId: 'ws-1',
          projectId: 'proj-1',
          userProjectIds: ['proj-2', 'proj-3'],
        },
        'project'
      );
      expect(inScope).toBe(false);

      const matchingScope = isWithinScope(
        {
          workspaceId: 'ws-1',
          userWorkspaceId: 'ws-1',
          projectId: 'proj-1',
          userProjectIds: ['proj-1', 'proj-2'],
        },
        'project'
      );
      expect(matchingScope).toBe(true);
    });

    it('enforces team scope when user team list is restricted', () => {
      const inScope = isWithinScope(
        {
          workspaceId: 'ws-1',
          userWorkspaceId: 'ws-1',
          teamId: 'team-backend',
          userTeamIds: ['team-frontend'],
        },
        'team'
      );
      expect(inScope).toBe(false);

      const matchingScope = isWithinScope(
        {
          workspaceId: 'ws-1',
          userWorkspaceId: 'ws-1',
          teamId: 'team-backend',
          userTeamIds: ['team-backend'],
        },
        'team'
      );
      expect(matchingScope).toBe(true);
    });
  });

  describe('Zod Validation Schemas', () => {
    it('validates submitTaskForReviewSchema', () => {
      expect(submitTaskForReviewSchema.safeParse({}).success).toBe(true);
      expect(submitTaskForReviewSchema.safeParse({ feedback: 'Ready for review' }).success).toBe(true);
    });

    it('validates updateUserStatusSchema', () => {
      expect(updateUserStatusSchema.safeParse({ active: true }).success).toBe(true);
      expect(updateUserStatusSchema.safeParse({ active: false }).success).toBe(true);
      expect(updateUserStatusSchema.safeParse({ active: 'yes' }).success).toBe(false);
    });
  });
});
