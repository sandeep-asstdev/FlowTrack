import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEdgeDto, UpdateEdgeDto, validateDependencyEdge } from '@flowtrack/shared';
import { EdgeKind } from '@prisma/client';
import { canUserEditTask } from '../nodes/task-permissions';
import { AuthorizationService } from '../auth/authorization.service';

@Injectable()
export class EdgesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly authService?: AuthorizationService
  ) {}

  async listProjectEdges(projectId: string, actorId?: string, userRole?: string) {
    if (this.authService && actorId) {
      const proj = await this.prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { id: true, workspaceId: true },
      });
      if (!proj) {
        throw new NotFoundException('Project not found');
      }
      const visible = await this.authService.isProjectVisibleToUser(
        { id: actorId, role: userRole, workspaceId: proj.workspaceId },
        projectId
      );
      if (!visible) {
        throw new NotFoundException('Project not found');
      }
    }
    return this.prisma.edge.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createEdge(workspaceId: string, dto: CreateEdgeDto, actorId?: string, userRole?: string) {
    if (dto.sourceNodeId === dto.targetNodeId) {
      throw new BadRequestException('A node cannot connect to itself');
    }

    const sourceNode = await this.prisma.node.findUnique({
      where: { id: dto.sourceNodeId },
      include: { project: true },
    });
    const targetNode = await this.prisma.node.findUnique({
      where: { id: dto.targetNodeId },
      include: { project: true },
    });

    if (!sourceNode || sourceNode.deletedAt || !targetNode || targetNode.deletedAt) {
      throw new NotFoundException('Source or target task not found');
    }

    if (sourceNode.projectId !== targetNode.projectId || (dto.projectId && sourceNode.projectId !== dto.projectId)) {
      throw new BadRequestException('Tasks must belong to the same project');
    }

    if (sourceNode.project?.status === 'COMPLETED' || targetNode.project?.status === 'COMPLETED') {
      throw new ForbiddenException('Project is completed and read-only.');
    }

    if (actorId) {
      const canEditSource = await canUserEditTask(this.prisma, sourceNode, sourceNode.project, actorId, userRole);
      const canEditTarget = await canUserEditTask(this.prisma, targetNode, targetNode.project, actorId, userRole);

      if (!canEditSource || !canEditTarget) {
        throw new ForbiddenException(
          'Forbidden: You can only create dependencies on tasks within your authorized scope.'
        );
      }
    }

    // Query existing project edges to prevent cycles
    const existingEdges = await this.prisma.edge.findMany({
      where: {
        projectId: dto.projectId,
        deletedAt: null,
      },
      select: { sourceNodeId: true, targetNodeId: true, kind: true },
    });

    // Check for existing duplicate edge
    const isDuplicate = existingEdges.some(
      (e) => e.sourceNodeId === dto.sourceNodeId && e.targetNodeId === dto.targetNodeId
    );
    if (isDuplicate) {
      return this.prisma.edge.findFirst({
        where: {
          projectId: dto.projectId,
          sourceNodeId: dto.sourceNodeId,
          targetNodeId: dto.targetNodeId,
          deletedAt: null,
        },
      });
    }

    // Validate dependency and prevent invalid circular cycles
    const cycleCheck = validateDependencyEdge(existingEdges, {
      sourceNodeId: dto.sourceNodeId,
      targetNodeId: dto.targetNodeId,
      kind: dto.kind,
    });

    if (!cycleCheck.isValid) {
      throw new BadRequestException(cycleCheck.error);
    }

    return this.prisma.edge.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        sourceNodeId: dto.sourceNodeId,
        targetNodeId: dto.targetNodeId,
        kind: (dto.kind as EdgeKind) || EdgeKind.sequence,
        label: dto.label,
        metadata: dto.metadata || {},
      },
    });
  }

  async updateEdge(id: string, dto: UpdateEdgeDto) {
    const existing = await this.prisma.edge.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Edge not found');
    }

    return this.prisma.edge.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.kind !== undefined && { kind: dto.kind as EdgeKind }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata }),
      },
    });
  }

  async deleteEdge(id: string, actorId?: string, userRole?: string) {
    const existing = await this.prisma.edge.findUnique({
      where: { id },
      include: {
        sourceNode: { include: { project: true } },
        targetNode: { include: { project: true } },
      },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Edge not found');
    }

    if (!existing.sourceNode || !existing.targetNode) {
      throw new NotFoundException('Source or target task not found');
    }

    if (existing.sourceNode.projectId !== existing.targetNode.projectId) {
      throw new BadRequestException('Tasks must belong to the same project');
    }

    if (existing.sourceNode?.project?.status === 'COMPLETED' || existing.targetNode?.project?.status === 'COMPLETED') {
      throw new ForbiddenException('Project is completed and read-only.');
    }

    if (actorId) {
      const canEditSource = await canUserEditTask(this.prisma, existing.sourceNode, existing.sourceNode.project, actorId, userRole);
      const canEditTarget = await canUserEditTask(this.prisma, existing.targetNode, existing.targetNode.project, actorId, userRole);

      if (!canEditSource || !canEditTarget) {
        throw new ForbiddenException(
          'Forbidden: You can only delete dependencies on tasks within your authorized scope.'
        );
      }
    }

    return this.prisma.edge.delete({
      where: { id },
    });
  }
}
