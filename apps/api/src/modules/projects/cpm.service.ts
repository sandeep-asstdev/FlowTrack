import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateCriticalPath, CpmResult } from '@flowtrack/shared';

@Injectable()
export class CpmService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authoritative calculation of Critical Path Method (CPM) for a project.
   * Enforces workspace isolation to prevent unauthorized cross-tenant analysis access.
   */
  async calculateProjectCriticalPath(projectId: string, workspaceId: string): Promise<CpmResult> {
    // 1. Verify project exists in the given workspace (multi-tenant isolation)
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found or cross-workspace access denied');
    }

    // 2. Fetch all non-deleted nodes for this project
    const nodes = await this.prisma.node.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      include: {
        status: { select: { key: true, category: true, labelI18n: true } },
        owner: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 3. Fetch all non-deleted edges for this project
    const edges = await this.prisma.edge.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      select: {
        id: true,
        sourceNodeId: true,
        targetNodeId: true,
        kind: true,
      },
    });

    if (nodes.length === 0) {
      const defaultDate = (project.startDate ? new Date(project.startDate) : new Date()).toISOString().slice(0, 10);
      return {
        projectStartDate: defaultDate,
        totalDurationDays: 0,
        projectedFinishDate: defaultDate,
        criticalPathIds: [],
        criticalPathTitles: [],
        tasks: [],
        edges: [],
        criticalTaskCount: 0,
        slackTaskCount: 0,
        deadlineSlackDays: undefined,
      };
    }

    // Determine project start date anchor:
    // If project.startDate exists, use it. Otherwise use min node.startDate or today.
    let projectStartDateIso: string;
    if (project.startDate) {
      projectStartDateIso = new Date(project.startDate).toISOString().slice(0, 10);
    } else {
      const datesWithStart = nodes
        .filter((n) => n.startDate)
        .map((n) => new Date(n.startDate!).getTime());
      if (datesWithStart.length > 0) {
        projectStartDateIso = new Date(Math.min(...datesWithStart)).toISOString().slice(0, 10);
      } else {
        projectStartDateIso = new Date().toISOString().slice(0, 10);
      }
    }

    const projectDeadlineIso = project.targetDate ? new Date(project.targetDate).toISOString().slice(0, 10) : undefined;

    // Transform nodes into CpmTask inputs
    const cpmTasks = nodes.map((n) => {
      let durationDays = 1;
      const customData = (n.customData as Record<string, any>) || {};

      if (typeof customData.durationDays === 'number' && customData.durationDays > 0) {
        durationDays = Math.round(customData.durationDays);
      } else if (n.startDate && n.dueDate) {
        const msDiff = new Date(n.dueDate).getTime() - new Date(n.startDate).getTime();
        const days = Math.round(msDiff / (1000 * 60 * 60 * 24)) + 1; // inclusive convention
        durationDays = Math.max(1, days);
      }

      return {
        id: n.id,
        title: n.title,
        durationDays,
        fixedStartDate: customData.fixedStartDate || undefined,
        startDate: n.startDate ? new Date(n.startDate).toISOString().slice(0, 10) : undefined,
        dueDate: n.dueDate ? new Date(n.dueDate).toISOString().slice(0, 10) : undefined,
        statusCategory: n.status?.category,
      };
    });

    const cpmEdges = edges.map((e) => ({
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      kind: e.kind,
    }));

    const result = calculateCriticalPath({
      tasks: cpmTasks,
      edges: cpmEdges,
      projectStartDate: projectStartDateIso,
      projectDeadline: projectDeadlineIso,
    });

    if ('code' in result) {
      throw new BadRequestException({
        code: result.code,
        message: result.message,
        details: result.details,
      });
    }

    return result;
  }
}
