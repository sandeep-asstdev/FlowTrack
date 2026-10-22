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
          create: dto.fields.map((f, idx) => ({
            fieldKey: f.fieldKey,
            label: f.label,
            type: f.type,
            required: f.required,
            options: f.options || {},
            displayOrder: f.displayOrder || idx,
          })),
        },
      },
      include: {
        fields: true,
      },
    });
  }

  async addField(nodeTypeId: string, dto: FieldDefinitionDto) {
    return this.prisma.fieldDefinition.create({
      data: {
        nodeTypeId,
        fieldKey: dto.fieldKey,
        label: dto.label,
        type: dto.type,
        required: dto.required,
        options: dto.options || {},
        displayOrder: dto.displayOrder,
      },
    });
  }
}
