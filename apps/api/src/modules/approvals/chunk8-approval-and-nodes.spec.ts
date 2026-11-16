import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { PrismaClient, Role, ConfidentialityLevel } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NodesService } from '../nodes/nodes.service';
import { TemplatesService } from '../templates/templates.service';
import { ProjectsService } from '../projects/projects.service';
import { CpmService } from '../projects/cpm.service';

describe('Chunk 8 - Approval Hierarchy and Node Types Verification', () => {
  let app: Express;
  let prisma: PrismaClient;
  let jwtService: JwtService;

  let workspace: any;
  let project: any;
  let defaultTaskType: any;
  let stageNodeType: any;
  let milestoneNodeType: any;
  let approvalNodeType: any;
  let statusSet: any;

  let adminUser: any;
  let managerUser: any;
  let teamLeadUser: any;
  let memberUser: any;
  let otherMemberUser: any;

  let adminToken: string;
  let managerToken: string;
  let teamLeadToken: string;
  let memberToken: string;

  let inProgressTask: any;
  let unassignedTask: any;

  let approvalsService: ApprovalsService;
  let nodesService: NodesService;
  let templatesService: TemplatesService;
  let cpmService: CpmService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    jwtService = new JwtService({ secret: 'chunk-8-test-secret' });

    const timestamp = Date.now();

    workspace = await prisma.workspace.create({
      data: {
        name: `Chunk 8 Workspace ${timestamp}`,
        slug: `chunk8-ws-${timestamp}`,
      },
    });

    // Create 4 users matching the 4 fixed roles
    adminUser = await prisma.user.create({
      data: { email: `admin-${timestamp}@chunk8.test`, fullName: 'Asha Admin', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: adminUser.id, role: Role.ADMIN },
    });

    managerUser = await prisma.user.create({
      data: { email: `manager-${timestamp}@chunk8.test`, fullName: 'Mohan Manager', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: managerUser.id, role: Role.MANAGER },
    });

    teamLeadUser = await prisma.user.create({
      data: { email: `lead-${timestamp}@chunk8.test`, fullName: 'Tarun TeamLead', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: teamLeadUser.id, role: Role.TEAM_LEAD },
    });

    memberUser = await prisma.user.create({
      data: { email: `member-${timestamp}@chunk8.test`, fullName: 'Maya Member', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: memberUser.id, role: Role.MEMBER },
    });

    otherMemberUser = await prisma.user.create({
      data: { email: `other-${timestamp}@chunk8.test`, fullName: 'Omkar Other', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: otherMemberUser.id, role: Role.MEMBER },
    });

    adminToken = jwtService.sign({ sub: adminUser.id, role: Role.ADMIN, activeWorkspaceId: workspace.id });
    managerToken = jwtService.sign({ sub: managerUser.id, role: Role.MANAGER, activeWorkspaceId: workspace.id });
    teamLeadToken = jwtService.sign({ sub: teamLeadUser.id, role: Role.TEAM_LEAD, activeWorkspaceId: workspace.id });
    memberToken = jwtService.sign({ sub: memberUser.id, role: Role.MEMBER, activeWorkspaceId: workspace.id });

    // Node types
    statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: `Status Set ${timestamp}`,
        statuses: {
          create: [
            { key: 'todo', category: 'todo', labelI18n: { en: 'To Do' }, displayOrder: 1 },
            { key: 'in_progress', category: 'active', labelI18n: { en: 'In Progress' }, displayOrder: 2 },
            { key: 'done', category: 'done', labelI18n: { en: 'Done' }, displayOrder: 3 },
          ],
        },
      },
      include: { statuses: true },
    });

    defaultTaskType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Task',
        key: 'task',
        defaultStatusSetId: statusSet.id,
      },
    });

    stageNodeType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Stage Phase Group',
        key: 'stage',
        isGroup: true,
      },
    });

    milestoneNodeType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Milestone Sign-Off',
        key: 'milestone',
      },
    });

    approvalNodeType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Approval Gate',
        key: 'approval',
      },
    });

    project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Construction Phase 1 ${timestamp}`,
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        classification: ConfidentialityLevel.INTERNAL,
      },
    });

    // Add members to project
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: managerUser.id, role: Role.MANAGER },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: teamLeadUser.id, role: Role.TEAM_LEAD },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: memberUser.id, role: Role.MEMBER },
    });

    // Create an In Progress task assigned to Maya Member, assigned by Mohan Manager
    inProgressTask = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: defaultTaskType.id,
        title: 'Excavation & Trenching',
        state: 'In Progress',
        ownerId: memberUser.id,
        assignedById: managerUser.id,
        approvalStatus: 'not_required',
      },
    });

    // Create an Unassigned task
    unassignedTask = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: defaultTaskType.id,
        title: 'Unassigned Survey Task',
        state: 'Draft',
        ownerId: null,
        approvalStatus: 'not_required',
      },
    });

    // Wire services
    const auditService = new AuditService(prisma as any);
    const notificationsService = new NotificationsService(prisma as any);
    const authService = new AuthorizationService(prisma as any);
    approvalsService = new ApprovalsService(
      prisma as any,
      auditService,
      notificationsService,
      authService
    );
    const approvalsController = new ApprovalsController(approvalsService);
    nodesService = new NodesService(prisma as any, auditService, notificationsService, undefined, authService);
    cpmService = new CpmService(prisma as any);
    const projectsService = new ProjectsService(prisma as any, authService, auditService);
    const edgesService = {} as any;
    templatesService = new TemplatesService(
      prisma as any,
      projectsService,
      nodesService,
      edgesService,
      approvalsService,
      auditService,
      authService,
      cpmService
    );

    app = express();
    app.use(express.json());

    const authMiddleware = async (req: any, res: any, next: any) => {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
      try {
        const payload = jwtService.verify(header.replace('Bearer ', ''));
        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user || !user.isActive) return res.status(401).json({ message: 'Unauthorized' });
        const membership = await prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
        });
        req.user = {
          ...user,
          role: membership?.role || Role.MEMBER,
          activeWorkspaceId: workspace.id,
          workspaceId: workspace.id,
        };
        next();
      } catch {
        return res.status(401).json({ message: 'Invalid token' });
      }
    };

    app.get('/api/v1/approvals/eligible-approvers', authMiddleware, async (req, res, next) => {
      try {
        const result = await approvalsController.getEligibleApprovers(
          req,
          req.query.taskId as string,
          req.query.nodeId as string,
          req.query.projectId as string,
          req.query.workspaceId as string
        );
        res.json(result);
      } catch (e) { next(e); }
    });

    app.post('/api/v1/approvals/requests', authMiddleware, async (req, res, next) => {
      try {
        const result = await approvalsController.createApprovalRequest(req, req.body, req.query.workspaceId as string);
        res.status(201).json(result);
      } catch (e) { next(e); }
    });

    app.use((err: any, req: any, res: any, next: any) => {
      const status = err.status || err.statusCode || 500;
      res.status(status).json({ message: err.message, status });
    });
  });

  afterAll(async () => {
    await prisma.taskApproval?.deleteMany?.({ where: { workspaceId: workspace.id } }).catch(() => null);
    await prisma.approvalRequest?.deleteMany?.({ where: { workspaceId: workspace.id } }).catch(() => null);
    await prisma.edge?.deleteMany?.({ where: { project: { workspaceId: workspace.id } } }).catch(() => null);
    await prisma.node?.deleteMany?.({ where: { workspaceId: workspace.id } }).catch(() => null);
    await prisma.projectMember?.deleteMany?.({ where: { project: { workspaceId: workspace.id } } }).catch(() => null);
    await prisma.project?.deleteMany?.({ where: { workspaceId: workspace.id } }).catch(() => null);
    await prisma.membership?.deleteMany?.({ where: { workspaceId: workspace.id } }).catch(() => null);
    await prisma.workspace?.deleteMany?.({ where: { id: workspace.id } }).catch(() => null);
    await prisma.$disconnect();
  });

  describe('Part A - Approval Request Hierarchy & Edge Cases', () => {
    it('Member assignee of In Progress task gets non-empty eligible approvers (Manager & Team Lead; Admin excluded; self excluded)', async () => {
      const res = await request(app)
        .get(`/api/v1/approvals/eligible-approvers?taskId=${inProgressTask.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);

      const approverIds = res.body.map((u: any) => u.id);
      expect(approverIds).toContain(managerUser.id);
      expect(approverIds).toContain(teamLeadUser.id);
      // Admin is strictly excluded for Member requester
      expect(approverIds).not.toContain(adminUser.id);
      // Submitter cannot select themselves
      expect(approverIds).not.toContain(memberUser.id);
      // Other unrelated members are excluded
      expect(approverIds).not.toContain(otherMemberUser.id);

      // Default: whoever assigned the task (managerUser) is placed first
      expect(res.body[0].id).toBe(managerUser.id);
    });

    it('Member assignee creates approval request with chosen approver, remark notes', async () => {
      const res = await request(app)
        .post('/api/v1/approvals/requests')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          nodeId: inProgressTask.id,
          chosenApproverId: managerUser.id,
          notes: 'Completed excavation per structural drawing Rev-2.',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.stageInstances[0].primaryApproverId).toBe(managerUser.id);

      // Verify node was updated to pending and reviewerId assigned
      const updatedNode = await prisma.node.findUnique({ where: { id: inProgressTask.id } });
      expect(updatedNode?.approvalStatus).toBe('pending');
      expect(updatedNode?.reviewerId).toBe(managerUser.id);
    });

    it('Member cannot send approval request to an Admin or ineligible user (direct API call fails with 403)', async () => {
      const resAdmin = await request(app)
        .post('/api/v1/approvals/requests')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          nodeId: inProgressTask.id,
          chosenApproverId: adminUser.id,
          notes: 'Attempting to bypass manager to Admin directly',
        });

      expect(resAdmin.status).toBe(403);
      expect(resAdmin.body.message).toMatch(/not an authorized eligible approver/i);

      const resOtherMember = await request(app)
        .post('/api/v1/approvals/requests')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          nodeId: inProgressTask.id,
          chosenApproverId: otherMemberUser.id,
        });

      expect(resOtherMember.status).toBe(403);
    });

    it('Unassigned task returns empty approver list', async () => {
      const res = await request(app)
        .get(`/api/v1/approvals/eligible-approvers?taskId=${unassignedTask.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('Admin never requests approval (eligible-approvers returns empty for Admin)', async () => {
      const res = await request(app)
        .get(`/api/v1/approvals/eligible-approvers?taskId=${inProgressTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('Manager requester can only ask approval from an Admin', async () => {
      const res = await request(app)
        .get(`/api/v1/approvals/eligible-approvers?taskId=${inProgressTask.id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      const approverIds = res.body.map((u: any) => u.id);
      expect(approverIds).toContain(adminUser.id);
      expect(approverIds).not.toContain(teamLeadUser.id);
      expect(approverIds).not.toContain(managerUser.id);
    });
  });

  describe('Part B - Single Node Type (Task) Enforcement & Templates', () => {
    it('Creating a node via API with a fake or legacy node type still creates a standard Task', async () => {
      const created = await nodesService.createNode(
        workspace.id,
        {
          projectId: project.id,
          title: 'Testing Legacy Node Type Bypass',
          nodeTypeId: stageNodeType.id, // client sends stageNodeType
          isMilestone: true,            // client sends isMilestone: true
        } as any,
        adminUser.id
      );

      expect(created).toBeDefined();
      expect(created.nodeTypeId).toBe(defaultTaskType.id);
      expect(created.isMilestone).toBe(false);

      const dbNode = await prisma.node.findUnique({ where: { id: created.id } });
      expect(dbNode?.nodeTypeId).toBe(defaultTaskType.id);
      expect(dbNode?.isMilestone).toBe(false);
    });

    it('Existing old-type nodes in database still compute CPM critical path without crashing', async () => {
      // Create existing nodes simulating legacy stage, milestone, approval gate
      const legacyStage = await prisma.node.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          nodeTypeId: stageNodeType.id,
          title: 'Legacy Phase 1',
          startDate: new Date('2026-01-01'),
          dueDate: new Date('2026-01-10'),
          progressPct: 100,
          state: 'Completed',
        },
      });

      const legacyMilestone = await prisma.node.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          nodeTypeId: milestoneNodeType.id,
          title: 'Legacy Foundation Milestone',
          isMilestone: true,
          startDate: new Date('2026-01-11'),
          dueDate: new Date('2026-01-15'),
          progressPct: 50,
        },
      });

      // Edge from stage to milestone
      await prisma.edge.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          sourceNodeId: legacyStage.id,
          targetNodeId: legacyMilestone.id,
          kind: 'dependency',
        },
      });

      // Critical path computation
      const cpmResult = await cpmService.calculateProjectCriticalPath(project.id, workspace.id);
      expect(cpmResult).toBeDefined();
      expect(Array.isArray(cpmResult.criticalPathIds)).toBe(true);
      expect(cpmResult.criticalPathIds.length).toBeGreaterThan(0);
    });

    it('Template instantiation converts all nodes into normal tasks with parent-child structure preserved', async () => {
      const template = await prisma.template.create({
        data: {
          name: `Sample Multi-Type Template ${Date.now()}`,
          category: 'Construction',
          graphJson: {
            nodes: [
              {
                key: 'phase_1',
                title: 'Phase 1 Structural Foundation',
                nodeTypeKey: 'stage',
                offsetDays: 0,
                durationDays: 10,
              },
              {
                key: 'subtask_1',
                parentKey: 'phase_1',
                title: 'Piling & Column Casting',
                nodeTypeKey: 'task',
                offsetDays: 0,
                durationDays: 5,
              },
              {
                key: 'milestone_1',
                parentKey: 'phase_1',
                title: 'Foundation Completion Milestone',
                nodeTypeKey: 'milestone',
                offsetDays: 5,
                durationDays: 5,
              },
              {
                key: 'gate_1',
                parentKey: 'phase_1',
                title: 'Safety Quality Sign-Off',
                nodeTypeKey: 'approval',
                offsetDays: 10,
                durationDays: 1,
              },
            ],
            edges: [],
          },
        },
      });

      const instantiatedResult = await templatesService.instantiateTemplate(
        template.id,
        workspace.id,
        {
          projectName: `Instantiated Project ${Date.now()}`,
          projectKey: `PRJ${Math.floor(Math.random() * 9000 + 1000)}`,
          classification: 'INTERNAL',
        },
        adminUser.id,
        'ADMIN'
      );

      expect(instantiatedResult?.project).toBeDefined();

      // Retrieve all nodes created for this project
      const projectNodes = await prisma.node.findMany({
        where: { projectId: instantiatedResult.project.id },
      });

      expect(projectNodes.length).toBe(4);

      // ALL instantiated nodes MUST be standard tasks
      for (const n of projectNodes) {
        expect(n.nodeTypeId).toBe(defaultTaskType.id);
        expect(n.isMilestone).toBe(false);
      }

      // Phase 1 is a parent task; the others are child tasks
      const phaseNode = projectNodes.find((n) => n.title.includes('Phase 1'));
      expect(phaseNode).toBeDefined();
      expect(phaseNode?.parentNodeId).toBeNull();

      const childNodes = projectNodes.filter((n) => n.parentNodeId === phaseNode?.id);
      expect(childNodes.length).toBe(3);
    });
  });
});
