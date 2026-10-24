import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEdgeDto, UpdateEdgeDto, validateDependencyEdge } from '@flowtrack/shared';
import { EdgeKind } from '@prisma/client';

@Injectable()
export class EdgesService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjectEdges(projectId: string) {
    return this.prisma.edge.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createEdge(workspaceId: string, dto: CreateEdgeDto) {
    if (dto.sourceNodeId === dto.targetNodeId) {
      throw new BadRequestException('A node cannot connect to itself');
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

  async deleteEdge(id: string) {
    const existing = await this.prisma.edge.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Edge not found');
    }

    return this.prisma.edge.delete({
      where: { id },
    });
  }
}
