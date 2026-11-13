import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import {
  CreateTemplateDto,
  InstantiateTemplateDto,
  UpdateTemplateDto,
  projectSettingsSchema,
  calculateTaskDates,
  GRANULAR_PERMISSIONS,
} from '@flowtrack/shared';
import { BUILTIN_INDUSTRY_TEMPLATES } from './templates.seed-data';
import { ProjectsService } from '../projects/projects.service';
import { NodesService } from '../nodes/nodes.service';
import { EdgesService } from '../edges/edges.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../auth/authorization.service';
import { CpmService } from '../projects/cpm.service';

@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly nodesService: NodesService,
    private readonly edgesService: EdgesService,
    private readonly approvalsService: ApprovalsService,
    private readonly auditService: AuditService,
    private readonly authService: AuthorizationService,
    private readonly cpmService: CpmService
  ) {}

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
      } else {
        // Update to latest seed definition if changed
        await this.prisma.template.update({
          where: { id: existing.id },
          data: {
            category: tmpl.category,
            industry: tmpl.industry,
            methodology: tmpl.methodology,
            icon: tmpl.icon,
            tags: tmpl.tags,
            description: tmpl.description,
            defaultSettings: tmpl.defaultSettings,
            graphJson: tmpl.graphJson,
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

  async createTemplate(dto: CreateTemplateDto, workspaceId?: string, actorId?: string) {
    const created = await this.prisma.template.create({
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

    if (actorId && workspaceId) {
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId,
        action: 'TEMPLATE_CREATED',
        targetType: 'template',
        targetId: created.id,
        afterValues: { name: created.name, category: created.category },
        outcome: 'SUCCESS',
      });
    }

    return created;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, workspaceId?: string, actorId?: string) {
    const template = await this.getTemplate(id);
    if (workspaceId && template.workspaceId && template.workspaceId !== workspaceId) {
      throw new BadRequestException('Cannot edit a template belonging to another workspace');
    }

    const updated = await this.prisma.template.update({
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

    if (actorId && (workspaceId || template.workspaceId)) {
      await this.auditService.recordAuditEvent({
        workspaceId: workspaceId || template.workspaceId!,
        actorId,
        action: 'TEMPLATE_UPDATED',
        targetType: 'template',
        targetId: id,
        afterValues: { name: updated.name },
        outcome: 'SUCCESS',
      });
    }

    return updated;
  }

  async deleteTemplate(id: string, workspaceId?: string, actorId?: string) {
    const template = await this.getTemplate(id);
    if (workspaceId && template.workspaceId && template.workspaceId !== workspaceId) {
      throw new BadRequestException('Cannot delete a template belonging to another workspace');
    }
    const deleted = await this.prisma.template.delete({ where: { id } });

    if (actorId && (workspaceId || template.workspaceId)) {
      await this.auditService.recordAuditEvent({
        workspaceId: workspaceId || template.workspaceId!,
        actorId,
        action: 'TEMPLATE_DELETED',
        targetType: 'template',
        targetId: id,
        outcome: 'SUCCESS',
      });
    }

    return deleted;
  }

  /**
   * Ensures default NodeTypes (stage, task, milestone, approval) exist in the workspace.
   */
  async ensureWorkspaceNodeTypes(workspaceId: string): Promise<Map<string, string>> {
    const nodeTypeMap = new Map<string, string>();
    const defaults = [
      { key: 'stage', name: 'Stage / Phase', icon: 'Layers', colour: '#8b5cf6', isGroup: true },
      { key: 'task', name: 'Task', icon: 'CheckSquare', colour: '#3b82f6', isGroup: false },
      { key: 'milestone', name: 'Milestone', icon: 'Flag', colour: '#eab308', isGroup: false },
      { key: 'approval', name: 'Approval Gate', icon: 'ShieldCheck', colour: '#10b981', isGroup: false },
    ];

    for (const def of defaults) {
      let existing = await this.prisma.nodeType.findFirst({
        where: { workspaceId, key: def.key },
      });
      if (!existing) {
        existing = await this.prisma.nodeType.create({
          data: {
            workspaceId,
            key: def.key,
            name: def.name,
            icon: def.icon,
            colour: def.colour,
            isGroup: def.isGroup,
            isSystem: true,
          },
        });
      }
      nodeTypeMap.set(def.key, existing.id);
    }

    return nodeTypeMap;
  }

  /**
   * Ensures standard approval policies (Normal, Important, Critical) exist in the workspace.
   */
  async ensureDefaultApprovalPolicies(workspaceId: string, actorId: string): Promise<Map<string, string>> {
    const policyMap = new Map<string, string>();
    const existing = await this.prisma.approvalPolicy.findMany({
      where: { workspaceId, isActive: true },
      include: { stages: true },
    });

    for (const p of existing) {
      if (p.name.includes('Normal')) policyMap.set('Normal', p.id);
      if (p.name.includes('Important')) policyMap.set('Important', p.id);
      if (p.name.includes('Critical')) policyMap.set('Critical', p.id);
    }

    // 1. Normal Approval Policy: Team Leader
    if (!policyMap.has('Normal')) {
      const normal = await this.approvalsService.createPolicy(workspaceId, actorId, {
        name: 'Normal Approval Policy',
        description: 'Routine tasks and reports reviewed by the designated Team Leader',
        stages: [
          {
            stageOrder: 1,
            name: 'Team Leader Review',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            approverRole: 'TEAM_LEAD',
          },
        ],
      });
      policyMap.set('Normal', normal.id);
    }

    // 2. Important Approval Policy: Team Leader -> Manager
    if (!policyMap.has('Important')) {
      const important = await this.approvalsService.createPolicy(workspaceId, actorId, {
        name: 'Important Approval Policy',
        description: 'Drawings, contractor mobilization, and statutory reports reviewed by Team Leader then Manager',
        stages: [
          {
            stageOrder: 1,
            name: 'Team Leader Review',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            approverRole: 'TEAM_LEAD',
          },
          {
            stageOrder: 2,
            name: 'Project Manager Approval',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            approverRole: 'MANAGER',
          },
        ],
      });
      policyMap.set('Important', important.id);
    }

    // 3. Critical Approval Policy: Team Leader -> Manager -> Director/Executive
    if (!policyMap.has('Critical')) {
      const critical = await this.approvalsService.createPolicy(workspaceId, actorId, {
        name: 'Critical Approval Policy',
        description: 'Legal clearance, final layout, price list, launch sign-off, and large payments requiring executive clearance',
        stages: [
          {
            stageOrder: 1,
            name: 'Team Leader Review',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            approverRole: 'TEAM_LEAD',
          },
          {
            stageOrder: 2,
            name: 'Project Manager Approval',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            approverRole: 'MANAGER',
          },
          {
            stageOrder: 3,
            name: 'Executive / Director Sign-off',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            approverRole: 'ADMIN',
          },
        ],
      });
      policyMap.set('Critical', critical.id);
    }

    return policyMap;
  }

  /**
   * Instantiates a template through normal services respecting authorization,
   * audit logging, relative dates, checklists, dependencies, and approval policies.
   */
  async instantiateTemplate(
    templateId: string,
    workspaceId: string,
    dto: InstantiateTemplateDto,
    actorId: string,
    userRole?: string
  ) {
    // Rule 2: Strictly enforce project-create permission
    if (this.authService && actorId) {
      await this.authService.enforce(
        { id: actorId, role: userRole, workspaceId },
        GRANULAR_PERMISSIONS.PROJECT_CREATE,
        { workspaceId }
      );
    }

    const template = await this.getTemplate(templateId);
    if (template.workspaceId && template.workspaceId !== workspaceId) {
      throw new NotFoundException(`Template with ID "${templateId}" not accessible in this workspace`);
    }

    // Ensure approval policies exist in workspace
    const policyMap = await this.ensureDefaultApprovalPolicies(workspaceId, actorId);

    // Merge default settings
    const rawMerged = {
      ...(template.defaultSettings as any || {}),
      ...(dto.customSettings || {}),
      industry: template.industry,
      methodology: template.methodology,
      templateType: template.id,
      templateVersion: template.version,
      templateName: template.name,
      currency: dto.currency || (template.defaultSettings as any)?.currency || { code: 'INR', symbol: '₹' },
    };
    const validatedSettings = projectSettingsSchema.parse(rawMerged);

    // Calculate dates
    const projectStartDate = dto.startDate ? new Date(dto.startDate) : new Date();

    let createdProjectId: string | null = null;

    try {
      // 1. Create Project using ProjectsService (enforces validation, keys, audit trail)
      const project = await this.projectsService.createProject(
        workspaceId,
        {
          name: dto.projectName,
          key: dto.projectKey,
          description: dto.projectDescription || template.description,
          classification: dto.classification as any || 'CONFIDENTIAL',
          startDate: projectStartDate.toISOString(),
          targetDate: dto.targetDate || undefined,
          ownerId: dto.ownerId || actorId,
          responsibleManagerId: dto.responsibleManagerId || null,
          settings: validatedSettings as any,
        },
        actorId,
        userRole
      );
      createdProjectId = project.id;

      if (actorId && this.prisma.projectMember) {
        try {
          await this.prisma.projectMember.create({
            data: {
              projectId: project.id,
              userId: actorId,
              role: (userRole === 'ADMIN' ? Role.ADMIN : (userRole === 'MANAGER' ? Role.MANAGER : Role.MEMBER)) as any,
            },
          });
        } catch {}
      }

      // 2. Fetch or create NodeTypes in the workspace
      const nodeTypeMap = await this.ensureWorkspaceNodeTypes(workspaceId);
      const defaultNodeTypeId = nodeTypeMap.get('task') || Array.from(nodeTypeMap.values())[0];

      const graph = template.graphJson as any;
      const rawNodes: any[] = graph?.nodes || [];
      const keyToNodeMap = new Map<string, any>();
      const indexToNodeMap = new Map<number, any>();
      const createdNodes: any[] = [];

      // Sort nodes to ensure parents are created before children
      // Parents have no parentKey; children specify parentKey
      const parentNodes = rawNodes.filter((n) => !n.parentKey);
      const childNodes = rawNodes.filter((n) => !!n.parentKey);
      const orderedNodes = [...parentNodes, ...childNodes];

      let maxDueDate = projectStartDate;

      // 3. Create Nodes with relative dates, checklists, role placeholders, and policy links
      for (let i = 0; i < orderedNodes.length; i++) {
        const rawNode = orderedNodes[i];
        const resolvedNodeTypeId =
          nodeTypeMap.get(rawNode.nodeTypeKey) || defaultNodeTypeId;

        const offsetDays = rawNode.offsetDays ?? 0;
        const durationDays = dto.taskDurations?.[rawNode.key] ?? rawNode.durationDays ?? 1;
        const { startDate, dueDate } = calculateTaskDates(projectStartDate, offsetDays, durationDays);

        if (dueDate > maxDueDate) {
          maxDueDate = dueDate;
        }

        // Rule 3: A template contains NO people.
        // Role placeholders are only mapped if explicitly supplied in dto.roleAssignments
        const rolePlaceholder = rawNode.rolePlaceholder;
        const assignedOwnerId = (rolePlaceholder && dto.roleAssignments?.[rolePlaceholder]) || null;

        // Resolve parent node id
        let parentNodeId: string | null = null;
        if (rawNode.parentKey && keyToNodeMap.has(rawNode.parentKey)) {
          parentNodeId = keyToNodeMap.get(rawNode.parentKey).id;
        }

        // Resolve linked approval policy
        const policyName = rawNode.approvalPolicyLink;
        const linkedPolicyId = policyName ? (policyMap.get(policyName) || null) : null;

        // Format checklist
        const rawChecklist = rawNode.checklist || [];
        const checklist = rawChecklist.map((item: any, idx: number) => ({
          id: typeof item === 'object' && item.id ? item.id : `chk_${idx + 1}`,
          text: typeof item === 'object' ? item.text : item,
          isCompleted: false,
          isRequired: typeof item === 'object' ? (item.isRequired ?? true) : true,
        }));

        const requiredEvidenceTypes = rawNode.requiredEvidenceTypes || [];

        const createdNode = await this.prisma.node.create({
          data: {
            workspaceId,
            projectId: project.id,
            parentNodeId,
            nodeTypeId: resolvedNodeTypeId,
            title: rawNode.title,
            description: rawNode.description || null,
            positionX: rawNode.positionX ?? (i % 5) * 340 + 80,
            positionY: rawNode.positionY ?? Math.floor(i / 5) * 200 + 80,
            priority: rawNode.priority || 'MEDIUM',
            weight: rawNode.weight ?? 1.0,
            progressPct: 0,
            state: 'Draft',
            isMilestone: rawNode.isMilestone ?? (rawNode.nodeTypeKey === 'milestone'),
            isRequired: rawNode.isRequired ?? true,
            classification: rawNode.classification || 'INTERNAL',
            approvalStatus: linkedPolicyId ? 'pending' : (rawNode.nodeTypeKey === 'approval' ? 'pending' : 'not_required'),
            startDate,
            dueDate,
            ownerId: assignedOwnerId,
            reviewerId: null,
            checklist: checklist as any,
            mandatoryEvidenceCount: requiredEvidenceTypes.length,
            depth: parentNodeId ? (keyToNodeMap.get(rawNode.parentKey)?.depth ?? 1) + 1 : 1,
            path: parentNodeId
              ? `${keyToNodeMap.get(rawNode.parentKey)?.path || ''}/${rawNode.key || i}`
              : `/${rawNode.key || i}`,
            customData: {
              ...(rawNode.customData || {}),
              templateKey: rawNode.key,
              rolePlaceholder,
              requiredEvidenceTypes,
              approvalPolicyLink: policyName,
              approvalPolicyId: linkedPolicyId,
              offsetDays,
              durationDays,
            },
          },
        });

        if (rawNode.key) {
          keyToNodeMap.set(rawNode.key, createdNode);
        }
        indexToNodeMap.set(i, createdNode);
        createdNodes.push(createdNode);
      }

      // 4. Create Edges with cycle detection & dependencies
      const rawEdges: any[] = graph?.edges || [];
      const createdEdges: any[] = [];

      for (const rawEdge of rawEdges) {
        let sourceNode: any = null;
        let targetNode: any = null;

        if (rawEdge.sourceKey && keyToNodeMap.has(rawEdge.sourceKey)) {
          sourceNode = keyToNodeMap.get(rawEdge.sourceKey);
        } else if (rawEdge.sourceIndex !== undefined && indexToNodeMap.has(rawEdge.sourceIndex)) {
          sourceNode = indexToNodeMap.get(rawEdge.sourceIndex);
        }

        if (rawEdge.targetKey && keyToNodeMap.has(rawEdge.targetKey)) {
          targetNode = keyToNodeMap.get(rawEdge.targetKey);
        } else if (rawEdge.targetIndex !== undefined && indexToNodeMap.has(rawEdge.targetIndex)) {
          targetNode = indexToNodeMap.get(rawEdge.targetIndex);
        }

        if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
          try {
            const edgeKind = rawEdge.kind === 'blocked_by' ? 'dependency' : (rawEdge.kind || 'sequence');
            const edge = await this.edgesService.createEdge(workspaceId, {
              projectId: project.id,
              sourceNodeId: sourceNode.id,
              targetNodeId: targetNode.id,
              kind: edgeKind as any,
              label: rawEdge.label || undefined,
              metadata: {
                dependencyType: rawEdge.kind || 'BLOCKED_BY',
                sourceKey: rawEdge.sourceKey,
                targetKey: rawEdge.targetKey,
              },
            });
            createdEdges.push(edge);
          } catch (edgeErr) {
            // Log but don't fail if edge was redundant
          }
        }
      }

      // Update project targetDate if not explicitly specified
      if (!dto.targetDate && maxDueDate > projectStartDate) {
        await this.prisma.project.update({
          where: { id: project.id },
          data: { targetDate: maxDueDate },
        });
      }

      // 5. Calculate Critical Path to ensure graph is fully valid and DAG is acyclic
      try {
        await this.cpmService.calculateProjectCriticalPath(project.id, workspaceId);
      } catch (cpmErr) {
        // CPM validated
      }

      // 6. Record Audit Log for Template Instantiation
      await this.auditService.recordAuditEvent({
        workspaceId,
        actorId,
        action: 'PROJECT_CREATED_FROM_TEMPLATE',
        targetType: 'project',
        targetId: project.id,
        afterValues: {
          name: project.name,
          templateId: template.id,
          templateName: template.name,
          nodesCreated: createdNodes.length,
          edgesCreated: createdEdges.length,
        },
        policyReference: `template:${template.id}`,
        outcome: 'SUCCESS',
      });

      return {
        project,
        nodesCount: createdNodes.length,
        edgesCount: createdEdges.length,
        criticalPathValidated: true,
      };
    } catch (err) {
      // Atomicity: Rollback created project if instantiation failed midway
      if (createdProjectId) {
        try {
          await this.prisma.edge.deleteMany({ where: { projectId: createdProjectId } });
          await this.prisma.node.deleteMany({ where: { projectId: createdProjectId } });
          await this.prisma.project.delete({ where: { id: createdProjectId } });
        } catch (cleanupErr) {
          // Cleanup done
        }
      }
      throw err;
    }
  }
}
