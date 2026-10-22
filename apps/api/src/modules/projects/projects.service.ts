import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from '@flowtrack/shared';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkspaceProjects(workspaceId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            nodes: { where: { deletedAt: null } },
            edges: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Calculate aggregated metrics for each project
    const results = await Promise.all(
      projects.map(async (project) => {
        const nodes = await this.prisma.node.findMany({
          where: { projectId: project.id, deletedAt: null },
          select: {
            id: true,
            progressPct: true,
            dueDate: true,
            status: { select: { category: true } },
          },
        });

        const totalNodes = nodes.length;
        const completedNodes = nodes.filter((n) => n.status?.category === 'done').length;
        const waitingNodes = nodes.filter((n) => n.status?.category === 'blocked').length;
        const now = new Date();
        const overdueNodes = nodes.filter(
          (n) => n.dueDate && new Date(n.dueDate) < now && n.status?.category !== 'done' && n.status?.category !== 'cancelled'
        ).length;

        const avgProgress =
          totalNodes > 0
            ? Math.round(nodes.reduce((acc, n) => acc + (n.progressPct || 0), 0) / totalNodes)
            : 0;

        return {
          ...project,
          metrics: {
            totalNodes,
            completedNodes,
            waitingNodes,
            overdueNodes,
            avgProgress,
          },
        };
      })
    );

    return results;
  }

  async getProject(projectId: string, workspaceId: string) {
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

    return project;
  }

  async createProject(workspaceId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        templateId: dto.templateId,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        settings: dto.settings || {},
      },
    });
  }

  async updateProject(projectId: string, workspaceId: string, dto: UpdateProjectDto) {
    const existing = await this.getProject(projectId, workspaceId);

    // Optimistic locking check if version was sent
    if (dto.version !== undefined && existing.version !== dto.version) {
      throw new ConflictException('Project was modified by another user. Please refresh and retry.');
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.targetDate !== undefined && { targetDate: dto.targetDate ? new Date(dto.targetDate) : null }),
        ...(dto.settings && { settings: dto.settings }),
        version: { increment: 1 },
      },
    });
  }

  async deleteProject(projectId: string, workspaceId: string) {
    await this.getProject(projectId, workspaceId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
  }
}
