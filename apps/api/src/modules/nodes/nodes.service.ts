import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNodeDto, UpdateNodeDto, BatchUpdateNodePositionsDto, calculateGroupRollup } from '@flowtrack/shared';
import { Priority } from '@prisma/client';

@Injectable()
export class NodesService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjectNodes(projectId: string, parentNodeId?: string | null) {
    const where: any = {
      projectId,
      deletedAt: null,
    };

    // If a specific sub-canvas drill-down ID is passed, filter by it. Otherwise on root canvas, show all interconnected parent and child nodes!
    if (parentNodeId && parentNodeId !== 'root' && parentNodeId !== 'all' && parentNodeId !== 'null') {
      where.parentNodeId = parentNodeId;
    }

    const nodes = await this.prisma.node.findMany({
      where,
      include: {
        nodeType: true,
        status: true,
        parentNode: { select: { id: true, title: true } },
        owner: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        _count: {
          select: {
            children: { where: { deletedAt: null } },
            documents: { where: { deletedAt: null } },
            remarks: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return nodes;
  }

  async getNode(id: string) {
    const node = await this.prisma.node.findUnique({
      where: { id },
      include: {
        nodeType: {
          include: {
            fields: { orderBy: { displayOrder: 'asc' } },
          },
        },
        status: true,
        owner: {
          select: { id: true, fullName: true, avatarUrl: true, email: true },
        },
        children: {
          where: { deletedAt: null },
          include: { status: true },
        },
        documents: {
          where: { deletedAt: null },
          include: { uploader: { select: { fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
        remarks: {
          where: { deletedAt: null },
          include: { author: { select: { fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    // Safely serialize BigInt fileSize on documents
    const serializedDocuments = (node.documents || []).map((d) => ({
      ...d,
      fileSize: Number(d.fileSize),
    }));

    // If node is a group, compute live rollup summary from children
    let rollup = null;
    if (node.nodeType.isGroup && node.children.length > 0) {
      rollup = calculateGroupRollup(
        node.children.map((c) => ({
          id: c.id,
          progressPct: c.progressPct,
          weight: c.weight,
          statusCategory: c.status?.category || 'active',
          dueDate: c.dueDate,
        }))
      );
    }

    return {
      ...node,
      documents: serializedDocuments,
      ...(rollup && { rollup }),
    };
  }

  async createNode(workspaceId: string, dto: CreateNodeDto) {
    let statusId = dto.statusId;
    if (!statusId) {
      const nodeType = await this.prisma.nodeType.findUnique({
        where: { id: dto.nodeTypeId },
        include: { statusSet: { include: { statuses: { orderBy: { displayOrder: 'asc' } } } } },
      });
      statusId = nodeType?.statusSet?.statuses[0]?.id;
    }

    const created = await this.prisma.node.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        parentNodeId: dto.parentNodeId || null,
        nodeTypeId: dto.nodeTypeId,
        statusId,
        title: dto.title,
        description: dto.description,
        positionX: dto.positionX,
        positionY: dto.positionY,
        width: dto.width || 280,
        height: dto.height || 160,
        ownerId: dto.ownerId,
        priority: (dto.priority as Priority) || 'MEDIUM',
        weight: dto.weight || 1.0,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        progressPct: dto.progressPct,
        customData: dto.customData || {},
        collapsed: dto.collapsed || false,
      },
      include: {
        nodeType: true,
        status: true,
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        entityName: 'Node',
        entityId: created.id,
        actorId: created.ownerId || 'system',
        action: 'CREATE',
        newValues: { title: created.title, status: (created.status?.labelI18n as any)?.en || created.status?.key },
      },
    }).catch(() => null);

    return created;
  }

  async updateNode(id: string, dto: UpdateNodeDto, actorId?: string) {
    const existing = await this.prisma.node.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    if (dto.version !== undefined && existing.version !== dto.version) {
      throw new ConflictException('Node was modified by another collaborator. Please refresh and retry.');
    }

    const updated = await this.prisma.node.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.statusId !== undefined && { statusId: dto.statusId }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
        ...(dto.priority !== undefined && { priority: dto.priority as Priority }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.positionX !== undefined && { positionX: dto.positionX }),
        ...(dto.positionY !== undefined && { positionY: dto.positionY }),
        ...(dto.width !== undefined && { width: dto.width }),
        ...(dto.height !== undefined && { height: dto.height }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.progressPct !== undefined && { progressPct: dto.progressPct }),
        ...(dto.customData !== undefined && { customData: dto.customData }),
        ...(dto.collapsed !== undefined && { collapsed: dto.collapsed }),
        version: { increment: 1 },
      },
      include: {
        nodeType: true,
        status: true,
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Create audit log for changes
    if (actorId && (dto.title || dto.statusId || dto.progressPct !== undefined)) {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          entityName: 'Node',
          entityId: existing.id,
          actorId,
          action: dto.statusId && dto.statusId !== existing.statusId ? 'STATUS_CHANGE' : 'UPDATE',
          oldValues: {
            title: existing.title,
            statusId: existing.statusId,
            progressPct: existing.progressPct,
          },
          newValues: {
            title: updated.title,
            statusId: updated.statusId,
            progressPct: updated.progressPct,
          },
        },
      }).catch(() => null);
    }

    // Special audit & remark for Deadline Change / Extension
    const isDueDateChanged =
      dto.dueDate !== undefined &&
      (existing.dueDate ? new Date(existing.dueDate).toISOString() : null) !==
        (dto.dueDate ? new Date(dto.dueDate).toISOString() : null);

    if (isDueDateChanged) {
      const reason =
        (dto as any).deadlineReason ||
        (dto.customData as any)?.deadlineReason ||
        'Timeline schedule adjusted';

      await this.prisma.auditLog.create({
        data: {
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          entityName: 'Node',
          entityId: existing.id,
          actorId: actorId || existing.ownerId || 'system',
          action: 'DEADLINE_CHANGE',
          oldValues: {
            dueDate: existing.dueDate,
          },
          newValues: {
            dueDate: updated.dueDate,
            reason,
          },
        },
      }).catch(() => null);

      if (actorId) {
        await this.prisma.remark.create({
          data: {
            workspaceId: existing.workspaceId,
            nodeId: existing.id,
            authorId: actorId,
            body: `⚠️ Deadline adjusted from ${
              existing.dueDate ? new Date(existing.dueDate).toLocaleString() : 'None'
            } to ${
              updated.dueDate ? new Date(updated.dueDate).toLocaleString() : 'None'
            }.\nReason: ${reason}`,
          },
        }).catch(() => null);
      }
    }

    // Special audit & remark for Manager Approval
    if ((dto as any).isManagerApproval && actorId) {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          entityName: 'Node',
          entityId: existing.id,
          actorId,
          action: 'MANAGER_APPROVAL',
          oldValues: { statusId: existing.statusId, progressPct: existing.progressPct },
          newValues: {
            statusId: updated.statusId,
            progressPct: updated.progressPct,
            note: (dto as any).approvalNote || 'Verified and signed off',
          },
        },
      }).catch(() => null);

      await this.prisma.remark.create({
        data: {
          workspaceId: existing.workspaceId,
          nodeId: existing.id,
          authorId: actorId,
          body: `🛡️ Manager Approval Sign-Off: Task verified and completed.\nNote: ${
            (dto as any).approvalNote || 'All deliverables inspected and approved.'
          }`,
        },
      }).catch(() => null);
    }

    return updated;
  }

  async batchUpdatePositions(dto: BatchUpdateNodePositionsDto) {
    const updates = dto.positions.map((p) =>
      this.prisma.node.update({
        where: { id: p.id },
        data: {
          positionX: p.positionX,
          positionY: p.positionY,
          version: { increment: 1 },
        },
      })
    );

    return this.prisma.$transaction(updates);
  }

  async addRemark(nodeId: string, authorId: string, body: string, voiceUrl?: string, photoUrl?: string) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    return this.prisma.remark.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId,
        authorId,
        body,
        voiceUrl,
        photoUrl,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }

  async addDocument(
    nodeId: string,
    userId: string,
    data: { name: string; mimeType: string; fileSize: number; storageKey?: string }
  ) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    const doc = await this.prisma.document.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId,
        uploadedBy: userId,
        name: data.name,
        mimeType: data.mimeType || 'application/octet-stream',
        fileSize: BigInt(data.fileSize || 0),
        storageKey: data.storageKey || `local://${Date.now()}-${data.name}`,
        version: 1,
      },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    return {
      ...doc,
      fileSize: Number(doc.fileSize),
    };
  }

  async getNodeDocuments(nodeId: string) {
    const docs = await this.prisma.document.findMany({
      where: { nodeId, deletedAt: null },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((d) => ({
      ...d,
      fileSize: Number(d.fileSize),
    }));
  }

  async deleteDocument(docId: string) {
    return this.prisma.document.update({
      where: { id: docId },
      data: { deletedAt: new Date() },
    });
  }

  async getNodeHistory(nodeId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityId: nodeId },
      include: {
        actor: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async deleteNode(id: string) {
    const existing = await this.prisma.node.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    return this.prisma.node.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
