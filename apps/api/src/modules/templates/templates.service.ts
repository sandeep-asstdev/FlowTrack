import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateTemplateDto,
  InstantiateTemplateDto,
  UpdateTemplateDto,
  projectSettingsSchema,
} from '@flowtrack/shared';
import { BUILTIN_INDUSTRY_TEMPLATES } from './templates.seed-data';

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedBuiltinTemplates();
  }

  async seedBuiltinTemplates() {
    for (const tmpl of BUILTIN_INDUSTRY_TEMPLATES) {
      const existing = await this.prisma.template.findFirst({
        where: { name: tmpl.name, workspaceId: null },
      });

      if (!existing) {
        await this.prisma.template.create({
          data: {
            name: tmpl.name,
            category: tmpl.category,
            industry: tmpl.industry,
            methodology: tmpl.methodology,
            icon: tmpl.icon,
            tags: tmpl.tags,
            description: tmpl.description,
            defaultSettings: tmpl.defaultSettings,
            graphJson: tmpl.graphJson,
            isPublic: true,
          },
        });
      }
    }
  }

  async listTemplates(workspaceId?: string, industry?: string, category?: string) {
    const whereClause: any = {
      OR: [
        { isPublic: true },
        ...(workspaceId ? [{ workspaceId }] : []),
      ],
    };

    if (industry && industry !== 'all') {
      whereClause.industry = industry;
    }

    if (category && category !== 'all') {
      whereClause.category = category;
    }

    return this.prisma.template.findMany({
      where: whereClause,
      orderBy: [{ isPublic: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.template.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" was not found`);
    }
    return template;
  }

  async createTemplate(dto: CreateTemplateDto, workspaceId?: string) {
    return this.prisma.template.create({
      data: {
        workspaceId: workspaceId || null,
        name: dto.name,
        category: dto.category || 'General',
        industry: dto.industry || 'general',
        methodology: dto.methodology || 'stage_gate',
        icon: dto.icon || 'Layers',
        tags: dto.tags || [],
        description: dto.description || '',
        defaultSettings: (dto.defaultSettings || {}) as any,
        nodeTypes: (dto.nodeTypes || []) as any,
        statusSets: (dto.statusSets || []) as any,
        graphJson: dto.graphJson as any,
        isPublic: workspaceId ? (dto.isPublic ?? false) : true,
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, workspaceId?: string) {
    const template = await this.getTemplate(id);
    if (workspaceId && template.workspaceId && template.workspaceId !== workspaceId) {
      throw new BadRequestException('Cannot edit a template belonging to another workspace');
    }

    return this.prisma.template.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.category && { category: dto.category }),
        ...(dto.industry && { industry: dto.industry }),
        ...(dto.methodology && { methodology: dto.methodology }),
        ...(dto.icon && { icon: dto.icon }),
        ...(dto.tags && { tags: dto.tags as any }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.defaultSettings && { defaultSettings: dto.defaultSettings as any }),
        ...(dto.graphJson && { graphJson: dto.graphJson as any }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        version: { increment: 1 },
      },
    });
  }

  async deleteTemplate(id: string, workspaceId?: string) {
    const template = await this.getTemplate(id);
    if (workspaceId && template.workspaceId && template.workspaceId !== workspaceId) {
      throw new BadRequestException('Cannot delete a template belonging to another workspace');
    }
    return this.prisma.template.delete({ where: { id } });
  }

  async instantiateTemplate(
    templateId: string,
    workspaceId: string,
    dto: InstantiateTemplateDto,
    actorId?: string
  ) {
    const template = await this.getTemplate(templateId);

    // Merge default settings with custom overrides
    const rawMerged = {
      ...(template.defaultSettings as any || {}),
      ...(dto.customSettings || {}),
      industry: template.industry,
      methodology: template.methodology,
      templateType: template.id,
      templateVersion: template.version,
      templateName: template.name,
    };
    const validatedSettings = projectSettingsSchema.parse(rawMerged);

    // Execute instantiation atomically
    return this.prisma.$transaction(async (tx) => {
      // 1. Create the Project with initial template customData
      const initialProjectCustomData = (template.defaultSettings as any)?.projectCustomData || {};
      const project = await tx.project.create({
        data: {
          workspaceId,
          name: dto.projectName,
          description: dto.projectDescription || template.description,
          templateId: template.id,
          startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
          targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
          settings: validatedSettings as any,
          customData: initialProjectCustomData,
        },
      });

      // 1b. Install template custom field definitions into workspace if not already present
      const templateFieldDefs: any[] = (template.defaultSettings as any)?.customFieldDefinitions || [];
      for (const f of templateFieldDefs) {
        const existingField = await tx.fieldDefinition.findFirst({
          where: {
            workspaceId,
            fieldKey: f.fieldKey,
            targetType: f.targetType || 'node',
          },
        });
        if (!existingField) {
          await tx.fieldDefinition.create({
            data: {
              workspaceId,
              targetType: f.targetType || 'node',
              fieldKey: f.fieldKey,
              label: f.label,
              labelI18n: f.labelI18n || {},
              description: f.description || null,
              type: f.type,
              required: f.required ?? false,
              defaultValue: f.defaultValue ?? null,
              options: f.options || {},
              validation: f.validation || {},
              visibilityRules: f.visibilityRules || [],
              groupName: f.groupName || 'General',
              displayOrder: f.displayOrder ?? 0,
              editableRoles: f.editableRoles || [],
              isActive: true,
              version: 1,
            },
          });
        }
      }

      // 2. Fetch or create NodeTypes in the workspace
      const existingNodeTypes = await tx.nodeType.findMany({
        where: { workspaceId },
      });
      const nodeTypeMap = new Map<string, string>();
      for (const nt of existingNodeTypes) {
        nodeTypeMap.set(nt.key, nt.id);
      }

      // Default fallback node type
      const defaultNodeTypeId = existingNodeTypes[0]?.id;

      // 3. Create Nodes from template graph
      const graph = template.graphJson as any;
      const rawNodes: any[] = graph?.nodes || [];
      const createdNodes: any[] = [];

      for (let i = 0; i < rawNodes.length; i++) {
        const rawNode = rawNodes[i];
        const resolvedNodeTypeId =
          nodeTypeMap.get(rawNode.nodeTypeKey) || defaultNodeTypeId;

        const createdNode = await tx.node.create({
          data: {
            workspaceId,
            projectId: project.id,
            nodeTypeId: resolvedNodeTypeId,
            title: rawNode.title,
            description: rawNode.description || null,
            positionX: rawNode.positionX ?? i * 340 + 80,
            positionY: rawNode.positionY ?? 200,
            priority: rawNode.priority || 'MEDIUM',
            weight: rawNode.weight ?? 1.0,
            progressPct: rawNode.progressPct ?? 0,
            isMilestone: rawNode.isMilestone ?? (rawNode.nodeTypeKey === 'milestone'),
            approvalStatus: rawNode.nodeTypeKey === 'approval' ? 'pending' : 'not_required',
            estimatedCost: rawNode.estimatedCost ?? 0,
            allocatedHours: rawNode.allocatedHours ?? 0,
            customData: rawNode.customData || {},
          },
        });

        createdNodes.push(createdNode);

        // Create subtasks if present
        if (Array.isArray(rawNode.subtasks) && rawNode.subtasks.length > 0) {
          for (const sub of rawNode.subtasks) {
            const subNodeTypeId =
              nodeTypeMap.get(sub.nodeTypeKey) || defaultNodeTypeId;
            await tx.node.create({
              data: {
                workspaceId,
                projectId: project.id,
                parentNodeId: createdNode.id,
                nodeTypeId: subNodeTypeId,
                title: sub.title,
                description: sub.description || null,
                priority: sub.priority || 'MEDIUM',
                weight: sub.weight ?? 1.0,
                progressPct: sub.progressPct ?? 0,
                customData: sub.customData || {},
              },
            });
          }
        }
      }

      // 4. Create Edges from template graph
      const rawEdges: any[] = graph?.edges || [];
      const createdEdges: any[] = [];

      for (const rawEdge of rawEdges) {
        const sourceNode = createdNodes[rawEdge.sourceIndex];
        const targetNode = createdNodes[rawEdge.targetIndex];

        if (sourceNode && targetNode) {
          const edge = await tx.edge.create({
            data: {
              workspaceId,
              projectId: project.id,
              sourceNodeId: sourceNode.id,
              targetNodeId: targetNode.id,
              kind: rawEdge.kind || 'sequence',
              label: rawEdge.label || null,
              metadata: rawEdge.metadata || {},
            },
          });
          createdEdges.push(edge);
        }
      }

      // 5. Audit Log Entry
      if (actorId) {
        await tx.auditLog.create({
          data: {
            workspaceId,
            projectId: project.id,
            entityName: 'Project',
            entityId: project.id,
            actorId,
            action: 'CREATE',
            newValues: {
              name: project.name,
              templateId: template.id,
              templateName: template.name,
              industry: template.industry,
              nodesCreated: createdNodes.length,
              edgesCreated: createdEdges.length,
            },
          },
        });
      }

      return {
        project,
        nodesCount: createdNodes.length,
        edgesCount: createdEdges.length,
      };
    });
  }
}
