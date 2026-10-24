import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNodeTypeDto, FieldDefinitionDto } from '@flowtrack/shared';

@Injectable()
export class NodeTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkspaceNodeTypes(workspaceId: string) {
    return this.prisma.nodeType.findMany({
      where: { workspaceId },
      include: {
        fields: { orderBy: { displayOrder: 'asc' } },
        statusSet: {
          include: {
            statuses: { orderBy: { displayOrder: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createNodeType(workspaceId: string, dto: CreateNodeTypeDto) {
    return this.prisma.nodeType.create({
      data: {
        workspaceId,
        key: dto.key,
        name: dto.name,
        icon: dto.icon,
        colour: dto.colour,
        defaultStatusSetId: dto.defaultStatusSetId,
        isGroup: dto.isGroup,
        fields: {
          create: (dto.fields || []).map((f, idx) => ({
            workspace: { connect: { id: workspaceId } },
            targetType: dto.isGroup ? 'stage' : 'task',
            fieldKey: f.fieldKey,
            label: f.label,
            labelI18n: (f.labelI18n || {}) as any,
            description: f.description || null,
            type: f.type,
            required: f.required ?? false,
            defaultValue: (f.defaultValue ?? null) as any,
            options: (f.options || {}) as any,
            validation: (f.validation || {}) as any,
            visibilityRules: (f.visibilityRules || []) as any,
            groupName: f.groupName || 'General',
            displayOrder: f.displayOrder ?? idx,
            editableRoles: (f.editableRoles || []) as any,
            isActive: f.isActive ?? true,
          })),
        },
      },
      include: {
        fields: true,
      },
    });
  }

  async addField(nodeTypeId: string, dto: FieldDefinitionDto) {
    const nodeType = await this.prisma.nodeType.findUnique({ where: { id: nodeTypeId } });
    if (!nodeType) {
      throw new NotFoundException(`NodeType "${nodeTypeId}" not found`);
    }

    return this.prisma.fieldDefinition.create({
      data: {
        workspaceId: nodeType.workspaceId,
        nodeTypeId,
        targetType: nodeType.isGroup ? 'stage' : 'task',
        fieldKey: dto.fieldKey,
        label: dto.label,
        labelI18n: (dto.labelI18n || {}) as any,
        description: dto.description || null,
        type: dto.type,
        required: dto.required ?? false,
        defaultValue: (dto.defaultValue ?? null) as any,
        options: (dto.options || {}) as any,
        validation: (dto.validation || {}) as any,
        visibilityRules: (dto.visibilityRules || []) as any,
        groupName: dto.groupName || 'General',
        displayOrder: dto.displayOrder ?? 0,
        editableRoles: (dto.editableRoles || []) as any,
        isActive: dto.isActive ?? true,
      },
    });
  }
}
