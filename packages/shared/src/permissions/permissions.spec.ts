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
  canViewNode,
  canEditNode,
  canDeleteNode,
  canAssign,
  canCreateChild,
  canRequestApproval,
  canApprove,
  HIGH_VALUE_APPROVAL_THRESHOLD,
  isComplexApproval,
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

    it('Platform Admin possesses administrative and approval review permissions', () => {
      expect(hasRolePermission('ADMIN', PERMISSIONS.APPROVALS_REVIEW)).toBe(true);
      expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.APPROVALS_REVIEW);
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

  describe('RBAC Node Scope & Governance Functions', () => {
    const adminUser = { id: 'admin-1', role: 'ADMIN' };
    const managerA = { id: 'mgr-a', role: 'MANAGER' };
    const managerB = { id: 'mgr-b', role: 'MANAGER' };
    const teamLeaderA = { id: 'tl-a', role: 'TEAM_LEAD' };
    const memberA = { id: 'mem-a', role: 'MEMBER' };
    const memberB = { id: 'mem-b', role: 'MEMBER' };

    const managerANode = {
      id: 'node-mgr-a',
      createdById: 'mgr-a',
      assigneeId: 'mgr-a',
    };

    const managerBNode = {
      id: 'node-mgr-b',
      createdById: 'mgr-b',
      assigneeId: 'mgr-b',
    };

    const memberANode = {
      id: 'node-mem-a',
      createdById: 'mgr-a',
      assigneeId: 'mem-a',
      assignedById: 'mgr-a',
      parentNodeId: 'node-mgr-a',
    };

    describe('canViewNode', () => {
      it('allows Admin, Manager, and Team Leader to view any node across project', () => {
        expect(canViewNode(adminUser, managerBNode).allowed).toBe(true);
        expect(canViewNode(managerA, managerBNode).allowed).toBe(true);
        expect(canViewNode(teamLeaderA, managerBNode).allowed).toBe(true);
      });

      it('allows Member to view node assigned to them or in their context', () => {
        expect(canViewNode(memberA, memberANode).allowed).toBe(true);
        expect(canViewNode(memberA, { ...managerANode, isContextForUser: true }).allowed).toBe(true);
      });

      it('forbids Member from viewing unrelated tasks without context (403)', () => {
        const res = canViewNode(memberB, memberANode);
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
      });
    });

    describe('canEditNode', () => {
      it('allows Admin full CRUD edit on any node', () => {
        expect(canEditNode(adminUser, managerBNode).allowed).toBe(true);
        expect(canEditNode(adminUser, memberANode).allowed).toBe(true);
      });

      it('allows Manager/TL to edit nodes they created, are assigned to, or in their subtree', () => {
        expect(canEditNode(managerA, managerANode).allowed).toBe(true);
        expect(canEditNode(managerA, { ...memberANode, isInUserSubtree: true }).allowed).toBe(true);
      });

      it('FORBIDS Manager/TL from editing another Manager/TL nodes outside their subtree (403 read-only)', () => {
        const res = canEditNode(managerA, managerBNode);
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.reason).toContain('within their own scope or subtree');
      });

      it('allows Member to update their own assigned task', () => {
        expect(canEditNode(memberA, memberANode).allowed).toBe(true);
      });

      it('FORBIDS Member from editing other members tasks (403)', () => {
        const res = canEditNode(memberB, memberANode);
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
      });
    });

    describe('canDeleteNode', () => {
      it('allows Admin to delete any node', () => {
        expect(canDeleteNode(adminUser, managerBNode).allowed).toBe(true);
      });

      it('allows Manager to delete nodes in their own scope/subtree', () => {
        expect(canDeleteNode(managerA, managerANode).allowed).toBe(true);
        expect(canDeleteNode(managerA, { ...memberANode, isInUserSubtree: true }).allowed).toBe(true);
      });

      it('forbids Manager from deleting another managers node (403)', () => {
        const res = canDeleteNode(managerA, managerBNode);
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
      });

      it('forbids Member from deleting any node (403)', () => {
        const res = canDeleteNode(memberA, memberANode);
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.reason).toContain('Members cannot delete tasks');
      });
    });

    describe('canAssign', () => {
      it('allows Admin to assign anywhere', () => {
        expect(canAssign(adminUser, managerBNode).allowed).toBe(true);
      });

      it('allows Manager to assign inside their scope/subtree', () => {
        expect(canAssign(managerA, managerANode).allowed).toBe(true);
        expect(canAssign(managerA, { ...memberANode, isInUserSubtree: true }).allowed).toBe(true);
      });

      it('forbids Manager from assigning tasks on other managers nodes (403)', () => {
        const res = canAssign(managerA, managerBNode);
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
      });

      it('forbids Member from assigning tasks (403)', () => {
        const res = canAssign(memberA, memberANode);
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
      });
    });

    describe('canCreateChild', () => {
      it('allows Admin to create child under any node', () => {
        expect(canCreateChild(adminUser, managerBNode).allowed).toBe(true);
      });

      it('allows Manager to create child in their scope/subtree', () => {
        expect(canCreateChild(managerA, managerANode).allowed).toBe(true);
      });

      it('forbids Manager from creating child under another managers node (403)', () => {
        const res = canCreateChild(managerA, managerBNode);
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
      });

      it('allows Member to create subtask ONLY under tasks assigned to them', () => {
        expect(canCreateChild(memberA, memberANode).allowed).toBe(true);
      });

      it('forbids Member from creating child under non-assigned tasks (403)', () => {
        const res = canCreateChild(memberA, managerBNode);
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.reason).toContain('under tasks assigned to them');
      });
    });

    describe('canRequestApproval', () => {
      it('allows Member to request approval ONLY to the person who assigned the task', () => {
        const resAllowed = canRequestApproval(memberA, {
          nodeAssignedById: 'mgr-a',
          targetApproverId: 'mgr-a',
        });
        expect(resAllowed.allowed).toBe(true);

        const resForbidden = canRequestApproval(memberA, {
          nodeAssignedById: 'mgr-a',
          targetApproverId: 'mgr-b', // Non-assigner!
        });
        expect(resForbidden.allowed).toBe(false);
        expect(resForbidden.statusCode).toBe(403);
        expect(resForbidden.reason).toContain('only request approval from the person who assigned');
      });

      it('allows Manager and Admin to designate target approver', () => {
        expect(
          canRequestApproval(managerA, {
            nodeAssignedById: 'admin-1',
            targetApproverId: 'admin-1',
          }).allowed
        ).toBe(true);
      });
    });

    describe('canApprove (High-Value and Complex Escalation)', () => {
      it('allows Admin to approve ANY request, including high-value and complex', () => {
        expect(canApprove(adminUser, { amount: 500000, type: 'payment', requesterId: 'mgr-a' }).allowed).toBe(true);
        expect(canApprove(adminUser, { amount: 50000, type: 'task_completion', requesterId: 'mgr-a' }).allowed).toBe(true);
      });

      it('forbids self-approval for anyone (including Admin and Manager) (403)', () => {
        const res = canApprove(managerA, { requesterId: 'mgr-a', amount: 1000 });
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.reason).toContain('Self-approval is forbidden');
      });

      it('allows Manager to approve normal non-high-value requests addressed to them', () => {
        const res = canApprove(managerA, {
          approverId: 'mgr-a',
          requesterId: 'mem-a',
          amount: 50000, // Below 100000 threshold
          type: 'milestone_signoff',
        });
        expect(res.allowed).toBe(true);
      });

      it('FORBIDS Manager from approving requests above HIGH_VALUE_APPROVAL_THRESHOLD (100000) (403 Needs Admin approval)', () => {
        const res = canApprove(managerA, {
          approverId: 'mgr-a',
          requesterId: 'mem-a',
          amount: 150000, // > 100000
          type: 'milestone_signoff',
        });
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.reason).toContain('Needs Admin approval');
      });

      it('FORBIDS Manager from approving complex types (e.g. payment, budget_change, project_archive, role_promotion) (403 Needs Admin approval)', () => {
        const complexTypes = ['payment', 'budget_change', 'project_archive', 'role_promotion'];
        for (const cType of complexTypes) {
          const res = canApprove(managerA, {
            approverId: 'mgr-a',
            requesterId: 'mem-a',
            amount: 5000, // Even with low amount!
            type: cType,
          });
          expect(res.allowed).toBe(false);
          expect(res.statusCode).toBe(403);
          expect(res.reason).toContain('Needs Admin approval');
        }
      });

      it('FORBIDS Member from approving any request (403)', () => {
        const res = canApprove(memberA, { approverId: 'mem-a', requesterId: 'mem-b', amount: 100 });
        expect(res.allowed).toBe(false);
        expect(res.statusCode).toBe(403);
      });
    });
  });
});
