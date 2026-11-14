export interface GroupedMembers {
  groupName: string;
  role: string;
  members: any[];
}

export function groupMembersByRole(members: any[]): GroupedMembers[] {
  if (!Array.isArray(members) || members.length === 0) return [];

  const groups: Record<string, any[]> = {
    MEMBER: [],
    TEAM_LEAD: [],
    MANAGER: [],
    ADMIN: [],
    OTHER: [],
  };

  members.forEach((m) => {
    const rawRole = (m.role || m.user?.role || 'MEMBER').toUpperCase();
    if (rawRole === 'MEMBER') groups.MEMBER.push(m);
    else if (rawRole === 'TEAM_LEAD' || rawRole === 'LEAD') groups.TEAM_LEAD.push(m);
    else if (rawRole === 'MANAGER' || rawRole === 'PROJECT_MANAGER') groups.MANAGER.push(m);
    else if (rawRole === 'ADMIN' || rawRole === 'OWNER') groups.ADMIN.push(m);
    else groups.OTHER.push(m);
  });

  const sortByName = (a: any, b: any) => {
    const nameA = (a.user?.fullName || a.user?.email || a.fullName || a.email || '').toLowerCase();
    const nameB = (b.user?.fullName || b.user?.email || b.fullName || b.email || '').toLowerCase();
    return nameA.localeCompare(nameB);
  };

  Object.keys(groups).forEach((key) => groups[key].sort(sortByName));

  // Role order: Member -> Team Lead -> Manager -> Administrator -> Other
  const result: GroupedMembers[] = [];

  if (groups.MEMBER.length > 0) {
    result.push({ groupName: 'Members / Contributors', role: 'MEMBER', members: groups.MEMBER });
  }
  if (groups.TEAM_LEAD.length > 0) {
    result.push({ groupName: 'Team Leads', role: 'TEAM_LEAD', members: groups.TEAM_LEAD });
  }
  if (groups.MANAGER.length > 0) {
    result.push({ groupName: 'Managers', role: 'MANAGER', members: groups.MANAGER });
  }
  if (groups.ADMIN.length > 0) {
    result.push({ groupName: 'Administrators', role: 'ADMIN', members: groups.ADMIN });
  }
  if (groups.OTHER.length > 0) {
    result.push({ groupName: 'Other Roles', role: 'OTHER', members: groups.OTHER });
  }

  return result;
}

