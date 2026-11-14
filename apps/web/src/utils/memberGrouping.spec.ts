import { describe, it, expect } from 'vitest';
import { groupMembersByRole } from './memberGrouping';

describe('groupMembersByRole', () => {
  it('groups workspace members into distinct role groups', () => {
    const mockMembers = [
      { userId: 'u1', role: 'MEMBER', user: { fullName: 'Charlie Contributor' } },
      { userId: 'u2', role: 'ADMIN', user: { fullName: 'Alice Admin' } },
      { userId: 'u3', role: 'MANAGER', user: { fullName: 'Bob Manager' } },
      { userId: 'u4', role: 'TEAM_LEAD', user: { fullName: 'Dave Lead' } },
      { userId: 'u5', role: 'MEMBER', user: { fullName: 'Aaron Member' } },
    ];

    const grouped = groupMembersByRole(mockMembers);
    expect(grouped.length).toBe(4);

    expect(grouped[0].role).toBe('MEMBER');
    expect(grouped[0].groupName).toBe('Members / Contributors');
    expect(grouped[0].members.length).toBe(2);
    // Alphabetical within group
    expect(grouped[0].members[0].user.fullName).toBe('Aaron Member');
    expect(grouped[0].members[1].user.fullName).toBe('Charlie Contributor');

    expect(grouped[1].role).toBe('TEAM_LEAD');
    expect(grouped[1].groupName).toBe('Team Leads');
    expect(grouped[1].members[0].user.fullName).toBe('Dave Lead');

    expect(grouped[2].role).toBe('MANAGER');
    expect(grouped[2].groupName).toBe('Managers');
    expect(grouped[2].members[0].user.fullName).toBe('Bob Manager');

    expect(grouped[3].role).toBe('ADMIN');
    expect(grouped[3].groupName).toBe('Administrators');
    expect(grouped[3].members[0].user.fullName).toBe('Alice Admin');
  });

  it('handles empty or invalid member lists gracefully', () => {
    expect(groupMembersByRole([])).toEqual([]);
    expect(groupMembersByRole(null as any)).toEqual([]);
    expect(groupMembersByRole(undefined as any)).toEqual([]);
  });
});

