import { describe, it, expect } from 'vitest';
import { getRolePermissions } from './permissions';

describe('Role-Based Access Control Permissions', () => {
  it('grants full administrative and overarching approval permissions to Super Admin', () => {
    const adminPerms = getRolePermissions('ADMIN');
    expect(adminPerms.canCreateProject).toBe(true);
    expect(adminPerms.canDeleteProject).toBe(true);
    expect(adminPerms.canApproveTasks).toBe(true);
    expect(adminPerms.canApproveDeadlineExtension).toBe(true);
    expect(adminPerms.canViewConfidential).toBe(true);
    expect(adminPerms.canEditLayout).toBe(true);
  });

  it('restricts layout editing and confidential documents for Member role', () => {
    const memberPerms = getRolePermissions('MEMBER');
    expect(memberPerms.canEditLayout).toBe(false);
    expect(memberPerms.canViewConfidential).toBe(false);
    expect(memberPerms.canApproveTasks).toBe(false);
    expect(memberPerms.canAssignTasks).toBe(false);
    expect(memberPerms.canCreateChildNodes).toBe(true);
  });

  it('allows Manager to approve tasks and manage projects but restricts layout editing', () => {
    const managerPerms = getRolePermissions('MANAGER');
    expect(managerPerms.canCreateProject).toBe(true);
    expect(managerPerms.canApproveTasks).toBe(true);
    expect(managerPerms.canEditLayout).toBe(false);
  });

  it('allows Team Lead to approve tasks and assign to team members', () => {
    const leadPerms = getRolePermissions('TEAM_LEAD');
    expect(leadPerms.canApproveTasks).toBe(true);
    expect(leadPerms.canAssignTasks).toBe(true);
    expect(leadPerms.canAssignToMembers).toBe(true);
    expect(leadPerms.canCreateProject).toBe(false);
  });
});
