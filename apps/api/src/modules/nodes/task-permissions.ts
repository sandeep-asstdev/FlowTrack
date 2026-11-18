import { Role } from '@prisma/client';

export async function canUserEditTask(
  prisma: any,
  node: {
    id: string;
    projectId: string;
    workspaceId?: string;
    ownerId?: string | null;
    assignedById?: string | null;
    path?: string | null;
    parentNodeId?: string | null;
    project?: {
      id: string;
      ownerId?: string | null;
      responsibleManagerId?: string | null;
    } | null;
  },
  project?: {
    id: string;
    ownerId?: string | null;
    responsibleManagerId?: string | null;
  } | null,
  actorId?: string,
  userRole?: string
): Promise<boolean> {
  if (!actorId) return false;

  const userRoleUpper = (userRole || '').toUpperCase();

  // 1. Admin: any task
  if (userRoleUpper === 'ADMIN') {
    return true;
  }

  if (prisma.membership?.findFirst) {
    const adminMembership = await prisma.membership.findFirst({
      where: { userId: actorId, role: Role.ADMIN },
    });
    if (adminMembership) return true;
  }

  const workspaceId = node.workspaceId;
  let role: Role | null = null;
  if (workspaceId && prisma.membership?.findUnique) {
    const workspaceMembership = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorId } },
    });
    if (workspaceMembership?.role === Role.ADMIN) {
      return true;
    }
    role = workspaceMembership?.role || null;
  }

  if (!role && userRoleUpper) {
    role = (userRoleUpper as Role) || null;
  }

  if (role === Role.ADMIN) {
    return true;
  }

  // 2. Fetch project if not supplied
  let prj = project || node.project;
  if (!prj && node.projectId && prisma.project?.findUnique) {
    prj = await prisma.project.findUnique({
      where: { id: node.projectId },
      select: { id: true, ownerId: true, responsibleManagerId: true },
    });
  }

  // 3. Manager or Team Leader: all tasks in projects they created or are responsible manager for
  const isManagerOrLead = role === Role.MANAGER || role === Role.TEAM_LEAD;
  const isProjectCreatorOrResponsible = Boolean(
    prj && (prj.ownerId === actorId || prj.responsibleManagerId === actorId)
  );

  if (isManagerOrLead && isProjectCreatorOrResponsible) {
    return true;
  }

  // 4. In assigned projects or Member: only tasks assigned to them and their descendants
  if (node.ownerId === actorId || node.assignedById === actorId) {
    return true;
  }

  // Check materialized path for ancestors
  if (node.path && node.path.includes('/')) {
    const pathIds = node.path.split('/').filter(Boolean).filter((id: string) => id !== node.id);
    if (pathIds.length > 0 && prisma.node?.findFirst) {
      const ownedAncestor = await prisma.node.findFirst({
        where: {
          id: { in: pathIds },
          OR: [{ ownerId: actorId }, { assignedById: actorId }],
        },
        select: { id: true },
      });
      if (ownedAncestor) {
        return true;
      }
    }
  }

  // Check parent chain fallback
  let currentParentId = node.parentNodeId;
  const visited = new Set<string>();
  while (currentParentId && !visited.has(currentParentId) && prisma.node?.findUnique) {
    visited.add(currentParentId);
    const parent: any = await prisma.node.findUnique({
      where: { id: currentParentId },
      select: { id: true, parentNodeId: true, ownerId: true, assignedById: true },
    });
    if (!parent) break;
    if (parent.ownerId === actorId || parent.assignedById === actorId) {
      return true;
    }
    currentParentId = parent.parentNodeId;
  }

  return false;
}

export function canUserEditTaskInList(
  node: any,
  project: any,
  allProjectNodes: any[],
  actorId?: string,
  userRole?: string,
  isWorkspaceAdmin = false
): boolean {
  if (!actorId) return false;
  if (isWorkspaceAdmin || (userRole || '').toUpperCase() === 'ADMIN') return true;

  const role = (userRole || 'MEMBER').toUpperCase();
  const isManagerOrLead = role === 'MANAGER' || role === 'TEAM_LEAD';
  const isProjectCreatorOrResponsible = Boolean(
    project && (project.ownerId === actorId || project.responsibleManagerId === actorId)
  );

  if (isManagerOrLead && isProjectCreatorOrResponsible) {
    return true;
  }

  if (node.ownerId === actorId || node.assignedById === actorId) {
    return true;
  }

  const nodeMap = new Map<string, any>(allProjectNodes.map((n) => [n.id, n]));
  let curr = node;
  const visited = new Set<string>();
  while (curr?.parentNodeId && !visited.has(curr.parentNodeId)) {
    visited.add(curr.parentNodeId);
    const parent = nodeMap.get(curr.parentNodeId);
    if (!parent) break;
    if (parent.ownerId === actorId || parent.assignedById === actorId) {
      return true;
    }
    curr = parent;
  }

  if (node.path && node.path.includes('/')) {
    const pathIds = node.path.split('/').filter(Boolean).filter((id: string) => id !== node.id);
    for (const pId of pathIds) {
      const ancestor = nodeMap.get(pId);
      if (ancestor && (ancestor.ownerId === actorId || ancestor.assignedById === actorId)) {
        return true;
      }
    }
  }

  return false;
}
