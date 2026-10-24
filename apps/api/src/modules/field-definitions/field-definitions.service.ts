import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFieldDefinitionDto,
  UpdateFieldDefinitionDto,
} from '@flowtrack/shared';

@Injectable()
export class FieldDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    workspaceId: string,
    filters?: {
      targetType?: string;
      nodeTypeId?: string;
      includeInactive?: boolean;
      groupName?: string;
    }
  ) {
    const where: any = { workspaceId };

    if (!filters?.includeInactive) {
      where.isActive = true;
    }

    if (filters?.targetType) {
      where.targetType = filters.targetType;
    }

    if (filters?.nodeTypeId !== undefined) {
      where.nodeTypeId = filters.nodeTypeId;
    }

    if (filters?.groupName) {
      where.groupName = filters.groupName;
    }

    return this.prisma.fieldDefinition.findMany({
      where,
      orderBy: [{ groupName: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        nodeType: {
          select: { id: true, name: true, key: true, isGroup: true },
        },
      },
    });
  }

  async getById(id: string) {
    const field = await this.prisma.fieldDefinition.findUnique({
      where: { id },
      include: {
        nodeType: true,
      },
    });

    if (!field) {
      throw new NotFoundException(`Field definition with ID "${id}" was not found`);
    }

    return field;
  }

  async create(workspaceId: string, dto: CreateFieldDefinitionDto, actorId?: string) {
    // 1. Validate fieldKey formatting (alphanumeric + underscore only)
    const normalizedKey = dto.fieldKey.toLowerCase().trim();
    if (!/^[a-z0-9_]+$/.test(normalizedKey)) {
      throw new BadRequestException('Field key must contain only lowercase letters, numbers, and underscores');
    }

    // 2. Check for duplicate key within the same workspace and nodeType / targetType
    const existing = await this.prisma.fieldDefinition.findFirst({
      where: {
        workspaceId,
        fieldKey: normalizedKey,
        nodeTypeId: dto.nodeTypeId || null,
        targetType: dto.targetType || 'node',
      },
    });

    if (existing) {
      throw new ConflictException(
        `A field with key "${normalizedKey}" already exists for this ${dto.targetType || 'node type'}`
      );
    }

    // 3. Resolve displayOrder if not provided
    let displayOrder = dto.displayOrder;
    if (displayOrder === undefined || displayOrder === null) {
      const maxOrder = await this.prisma.fieldDefinition.aggregate({
        where: {
          workspaceId,
          nodeTypeId: dto.nodeTypeId || null,
          targetType: dto.targetType || 'node',
        },
        _max: { displayOrder: true },
      });
      displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;
    }

    // 4. Create field definition
    const created = await this.prisma.fieldDefinition.create({
      data: {
        workspaceId,
        nodeTypeId: dto.nodeTypeId || null,
        targetType: dto.targetType || 'node',
        fieldKey: normalizedKey,
        label: dto.label.trim(),
        labelI18n: (dto.labelI18n || {}) as any,
        description: dto.description || null,
        type: dto.type,
        required: dto.required ?? false,
        defaultValue: (dto.defaultValue ?? null) as any,
        options: (dto.options || {}) as any,
        validation: (dto.validation || {}) as any,
        visibilityRules: (dto.visibilityRules || []) as any,
        groupName: dto.groupName || 'General',
        displayOrder,
        editableRoles: (dto.editableRoles || []) as any,
        isActive: dto.isActive ?? true,
        version: 1,
      },
      include: {
        nodeType: true,
      },
    });

    // 5. Audit log
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          entityName: 'FieldDefinition',
          entityId: created.id,
          actorId,
          action: 'CREATE',
          newValues: {
            fieldKey: created.fieldKey,
            label: created.label,
            type: created.type,
            targetType: created.targetType,
          },
        },
      }).catch(() => null);
    }

    return created;
  }

  async update(id: string, dto: UpdateFieldDefinitionDto, actorId?: string) {
    const existing = await this.getById(id);

    // 1. Version increment
    const newVersion = existing.version + 1;

    // 2. Perform update
    const updated = await this.prisma.fieldDefinition.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label.trim() }),
        ...(dto.labelI18n !== undefined && { labelI18n: dto.labelI18n as any }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.required !== undefined && { required: dto.required }),
        ...(dto.defaultValue !== undefined && { defaultValue: dto.defaultValue as any }),
        ...(dto.options !== undefined && { options: dto.options as any }),
        ...(dto.validation !== undefined && { validation: dto.validation as any }),
        ...(dto.visibilityRules !== undefined && { visibilityRules: dto.visibilityRules as any }),
        ...(dto.groupName !== undefined && { groupName: dto.groupName }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.editableRoles !== undefined && { editableRoles: dto.editableRoles as any }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.targetType !== undefined && { targetType: dto.targetType }),
        ...(dto.nodeTypeId !== undefined && { nodeTypeId: dto.nodeTypeId }),
        version: newVersion,
      },
      include: {
        nodeType: true,
      },
    });

    // 3. Audit log
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: existing.workspaceId,
          entityName: 'FieldDefinition',
          entityId: id,
          actorId,
          action: 'UPDATE',
          oldValues: {
            label: existing.label,
            required: existing.required,
            version: existing.version,
            isActive: existing.isActive,
          },
          newValues: {
            label: updated.label,
            required: updated.required,
            version: updated.version,
            isActive: updated.isActive,
          },
        },
      }).catch(() => null);
    }

    return updated;
  }

  async delete(id: string, permanent: boolean = false, actorId?: string) {
    const existing = await this.getById(id);

    if (permanent) {
      const deleted = await this.prisma.fieldDefinition.delete({ where: { id } });
      if (actorId) {
        await this.prisma.auditLog.create({
          data: {
            workspaceId: existing.workspaceId,
            entityName: 'FieldDefinition',
            entityId: id,
            actorId,
            action: 'DELETE',
            oldValues: { fieldKey: existing.fieldKey, label: existing.label },
          },
        }).catch(() => null);
      }
      return deleted;
    }

    // Soft-retire to preserve data integrity and prevent record corruption
    const retired = await this.prisma.fieldDefinition.update({
      where: { id },
      data: {
        isActive: false,
        version: { increment: 1 },
      },
    });

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: existing.workspaceId,
          entityName: 'FieldDefinition',
          entityId: id,
          actorId,
          action: 'UPDATE',
          newValues: { retired: true, fieldKey: existing.fieldKey },
        },
      }).catch(() => null);
    }

    return retired;
  }

  /**
   * Retrieves all applicable active field definitions for a node.
   * Includes fields specific to its nodeType, plus generic fields for stages/tasks.
   */
  async getFieldDefinitionsForNode(workspaceId: string, nodeTypeId: string, isGroup: boolean) {
    const targetTypeFilter = isGroup ? 'stage' : 'task';

    return this.prisma.fieldDefinition.findMany({
      where: {
        workspaceId,
        isActive: true,
        OR: [
          { nodeTypeId },
          { nodeTypeId: null, targetType: targetTypeFilter },
          { nodeTypeId: null, targetType: 'node' },
        ],
      },
      orderBy: [{ groupName: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Retrieves all applicable active field definitions for a project.
   */
  async getFieldDefinitionsForProject(workspaceId: string) {
    return this.prisma.fieldDefinition.findMany({
      where: {
        workspaceId,
        isActive: true,
        targetType: 'project',
      },
      orderBy: [{ groupName: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
