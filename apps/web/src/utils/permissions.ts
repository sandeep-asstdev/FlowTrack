import { hasRolePermission, PERMISSIONS, Role } from '@flowtrack/shared';

export type UserRole = 'ADMIN' | 'MANAGER' | 'TEAM_LEAD' | 'MEMBER' | 'GUEST' | 'VIEWER';

export interface RolePermissions {
  role: UserRole;
  roleLabel: string;
  roleBadgeColor: string;
  canEditProject: boolean; // Edit canvas nodes, connections, titles, and workflow
  canEditLayout: boolean; // Super Admin: can alter layout design, auto-organize
  canManageUsers: boolean; // Super Admin: manage all members, managers, team leads
  canCreateProject: boolean; // Super Admin & Manager: create projects
  canDeleteProject: boolean; // Super Admin & Manager
  canAssignTasks: boolean; // Manager & Team Lead & Super Admin can assign tasks
  canAssignToAnyone: boolean; // Super Admin & Manager: assign to TL or Member
  canAssignToMembers: boolean; // Team Lead: can assign to their team members
  canApproveTasks: boolean; // Manager & Super Admin: Thumbs up / down / sign off
  canApproveDeadlineExtension: boolean; // Manager & Super Admin
  canToggleLock: boolean; // Manager & Super Admin: lock confidential nodes & documents
  canViewConfidential: boolean; // Super Admin & Manager (TL/Member restricted)
  canCreateChildNodes: boolean; // All (Member can create child nodes/subtasks for assigned tasks)
  canSubmitDeadlineExtension: boolean; // Member & Team Lead (when timeline exceeded)
}

export function getRolePermissions(rawRole?: string | null): RolePermissions {
  const normalized = (rawRole || 'MEMBER').toUpperCase();

  if (normalized === 'ADMIN' || normalized === 'SUPER_ADMIN') {
    return {
      role: 'ADMIN',
      roleLabel: 'Super Admin',
      roleBadgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border-purple-300 dark:border-purple-800',
      canEditProject: true,
      canEditLayout: true,
      canManageUsers: true,
      canCreateProject: true,
      canDeleteProject: true,
      canAssignTasks: true,
      canAssignToAnyone: true,
      canAssignToMembers: true,
      canApproveTasks: true, // Platform Admin / Head of Organization can oversee and approve all tasks
      canApproveDeadlineExtension: true,
      canToggleLock: true,
      canViewConfidential: true,
      canCreateChildNodes: true,
      canSubmitDeadlineExtension: true,
    };
  }

  if (normalized === 'MANAGER') {
    return {
      role: 'MANAGER',
      roleLabel: 'Manager',
      roleBadgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-300 dark:border-blue-800',
      canEditProject: true,
      canEditLayout: false, // Altering layout design is reserved for Super Admin
      canManageUsers: true,
      canCreateProject: true,
      canDeleteProject: true,
      canAssignTasks: true,
      canAssignToAnyone: true,
      canAssignToMembers: true,
      canApproveTasks: true,
      canApproveDeadlineExtension: true,
      canToggleLock: true,
      canViewConfidential: true,
      canCreateChildNodes: true,
      canSubmitDeadlineExtension: false,
    };
  }

  if (normalized === 'TEAM_LEAD') {
    return {
      role: 'TEAM_LEAD',
      roleLabel: 'Team Lead',
      roleBadgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      canEditProject: true,
      canEditLayout: false,
      canManageUsers: false,
      canCreateProject: false,
      canDeleteProject: false,
      canAssignTasks: true, // Team Leads can assign tasks to members
      canAssignToAnyone: false,
      canAssignToMembers: true, // Can assign tasks to team members
      canApproveTasks: true, // Team Leads can approve tasks within scope
      canApproveDeadlineExtension: true,
      canToggleLock: false,
      canViewConfidential: false, // Cannot access manager/admin confidential documents
      canCreateChildNodes: true,
      canSubmitDeadlineExtension: true,
    };
  }

  if (normalized === 'VIEWER' || normalized === 'GUEST') {
    return {
      role: 'GUEST',
      roleLabel: 'Guest Viewer',
      roleBadgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
      canEditProject: false,
      canEditLayout: false,
      canManageUsers: false,
      canCreateProject: false,
      canDeleteProject: false,
      canAssignTasks: false,
      canAssignToAnyone: false,
      canAssignToMembers: false,
      canApproveTasks: false,
      canApproveDeadlineExtension: false,
      canToggleLock: false,
      canViewConfidential: false,
      canCreateChildNodes: false,
      canSubmitDeadlineExtension: false,
    };
  }

  // Default: Member
  return {
    role: 'MEMBER',
    roleLabel: 'Member',
    roleBadgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    canEditProject: true,
    canEditLayout: false,
    canManageUsers: false,
    canCreateProject: false,
    canDeleteProject: false,
    canAssignTasks: false, // Members cannot assign tasks
    canAssignToAnyone: false,
    canAssignToMembers: false,
    canApproveTasks: false,
    canApproveDeadlineExtension: false,
    canToggleLock: false,
    canViewConfidential: false, // Cannot view/download locked confidential documents
    canCreateChildNodes: true, // Can create child nodes / subtasks for their tasks
    canSubmitDeadlineExtension: true, // Must submit reason + doc if timeline exceeded
  };
}
