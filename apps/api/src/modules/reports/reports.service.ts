import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calculateUniversalDashboardMetrics,
  generateProjectCsv,
  ReportFilterOptions,
  UniversalDashboardMetrics,
} from '@flowtrack/shared';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.getMembership(workspaceId, userId);

    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId,
        deletedAt: null,
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
}
