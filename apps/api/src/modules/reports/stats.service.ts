import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationService } from '../auth/authorization.service';

export interface ProjectNodeMetrics {
  totalNodes: number;
  completedNodes: number;
  waitingNodes: number;
  inProgressNodes: number;
  overdueNodes: number;
  pendingApprovalsCount: number;
  avgProgress: number;
}

export interface WorkspaceProjectsSummary {
  totalProjects: number;
  activeCount: number;
  completedCount: number;
  totalWaiting: number;
  totalOverdue: number;
}

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly authService?: AuthorizationService
  ) {}

  /**
   * Excludes deleted and cancelled items; treats null status as 'not_started'.
   */
  filterActiveNodes<T extends { deletedAt?: any; status?: { category?: string } | null; state?: string | null }>(
    nodes: T[]
  ): T[] {
    return (nodes || []).filter((n) => {
      if (n.deletedAt) return false;
      const cat = (n.status?.category || '').toLowerCase();
      const state = (n.state || '').toLowerCase();
      if (cat === 'cancelled' || state === 'cancelled') return false;
      return true;
    });
  }

  /**
   * Resolves whether a viewer has full management visibility on a project.
   */
  canManageAllProjectTasks(
    project: { ownerId?: string | null; responsibleManagerId?: string | null; members?: Array<{ userId: string; role: any }> },
    actorId?: string,
    userRole?: string
  ): boolean {
    if (!actorId) return true;
    const isWorkspaceAdmin = (userRole || '').toUpperCase() === 'ADMIN';
    const isProjectOwner = project?.ownerId === actorId;
    const isResponsibleManager = project?.responsibleManagerId === actorId;
    const memberRec = project?.members?.find((m) => m.userId === actorId);
    const isProjectMemberManager = Boolean(
      memberRec && (memberRec.role === Role.MANAGER || memberRec.role === Role.ADMIN)
    );
    return isWorkspaceAdmin || isProjectOwner || isResponsibleManager || isProjectMemberManager;
  }

  /**
   * Applies task-level isolation matching NodesService.listProjectNodes:
   * non-managers see only tasks assigned/reviewed/submitted/collaborated/watched + ancestors & descendants.
   */
  scopeNodesForViewer<
    T extends {
      id: string;
      path?: string | null;
      ownerId?: string | null;
      assignedById?: string | null;
      submitterId?: string | null;
      reviewerId?: string | null;
      backupReviewerId?: string | null;
      collaboratorIds?: any;
      watcherIds?: any;
    }
  >(nodes: T[], project: any, actorId?: string, userRole?: string): T[] {
    if (!actorId || this.canManageAllProjectTasks(project, actorId, userRole)) {
      return nodes;
    }

    const assignedNodes = nodes.filter(
      (n) =>
        n.ownerId === actorId ||
        n.assignedById === actorId ||
        n.submitterId === actorId ||
        n.reviewerId === actorId ||
        n.backupReviewerId === actorId ||
        (Array.isArray(n.collaboratorIds) && (n.collaboratorIds as string[]).includes(actorId)) ||
        (Array.isArray(n.watcherIds) && (n.watcherIds as string[]).includes(actorId))
    );

    const accessibleNodeIds = new Set<string>();
    for (const an of assignedNodes) {
      accessibleNodeIds.add(an.id);
      const anPath = an.path || `/${an.id}`;
      for (const pId of anPath.split('/').filter(Boolean)) {
        accessibleNodeIds.add(pId);
      }
      for (const cand of nodes) {
        const candPath = cand.path || `/${cand.id}`;
        if (candPath.startsWith(`${anPath}/`)) {
          accessibleNodeIds.add(cand.id);
        }
      }
    }

    return nodes.filter((n) => accessibleNodeIds.has(n.id));
  }

  /**
   * Computes normalized node metrics from active (non-deleted, non-cancelled) nodes.
   */
  computeNodeMetrics(nodes: any[], now = new Date()): ProjectNodeMetrics {
    const active = this.filterActiveNodes(nodes);
    const totalNodes = active.length;

    let completedNodes = 0;
    let waitingNodes = 0;
    let inProgressNodes = 0;
    let overdueNodes = 0;
    let pendingApprovalsCount = 0;
    let progressSum = 0;

    for (const n of active) {
      const cat = (n.status?.category || 'not_started').toLowerCase();
      const state = (n.state || '').toLowerCase();
      const isDone = cat === 'done' || state === 'completed';

      if (isDone) completedNodes++;
      else if (cat === 'blocked') waitingNodes++;
      else if (cat === 'active') inProgressNodes++;

      if (!isDone && n.dueDate && new Date(n.dueDate) < now) {
        overdueNodes++;
      }
      if (n.approvalStatus === 'pending') {
        pendingApprovalsCount++;
      }
      progressSum += n.progressPct || 0;
    }

    return {
      totalNodes,
      completedNodes,
      waitingNodes,
      inProgressNodes,
      overdueNodes,
      pendingApprovalsCount,
      avgProgress: totalNodes > 0 ? Math.round(progressSum / totalNodes) : 0,
    };
  }

  /**
   * Returns visible, active, viewer-scoped nodes for a single project (throws 404 if project hidden).
   */
  async getVisibleProjectNodes(
    projectId: string,
    actorId?: string,
    userRole?: string,
    include?: Record<string, any>
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { members: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    let effectiveRole = userRole;
    if (!effectiveRole && actorId && this.prisma.membership?.findUnique) {
      const m = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: actorId } },
      });
      effectiveRole = m?.role;
    }

    if (this.authService?.isProjectVisibleToUser && actorId) {
      const visible = await this.authService.isProjectVisibleToUser(
        { id: actorId, role: effectiveRole, workspaceId: project.workspaceId },
        projectId
      );
      if (!visible) {
        throw new NotFoundException('Project not found');
      }
    }

    const rawNodes = await this.prisma.node.findMany({
      where: { projectId, deletedAt: null },
      include: include || {
        status: { select: { id: true, key: true, category: true, colour: true } },
      },
      orderBy: [{ positionY: 'asc' }, { createdAt: 'asc' }],
    });

    const activeNodes = this.filterActiveNodes(rawNodes);
    const scopedNodes = this.scopeNodesForViewer(activeNodes, project, actorId, effectiveRole);

    return { project, nodes: scopedNodes, effectiveRole };
  }

  /**
   * Computes scoped per-project metrics and workspace summary for Projects overview.
   */
  async computeProjectsOverview(
    workspaceId: string,
    projects: any[],
    user?: { id?: string; role?: string }
  ): Promise<{ projectsWithMetrics: any[]; summary: WorkspaceProjectsSummary }> {
    const projectIds = projects.map((p) => p.id);
    const allNodes =
      projectIds.length > 0
        ? await this.prisma.node.findMany({
            where: { projectId: { in: projectIds }, deletedAt: null },
            select: {
              id: true,
              projectId: true,
              path: true,
              ownerId: true,
              assignedById: true,
              submitterId: true,
              reviewerId: true,
              backupReviewerId: true,
              collaboratorIds: true,
              watcherIds: true,
              progressPct: true,
              dueDate: true,
              state: true,
              approvalStatus: true,
              deletedAt: true,
              status: { select: { category: true } },
            },
          })
        : [];

    const membersByProject = new Map<string, any[]>();
    if (projectIds.length > 0 && this.prisma.projectMember?.findMany) {
      const pms = await this.prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, userId: true, role: true },
      });
      for (const pm of pms) {
        const arr = membersByProject.get(pm.projectId) || [];
        arr.push(pm);
        membersByProject.set(pm.projectId, arr);
      }
    }

    const nodesByProject = new Map<string, any[]>();
    for (const node of allNodes) {
      const arr = nodesByProject.get(node.projectId) || [];
      arr.push(node);
      nodesByProject.set(node.projectId, arr);
    }

    const now = new Date();
    let totalWaiting = 0;
    let totalOverdue = 0;
    let activeCount = 0;
    let completedCount = 0;

    const projectsWithMetrics = projects.map((project) => {
      const rawNodes = nodesByProject.get(project.id) || [];
      const activeNodes = this.filterActiveNodes(rawNodes);
      const projWithMembers = { ...project, members: project.members || membersByProject.get(project.id) || [] };
      const scopedNodes = this.scopeNodesForViewer(activeNodes, projWithMembers, user?.id, user?.role);
      const metrics = this.computeNodeMetrics(scopedNodes, now);

      totalWaiting += metrics.waitingNodes;
      totalOverdue += metrics.overdueNodes;
      if (project.status === 'COMPLETED' || (metrics.totalNodes > 0 && metrics.avgProgress === 100)) {
        completedCount++;
      } else if (project.status === 'ACTIVE' || !project.status) {
        activeCount++;
      }

      return { ...project, metrics };
    });

    return {
      projectsWithMetrics,
      summary: {
        totalProjects: projectsWithMetrics.length,
        activeCount,
        completedCount,
        totalWaiting,
        totalOverdue,
      },
    };
  }

  /**
   * Computes authoritative Navbar badge counts (unread bell + pending approvals queue) on the server.
   */
  async getNavbarCounts(workspaceId: string | undefined, userId: string) {
    const unreadNotificationsCount = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    let membershipRole: string | undefined;
    if (workspaceId && this.prisma.membership?.findUnique) {
      const m = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      membershipRole = m?.role;
    }

    const isWorkspaceAdmin = (membershipRole || '').toUpperCase() === 'ADMIN';

    // Count pending approval requests or tasks awaiting this viewer's decision, excluding deleted/cancelled
    const visibilityFilter =
      workspaceId && this.authService?.getProjectVisibilityFilter
        ? this.authService.getProjectVisibilityFilter({ id: userId, role: membershipRole, workspaceId })
        : workspaceId
        ? { workspaceId, deletedAt: null }
        : { deletedAt: null };

    const pendingNodes = await this.prisma.node.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        deletedAt: null,
        approvalStatus: 'pending',
        project: visibilityFilter,
        OR: isWorkspaceAdmin
          ? undefined
          : [
              { reviewerId: userId },
              { backupReviewerId: userId },
              {
                approvalRequests: {
                  some: {
                    status: 'PENDING',
                    OR: [
                      { stageInstances: { some: { status: 'PENDING', primaryApproverId: userId } } },
                      { stageInstances: { some: { status: 'PENDING', backupApproverId: userId } } },
                      { stageInstances: { some: { status: 'PENDING', delegatedApproverId: userId } } },
                    ],
                  },
                },
              },
            ],
      },
      select: {
        id: true,
        state: true,
        deletedAt: true,
        status: { select: { category: true } },
      },
    });

    const activePendingNodes = this.filterActiveNodes(pendingNodes);

    return {
      unreadNotificationsCount,
      pendingApprovalsCount: activePendingNodes.length,
    };
  }
}
