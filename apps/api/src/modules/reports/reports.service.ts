import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationService } from '../auth/authorization.service';
import {
  calculateUniversalDashboardMetrics,
  generateProjectCsv,
  ReportFilterOptions,
  UniversalDashboardMetrics,
  RoleScopedDashboardResponse,
  GRANULAR_PERMISSIONS,
} from '@flowtrack/shared';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly authService?: AuthorizationService
  ) {}

  /**
   * Validates user membership in the workspace.
   */
  private async getMembership(workspaceId: string, userId: string) {
    const member = await this.prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('You do not have access to this workspace.');
    }
    return member;
  }

  /**
   * Generates an adaptive, universal project dashboard adapting to the project industry and configuration.
   */
  async getProjectDashboard(
    workspaceId: string,
    projectId: string,
    userId: string,
    filters: ReportFilterOptions = {}
  ): Promise<UniversalDashboardMetrics> {
    const member = await this.getMembership(workspaceId, userId);

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (this.authService) {
      const evalResult = await this.authService.evaluate(
        { id: userId, role: member.role, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_VIEW,
        { project }
      );
      if (!evalResult.allowed) {
        throw new NotFoundException('Project not found');
      }
    }

    // Load nodes with relations for comprehensive reporting
    const nodes = await this.prisma.node.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      include: {
        status: {
          select: {
            id: true,
            key: true,
            category: true,
            colour: true,
          },
        },
        owner: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        nodeType: {
          select: {
            id: true,
            key: true,
            name: true,
            icon: true,
          },
        },
        parentNode: {
          select: {
            id: true,
            title: true,
          },
        },
        documents: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            category: true,
            version: true,
          },
        },
      },
      orderBy: [{ positionY: 'asc' }, { createdAt: 'asc' }],
    });

    const metrics = calculateUniversalDashboardMetrics(nodes, project, filters, new Date());

    // Role-based financial visibility: if MEMBER or VIEWER, contingency reserve details can be masked
    if (member.role === 'MEMBER') {
      if (metrics.financials.isConfigured) {
        metrics.financials.contingencyReserve = null;
        metrics.financials.remainingContingency = null;
      }
    }

    return metrics;
  }

  /**
   * Cross-project workspace summary for the authenticated user
   */
  async getWorkspaceDashboard(workspaceId: string, userId: string) {
    const member = await this.getMembership(workspaceId, userId);

    const visibilityFilter = this.authService
      ? this.authService.getProjectVisibilityFilter({
          id: userId,
          role: member.role,
          workspaceId,
        })
      : { workspaceId, deletedAt: null };

    const projects = await this.prisma.project.findMany({
      where: {
        ...visibilityFilter,
      },
      select: {
        id: true,
        name: true,
        status: true,
        settings: true,
        _count: {
          select: {
            nodes: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const now = new Date();

    // User's assigned tasks across all projects
    const myAssignedNodes = await this.prisma.node.findMany({
      where: {
        workspaceId,
        ownerId: userId,
        deletedAt: null,
      },
      include: {
        project: { select: { id: true, name: true } },
        status: { select: { id: true, key: true, category: true, colour: true } },
      },
      orderBy: [{ dueDate: 'asc' }],
      take: 20,
    });

    // Tasks waiting for user's approval
    const pendingReviews = await this.prisma.node.findMany({
      where: {
        workspaceId,
        reviewerId: userId,
        approvalStatus: 'pending',
        deletedAt: null,
      },
      include: {
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, fullName: true } },
        status: { select: { key: true, category: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 10,
    });

    const overdueCount = myAssignedNodes.filter(
      (n) => n.dueDate && new Date(n.dueDate) < now && n.status?.category !== 'done' && n.status?.category !== 'cancelled'
    ).length;

    return {
      projectsSummary: {
        totalProjects: projects.length,
        activeProjects: projects.filter((p) => p.status === 'ACTIVE').length,
        projectsList: projects,
      },
      myWork: {
        assignedCount: myAssignedNodes.length,
        overdueCount,
        tasks: myAssignedNodes.map((n) => ({
          id: n.id,
          title: n.title,
          projectId: n.projectId,
          projectName: n.project.name,
          progressPct: n.progressPct,
          statusCategory: n.status?.category || 'not_started',
          statusKey: n.status?.key || 'Not Started',
          dueDate: n.dueDate,
          isOverdue: Boolean(n.dueDate && new Date(n.dueDate) < now && n.status?.category !== 'done'),
        })),
      },
      pendingReviews: pendingReviews.map((r) => ({
        id: r.id,
        title: r.title,
        projectId: r.projectId,
        projectName: r.project.name,
        submittedBy: r.owner?.fullName || 'Unassigned',
        approvalStatus: r.approvalStatus,
      })),
    };
  }

  /**
   * Generates a CSV export of project reports.
   */
  async exportProjectCsv(
    workspaceId: string,
    projectId: string,
    userId: string,
    reportType: 'tasks' | 'milestones' | 'financials' | 'workload' = 'tasks'
  ) {
    await this.getMembership(workspaceId, userId);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const metrics = await this.getProjectDashboard(workspaceId, projectId, userId);
    const csvContent = generateProjectCsv(metrics, project, reportType);

    const safeName = (project.name || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeName}-${reportType}-report-${Date.now()}.csv`;

    return {
      filename,
      csv: csvContent,
    };
  }

  /**
   * Retrieves an optimized, role-scoped overview for the authenticated user:
   * - Platform Admin: user overview, role breakdown, team summary, recent audit activity
   * - Manager / Team Lead: pending review queue, team workload capacity, blockers
   * - Assignee: assigned tasks with status, priority, due date, and review cycle feedback
   */
  async getRoleScopedDashboard(workspaceId: string, userId: string): Promise<RoleScopedDashboardResponse> {
    const membership = await this.getMembership(workspaceId, userId);
    const role = membership.role;
    const now = new Date();

    const response: RoleScopedDashboardResponse = {
      role,
      workspaceId,
    };

    // 1. ADMIN USER OVERVIEW
    if (role === 'ADMIN') {
      const [members, teams, recentLogs] = await Promise.all([
        this.prisma.membership.findMany({
          where: { workspaceId },
          include: {
            user: {
              select: { id: true, fullName: true, email: true, isActive: true, deletedAt: true },
            },
          },
        }),
        this.prisma.team.findMany({
          where: { workspaceId },
          include: {
            _count: { select: { members: true } },
          },
        }),
        this.prisma.auditLog.findMany({
          where: { workspaceId },
          include: {
            actor: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 15,
        }),
      ]);

      const activeUsers = members.filter((m) => m.user?.isActive && !m.user?.deletedAt).length;
      const deactivatedUsers = members.length - activeUsers;
      const roleDistribution: Record<string, number> = {
        ADMIN: 0,
        MANAGER: 0,
        TEAM_LEAD: 0,
        MEMBER: 0,
        GUEST: 0,
      };
      for (const m of members) {
        if (roleDistribution[m.role] !== undefined) {
          roleDistribution[m.role]++;
        } else {
          roleDistribution[m.role] = 1;
        }
      }

      response.adminOverview = {
        totalUsers: members.length,
        activeUsers,
        deactivatedUsers,
        roleDistribution,
        teamsCount: teams.length,
        teamsSummary: teams.map((t) => ({
          id: t.id,
          name: t.name,
          colour: t.colour,
          memberCount: t._count.members,
        })),
        recentAuditActivity: recentLogs.map((log) => ({
          id: log.id,
          action: log.action,
          entityName: log.entityName,
          entityId: log.entityId,
          actor: log.actor,
          createdAt: log.createdAt,
          oldValues: log.oldValues,
          newValues: log.newValues,
        })),
      };
    }

    // 2. MANAGER / TEAM LEAD VIEW (Pending reviews and team workload)
    if (role === 'ADMIN' || role === 'MANAGER' || role === 'TEAM_LEAD') {
      const projectMembers = this.prisma.projectMember
        ? await this.prisma.projectMember.findMany({ where: { userId } }).catch(() => [])
        : [];
      const teamMemberships = this.prisma.teamMember
        ? await this.prisma.teamMember.findMany({ where: { userId } }).catch(() => [])
        : [];

      const managedProjectIds = projectMembers
        .filter((pm) => pm.role === 'MANAGER' || pm.role === 'ADMIN')
        .map((pm) => pm.projectId);
      const ledTeamIds = teamMemberships
        .filter((tm) => tm.role === 'lead')
        .map((tm) => tm.teamId);

      // Pending Review Queue
      const pendingNodes = (await this.prisma.node.findMany({
        where: {
          workspaceId,
          approvalStatus: 'pending',
          deletedAt: null,
          ...(role === 'TEAM_LEAD' && ledTeamIds.length > 0 ? { teamId: { in: ledTeamIds } } : {}),
          ...(role === 'MANAGER' && managedProjectIds.length > 0 ? { projectId: { in: managedProjectIds } } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          submitter: { select: { id: true, fullName: true, email: true } },
          owner: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { submittedAt: 'desc' },
        take: 20,
      })) || [];

      // Reviewer cannot be submitter or assignee
      const filteredPending = pendingNodes.filter(
        (n) => n.ownerId !== userId && n.submitterId !== userId
      );

      // Team Workload calculation
      const targetTeamIds = ledTeamIds.length > 0 ? ledTeamIds : undefined;
      const scopedTeamMembers = await this.prisma.teamMember.findMany({
        where: {
          team: {
            workspaceId,
            ...(targetTeamIds ? { id: { in: targetTeamIds } } : {}),
          },
        },
        include: {
          user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          team: { select: { id: true, name: true } },
        },
      }).catch(() => []);

      const scopedUserIds = Array.from(new Set(scopedTeamMembers.map((tm) => tm.userId)));

      // Query tasks for scoped members
      const memberNodes = scopedUserIds.length > 0
        ? await this.prisma.node.findMany({
            where: {
              workspaceId,
              ownerId: { in: scopedUserIds },
              deletedAt: null,
            },
            include: {
              status: { select: { category: true } },
            },
          })
        : [];

      const memberMap = new Map<string, {
        assigned: number;
        completed: number;
        overdue: number;
        allocatedHours: number;
        actualHours: number;
      }>();

      for (const node of memberNodes) {
        if (!node.ownerId) continue;
        const current = memberMap.get(node.ownerId) || {
          assigned: 0,
          completed: 0,
          overdue: 0,
          allocatedHours: 0,
          actualHours: 0,
        };
        const isCompleted = node.status?.category === 'done';
        if (isCompleted) {
          current.completed++;
        } else {
          current.assigned++;
          if (node.dueDate && new Date(node.dueDate) < now && node.status?.category !== 'cancelled') {
            current.overdue++;
          }
        }
        if (node.allocatedHours) current.allocatedHours += Number(node.allocatedHours);
        if (node.actualHours) current.actualHours += Number(node.actualHours);
        memberMap.set(node.ownerId, current);
      }

      const teamWorkload = scopedTeamMembers.map((tm) => {
        const stats = memberMap.get(tm.userId) || {
          assigned: 0,
          completed: 0,
          overdue: 0,
          allocatedHours: 0,
          actualHours: 0,
        };
        return {
          userId: tm.userId,
          fullName: tm.user.fullName,
          email: tm.user.email,
          avatarUrl: tm.user.avatarUrl,
          role: tm.role,
          teamId: tm.teamId,
          teamName: tm.team.name,
          assignedTasksCount: stats.assigned,
          completedTasksCount: stats.completed,
          overdueTasksCount: stats.overdue,
          allocatedHours: Math.round(stats.allocatedHours * 10) / 10,
          actualHours: Math.round(stats.actualHours * 10) / 10,
        };
      });

      const blockedTasksCount = await this.prisma.node.count({
        where: {
          workspaceId,
          deletedAt: null,
          status: { category: 'blocked' },
          ...(role === 'TEAM_LEAD' && ledTeamIds.length > 0 ? { teamId: { in: ledTeamIds } } : {}),
          ...(role === 'MANAGER' && managedProjectIds.length > 0 ? { projectId: { in: managedProjectIds } } : {}),
        },
      });

      response.managerWorkload = {
        pendingReviewCount: filteredPending.length,
        pendingReviews: filteredPending.map((p) => {
          const subDate = p.submittedAt ? new Date(p.submittedAt) : p.createdAt;
          const daysPending = Math.max(0, Math.floor((now.getTime() - subDate.getTime()) / (1000 * 60 * 60 * 24)));
          return {
            id: p.id,
            title: p.title,
            projectId: p.projectId,
            projectName: p.project.name,
            submittedAt: p.submittedAt,
            submitterName: p.submitter?.fullName || p.owner?.fullName || 'Assignee',
            submitterEmail: p.submitter?.email || p.owner?.email || '',
            priority: p.priority,
            daysPending,
          };
        }),
        teamWorkload,
        blockedTasksCount,
      };
    }

    // 3. ASSIGNEE VIEW (For all roles, including MEMBER, GUEST, and self-work)
    const [assignedNodes, reviewItems] = await Promise.all([
      this.prisma.node.findMany({
        where: {
          workspaceId,
          ownerId: userId,
          deletedAt: null,
          OR: [
            { statusId: null },
            { status: { category: { not: 'cancelled' } } },
          ],
        },
        include: {
          project: { select: { id: true, name: true } },
          status: { select: { key: true, category: true, colour: true } },
          assignedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
        take: 50,
      }),
      this.prisma.node.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          OR: [
            { ownerId: userId },
            { submitterId: userId },
          ],
          approvalStatus: { in: ['pending', 'rejected', 'changes_requested', 'approved'] },
        },
        include: {
          project: { select: { id: true, name: true } },
          reviewer: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 50,
      }),
    ]);

    const safeAssigned = assignedNodes || [];
    const safeReview = reviewItems || [];

    // If no tasks found in current workspaceId, check if user has tasks across any of their memberships
    if (safeAssigned.length === 0 && this.prisma.membership) {
      try {
        const userMems = await this.prisma.membership.findMany({
          where: { userId },
          select: { workspaceId: true },
        });
        const otherWsIds = userMems.map((m) => m.workspaceId).filter((id) => id !== workspaceId);
        if (otherWsIds.length > 0) {
          const crossWsTasks = await this.prisma.node.findMany({
            where: {
              workspaceId: { in: otherWsIds },
              ownerId: userId,
              deletedAt: null,
              OR: [
                { statusId: null },
                { status: { category: { not: 'cancelled' } } },
              ],
            },
            include: {
              project: { select: { id: true, name: true } },
              status: { select: { key: true, category: true, colour: true } },
              assignedBy: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
            take: 50,
          });
          safeAssigned.push(...crossWsTasks);
        }
      } catch {
        // non-blocking
      }
    }

    if (safeReview.length === 0 && this.prisma.membership) {
      try {
        const userMems = await this.prisma.membership.findMany({
          where: { userId },
          select: { workspaceId: true },
        });
        const otherWsIds = userMems.map((m) => m.workspaceId).filter((id) => id !== workspaceId);
        if (otherWsIds.length > 0) {
          const crossWsReviews = await this.prisma.node.findMany({
            where: {
              workspaceId: { in: otherWsIds },
              deletedAt: null,
              OR: [
                { ownerId: userId },
                { submitterId: userId },
              ],
              approvalStatus: { in: ['pending', 'rejected', 'changes_requested', 'approved'] },
            },
            include: {
              project: { select: { id: true, name: true } },
              reviewer: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: [{ updatedAt: 'desc' }],
            take: 50,
          });
          safeReview.push(...crossWsReviews);
        }
      } catch {
        // non-blocking
      }
    }

    // Pending review decisions waiting on this user (as reviewer or chosen approver)
    let pendingDecisionsForMe: any[] = [];
    try {
      if (this.prisma.node?.findMany) {
        pendingDecisionsForMe = await this.prisma.node.findMany({
          where: {
            approvalStatus: 'pending',
            deletedAt: null,
            OR: [{ reviewerId: userId }, { backupReviewerId: userId }],
          },
          include: {
            project: { select: { id: true, name: true } },
            submitter: { select: { id: true, fullName: true, email: true } },
            owner: { select: { id: true, fullName: true, email: true } },
            documents: { where: { deletedAt: null } },
            approvalRequests: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { submittedAt: 'desc' },
          take: 20,
        });
      }
    } catch {
      // non-blocking
    }

    let pendingApprovalRequestsForMe: any[] = [];
    try {
      if (this.prisma.approvalRequest?.findMany) {
        pendingApprovalRequestsForMe = await this.prisma.approvalRequest.findMany({
          where: {
            status: 'PENDING',
            OR: [
              {
                stageInstances: {
                  some: {
                    status: 'PENDING',
                    OR: [
                      { primaryApproverId: userId },
                      { backupApproverId: userId },
                      { delegatedApproverId: userId },
                    ],
                  },
                },
              },
              {
                node: {
                  OR: [{ reviewerId: userId }, { backupReviewerId: userId }],
                },
              },
            ],
          },
          include: {
            node: {
              select: {
                id: true,
                title: true,
                state: true,
                customData: true,
                documents: { where: { deletedAt: null } },
              },
            },
            project: { select: { id: true, name: true } },
            submitter: { select: { id: true, fullName: true, email: true } },
            evidence: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
      }
    } catch {
      // non-blocking
    }

    const directPendingReviews = [
      ...(Array.isArray(pendingDecisionsForMe) ? pendingDecisionsForMe : []).map((p) => {
        const subDate = p.submittedAt ? new Date(p.submittedAt) : p.createdAt;
        const daysPending = Math.max(0, Math.floor((now.getTime() - subDate.getTime()) / (1000 * 60 * 60 * 24)));
        const reqReason =
          (p.approvalRequests?.[0]?.payload as any)?.reason ||
          (p.approvalRequests?.[0]?.payload as any)?.notes ||
          (p.customData as any)?.approvalReason ||
          '';
        const docs = p.documents || [];
        return {
          id: p.id,
          title: p.title,
          projectId: p.projectId,
          projectName: p.project?.name || 'Project',
          submittedAt: p.submittedAt,
          submitterName: p.submitter?.fullName || p.owner?.fullName || 'Requester',
          submitterEmail: p.submitter?.email || p.owner?.email || '',
          priority: p.priority,
          daysPending,
          reason: reqReason,
          documents: docs,
        };
      }),
      ...(Array.isArray(pendingApprovalRequestsForMe) ? pendingApprovalRequestsForMe : []).map((ar) => {
        const subDate = ar.createdAt ? new Date(ar.createdAt) : now;
        const daysPending = Math.max(0, Math.floor((now.getTime() - subDate.getTime()) / (1000 * 60 * 60 * 24)));
        const reqReason =
          (ar.payload as any)?.reason ||
          (ar.payload as any)?.notes ||
          (ar.node?.customData as any)?.approvalReason ||
          '';
        const docs = ar.node?.documents || ar.evidence || [];
        return {
          id: ar.node?.id || ar.id,
          requestId: ar.id,
          title: ar.node?.title || ar.operationType,
          projectId: ar.projectId || '',
          projectName: ar.project?.name || 'Project',
          submittedAt: ar.createdAt,
          submitterName: ar.submitter?.fullName || 'Requester',
          submitterEmail: ar.submitter?.email || '',
          priority: 'HIGH',
          daysPending,
          reason: reqReason,
          documents: docs,
        };
      }),
    ];

    if (response.managerWorkload) {
      const existingIds = new Set(response.managerWorkload.pendingReviews.map((r: any) => r.id));
      for (const dr of directPendingReviews) {
        if (!existingIds.has(dr.id)) {
          response.managerWorkload.pendingReviews.push(dr);
          existingIds.add(dr.id);
        }
      }
      response.managerWorkload.pendingReviewCount = response.managerWorkload.pendingReviews.length;
    }

    const myTasks = safeAssigned.map((n) => ({
      id: n.id,
      title: n.title,
      projectId: n.projectId,
      projectName: n.project?.name || 'Project',
      progressPct: n.progressPct,
      statusCategory: n.status?.category || 'active',
      statusKey: n.status?.key || n.state || 'In Progress',
      statusColour: n.status?.colour,
      priority: n.priority,
      dueDate: n.dueDate,
      state: n.state || 'Draft',
      assignedById: n.assignedById,
      assignedByName: (n as any).assignedBy?.fullName || null,
      assignedByEmail: (n as any).assignedBy?.email || null,
      isOverdue: Boolean(n.dueDate && new Date(n.dueDate) < now && n.status?.category !== 'done'),
      approvalStatus: n.approvalStatus || 'not_required',
    }));

    const pendingReviewItems = safeReview.filter((r) => r.approvalStatus === 'pending');
    const changesRequestedItems = safeReview.filter(
      (r) => r.approvalStatus === 'rejected' || r.approvalStatus === 'changes_requested'
    );
    const approvedItems = safeReview.filter((r) => r.approvalStatus === 'approved');

    response.assigneeWork = {
      assignedCount: myTasks.filter((t) => t.statusCategory !== 'done').length,
      overdueCount: myTasks.filter((t) => t.isOverdue).length,
      myTasks,
      reviewStatus: {
        pendingCount: pendingReviewItems.length,
        changesRequestedCount: changesRequestedItems.length,
        approvedCount: approvedItems.length,
        items: safeReview.map((item) => ({
          id: item.id,
          title: item.title,
          projectId: item.projectId,
          projectName: item.project?.name || 'Project',
          approvalStatus: item.approvalStatus || 'not_required',
          submittedAt: item.submittedAt,
          approvedAt: item.approvedAt,
          approvalFeedback: item.approvalFeedback,
          reviewerName: item.reviewer?.fullName || (item.reviewerId ? 'Reviewer' : null),
        })),
      },
    };

    return response;
  }
}
