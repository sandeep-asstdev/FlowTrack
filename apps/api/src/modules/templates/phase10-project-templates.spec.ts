import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { Role, ConfidentialityLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { ProjectsService } from '../projects/projects.service';
import { ProjectsController } from '../projects/projects.controller';
import { NodesService } from '../nodes/nodes.service';
import { EdgesService } from '../edges/edges.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../auth/authorization.service';
import { CpmService } from '../projects/cpm.service';
import { TaskLifecycleService } from '../nodes/task-lifecycle.service';

describe('Phase 10 — Project Templates Integration & Real DB/HTTP Verification', () => {
  let app: Express;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let templatesService: TemplatesService;
  let projectsService: ProjectsService;
  let approvalsService: ApprovalsService;
  let authService: AuthorizationService;
  let cpmService: CpmService;

  // Real test entities
  let workspace: any;
  let platformAdminUser: any;
  let projectManagerUser: any;
  let regularMemberUser: any;
  let unrelatedMemberUser: any;

  let platformAdminToken: string;
  let projectManagerToken: string;
  let regularMemberToken: string;
  let unrelatedMemberToken: string;

  let realEstateTemplate: any;
  let createdProjectId1: string;
  let createdProjectId2: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'flowtrack-super-secret-jwt-key-2026-very-secure',
      signOptions: { expiresIn: '1d' },
    });

    const auditService = new AuditService(prisma);
    authService = new AuthorizationService(prisma);
    approvalsService = new ApprovalsService(prisma, auditService, null as any, authService);
    cpmService = new CpmService(prisma);
    projectsService = new ProjectsService(prisma, authService, auditService);
    const taskLifecycle = new TaskLifecycleService(prisma, auditService, approvalsService, null as any, authService);
    const nodesService = new NodesService(prisma, auditService, null as any, authService, taskLifecycle);
    const edgesService = new EdgesService(prisma, cpmService);

    templatesService = new TemplatesService(
      prisma,
      projectsService,
      nodesService,
      edgesService,
      approvalsService,
      auditService,
      authService,
      cpmService
    );

    // Initialize seed templates
    await templatesService.onModuleInit();

    // Setup Express testing app
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use(async (req: any, res, next) => {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwtService.verify(token);
        const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
        const wsId = req.headers['x-workspace-id'] as string;
        let membership = null;
        if (wsId && user) {
          membership = await prisma.membership.findUnique({
            where: { workspaceId_userId: { workspaceId: wsId, userId: user.id } },
          });
        }
        req.user = {
          ...user,
          role: membership?.role || user?.role || Role.MEMBER,
          activeWorkspaceId: wsId,
        };
        next();
      } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    });

    const templatesCtrl = new TemplatesController(templatesService);
    const projectsCtrl = new ProjectsController(projectsService, cpmService);

    // Mount Routes
    app.get('/templates', (req, res) => templatesCtrl.list(req, req.headers['x-workspace-id'] as string, req.query.industry as string, req.query.category as string).then((r) => res.json(r)).catch((e) => res.status(e.status || 500).json({ message: e.message })));
    app.get('/templates/:id', (req, res) => templatesCtrl.get(req.params.id).then((r) => res.json(r)).catch((e) => res.status(e.status || 500).json({ message: e.message })));
    app.post('/templates', (req, res) => {
      if (req.user?.role !== Role.ADMIN && req.user?.role !== Role.MANAGER) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      return templatesCtrl.create(req, req.body, req.headers['x-workspace-id'] as string).then((r) => res.status(201).json(r)).catch((e) => res.status(e.status || 500).json({ message: e.message }));
    });
    app.patch('/templates/:id', (req, res) => {
      if (req.user?.role !== Role.ADMIN && req.user?.role !== Role.MANAGER) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      return templatesCtrl.update(req, req.params.id, req.body, req.headers['x-workspace-id'] as string).then((r) => res.json(r)).catch((e) => res.status(e.status || 500).json({ message: e.message }));
    });
    app.delete('/templates/:id', (req, res) => {
      if (req.user?.role !== Role.ADMIN && req.user?.role !== Role.MANAGER) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      return templatesCtrl.delete(req, req.params.id, req.headers['x-workspace-id'] as string).then((r) => res.json(r)).catch((e) => res.status(e.status || 500).json({ message: e.message }));
    });
    app.post('/templates/:id/duplicate', (req, res) => {
      if (req.user?.role !== Role.ADMIN && req.user?.role !== Role.MANAGER) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      return templatesCtrl.duplicate(req, req.params.id, req.headers['x-workspace-id'] as string).then((r) => res.status(201).json(r)).catch((e) => res.status(e.status || 500).json({ message: e.message }));
    });
    app.post('/templates/:id/instantiate', (req, res) => {
      return templatesCtrl.instantiate(req, req.params.id, req.body, req.headers['x-workspace-id'] as string)
        .then((r) => res.status(201).json(r))
        .catch((e) => {
          console.error('INSTANTIATE ERROR:', e);
          res.status(e.status || 500).json({ message: e.message });
        });
    });
    app.get('/projects/:id', (req, res) => {
      return projectsService
        .getProject(req.params.id, req.headers['x-workspace-id'] as string, req.user)
        .then((r) => res.json(r))
        .catch((e) => res.status(e.status || 500).json({ message: e.message }));
    });

    // Create Test Workspace
    const uniqueSuffix = `p10_${Date.now()}`;
    workspace = await prisma.workspace.create({
      data: {
        name: `Phase 10 Workspace ${uniqueSuffix}`,
        slug: `ws-${uniqueSuffix}`,
      },
    });

    // Create Test Users
    platformAdminUser = await prisma.user.create({
      data: {
        email: `admin_${uniqueSuffix}@flowtrack.dev`,
        fullName: 'Phase 10 Director / Admin',
      },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: platformAdminUser.id, role: Role.ADMIN },
    });

    projectManagerUser = await prisma.user.create({
      data: {
        email: `manager_${uniqueSuffix}@flowtrack.dev`,
        fullName: 'Phase 10 Project Head',
      },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: projectManagerUser.id, role: Role.MANAGER },
    });

    regularMemberUser = await prisma.user.create({
      data: {
        email: `member_${uniqueSuffix}@flowtrack.dev`,
        fullName: 'Phase 10 Site Engineer',
      },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: regularMemberUser.id, role: Role.MEMBER },
    });

    unrelatedMemberUser = await prisma.user.create({
      data: {
        email: `unrelated_${uniqueSuffix}@flowtrack.dev`,
        fullName: 'Phase 10 External User',
      },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: unrelatedMemberUser.id, role: Role.MEMBER },
    });

    platformAdminToken = jwtService.sign({ sub: platformAdminUser.id, email: platformAdminUser.email });
    projectManagerToken = jwtService.sign({ sub: projectManagerUser.id, email: projectManagerUser.email });
    regularMemberToken = jwtService.sign({ sub: regularMemberUser.id, email: regularMemberUser.email });
    unrelatedMemberToken = jwtService.sign({ sub: unrelatedMemberUser.id, email: unrelatedMemberUser.email });

    // Retrieve the Plotted Real Estate Layout template
    realEstateTemplate = await prisma.template.findFirst({
      where: { name: 'Plotted Real Estate Layout (50 acres)', workspaceId: null },
    });
    expect(realEstateTemplate).toBeDefined();
  });

  afterAll(async () => {
    try {
      if (workspace?.id) {
        await prisma.edge.deleteMany({ where: { workspaceId: workspace.id } });
        await prisma.node.deleteMany({ where: { workspaceId: workspace.id } });
        await prisma.approvalRequest.deleteMany({ where: { workspaceId: workspace.id } });
        await prisma.approvalPolicy.deleteMany({ where: { workspaceId: workspace.id } });
        await prisma.project.deleteMany({ where: { workspaceId: workspace.id } });
        await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } });
        await prisma.workspace.delete({ where: { id: workspace.id } });
      }
      if (platformAdminUser?.id) await prisma.user.delete({ where: { id: platformAdminUser.id } });
      if (projectManagerUser?.id) await prisma.user.delete({ where: { id: projectManagerUser.id } });
      if (regularMemberUser?.id) await prisma.user.delete({ where: { id: regularMemberUser.id } });
      if (unrelatedMemberUser?.id) await prisma.user.delete({ where: { id: unrelatedMemberUser.id } });
      await prisma.$disconnect();
    } catch (e) {
      // Cleanup complete
    }
  });

  it('1. lists templates and verifies the Plotted Real Estate Layout (50 acres) template content', async () => {
    const res = await request(app)
      .get('/templates')
      .set('Authorization', `Bearer ${projectManagerToken}`)
      .set('x-workspace-id', workspace.id);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const found = res.body.find((t: any) => t.name === 'Plotted Real Estate Layout (50 acres)');
    expect(found).toBeDefined();
    expect(found.description).toContain('Starter checklist - verify with your legal and liaison team');
    expect(found.category).toBe('Real Estate & Urban Development');
    expect(found.industry).toBe('construction_real_estate');

    const nodes = found.graphJson.nodes;
    expect(nodes.length).toBeGreaterThanOrEqual(30);

    // Verify 8 Phases are present as stages
    const phases = nodes.filter((n: any) => n.nodeTypeKey === 'stage');
    expect(phases.length).toBe(8);

    // Verify relative dates
    expect(nodes.every((n: any) => typeof n.offsetDays === 'number' && typeof n.durationDays === 'number')).toBe(true);

    // Verify milestones
    const milestones = nodes.filter((n: any) => n.isMilestone);
    expect(milestones.map((m: any) => m.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Legal clearance report'),
        expect.stringContaining('Final layout drawing'),
        expect.stringContaining('Internal roads'),
        expect.stringContaining('Launch approval'),
        expect.stringContaining('Handover of amenities'),
      ])
    );

    // Verify optional task
    const conversionTask = nodes.find((n: any) => n.key === 'TASK-3.1');
    expect(conversionTask).toBeDefined();
    expect(conversionTask.isRequired).toBe(false);
  });

  it('2. instantiates project from template through normal services with relative dates and checklists', async () => {
    const startDate = new Date('2027-01-01T00:00:00.000Z');
    const res = await request(app)
      .post(`/templates/${realEstateTemplate.id}/instantiate`)
      .set('Authorization', `Bearer ${projectManagerToken}`)
      .set('x-workspace-id', workspace.id)
      .send({
        projectName: 'Green Valley Layout, 50 Acres',
        projectKey: 'GVL-50',
        projectDescription: 'Develop 50 acres into approved, registrable residential plots',
        startDate: startDate.toISOString(),
        classification: 'CONFIDENTIAL',
        ownerId: platformAdminUser.id,
        responsibleManagerId: projectManagerUser.id,
        currency: { code: 'INR', symbol: '₹' },
        taskDurations: {
          'TASK-1.1': 10, // Override duration to 10 days
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.project).toBeDefined();
    createdProjectId1 = res.body.project.id;
    expect(res.body.project.name).toBe('Green Valley Layout, 50 Acres');
    expect(res.body.project.key).toBe('GVL-50');
    expect(res.body.project.classification).toBe('CONFIDENTIAL');
    expect(res.body.nodesCount).toBeGreaterThanOrEqual(30);
    expect(res.body.edgesCount).toBeGreaterThanOrEqual(15);
    expect(res.body.criticalPathValidated).toBe(true);

    // Verify nodes created in real database
    const dbNodes = await prisma.node.findMany({
      where: { projectId: createdProjectId1 },
      orderBy: { positionY: 'asc' },
    });
    expect(dbNodes.length).toBe(res.body.nodesCount);

    // Rule 3: Verify A template contains NO people: no task is accidentally assigned
    const unassignedTasks = dbNodes.filter((n) => n.ownerId === null);
    expect(unassignedTasks.length).toBe(dbNodes.length);

    // Verify relative dates calculated accurately
    const task1_1 = dbNodes.find((n) => (n.customData as any)?.templateKey === 'TASK-1.1');
    expect(task1_1).toBeDefined();
    expect(task1_1?.startDate?.toISOString()).toBe(startDate.toISOString());
    // Duration was overridden to 10 days
    const expectedDue1_1 = new Date(startDate.getTime() + 10 * 86400000);
    expect(task1_1?.dueDate?.toISOString()).toBe(expectedDue1_1.toISOString());

    // Verify checklists populated as rich items
    const checklist = task1_1?.checklist as any[];
    expect(Array.isArray(checklist)).toBe(true);
    expect(checklist.length).toBeGreaterThan(0);
    expect(checklist[0].isCompleted).toBe(false);

    // Verify mandatory evidence count
    expect(task1_1?.mandatoryEvidenceCount).toBe(2);

    // Verify classification inheritance
    const legalClearance = dbNodes.find((n) => (n.customData as any)?.templateKey === 'TASK-1.4');
    expect(legalClearance?.classification).toBe(ConfidentialityLevel.HIGHLY_CONFIDENTIAL);

    const priceList = dbNodes.find((n) => (n.customData as any)?.templateKey === 'TASK-6.1');
    expect(priceList?.classification).toBe(ConfidentialityLevel.HIGHLY_CONFIDENTIAL);

    // Verify approval policy link
    expect((legalClearance?.customData as any)?.approvalPolicyLink).toBe('Critical');
    expect((legalClearance?.customData as any)?.approvalPolicyId).toBeDefined();
  });

  it('3. creating twice does not duplicate or clash; project keys remain unique and acyclic', async () => {
    const res = await request(app)
      .post(`/templates/${realEstateTemplate.id}/instantiate`)
      .set('Authorization', `Bearer ${projectManagerToken}`)
      .set('x-workspace-id', workspace.id)
      .send({
        projectName: 'Green Valley Layout, 50 Acres — Phase 2',
        projectDescription: 'Second expansion plotted layout',
        startDate: '2027-06-01T00:00:00.000Z',
      });

    expect(res.status).toBe(201);
    createdProjectId2 = res.body.project.id;
    expect(createdProjectId2).not.toBe(createdProjectId1);
    expect(res.body.project.key).not.toBe('GVL-50');

    // Both projects have their own independent nodes
    const countP1 = await prisma.node.count({ where: { projectId: createdProjectId1 } });
    const countP2 = await prisma.node.count({ where: { projectId: createdProjectId2 } });
    expect(countP1).toBe(countP2);
  });

  it('4. computes critical path on the instantiated project without errors', async () => {
    const cpmResult = await cpmService.calculateProjectCriticalPath(createdProjectId1, workspace.id);
    expect(cpmResult).toBeDefined();
    expect(cpmResult.totalDurationDays).toBeGreaterThan(100);
    expect(Array.isArray(cpmResult.criticalPathIds)).toBe(true);
    expect(cpmResult.criticalPathIds.length).toBeGreaterThan(0);
  });

  it('5. rejects template instantiation when user lacks project-create permission (Role.MEMBER)', async () => {
    const res = await request(app)
      .post(`/templates/${realEstateTemplate.id}/instantiate`)
      .set('Authorization', `Bearer ${regularMemberToken}`)
      .set('x-workspace-id', workspace.id)
      .send({
        projectName: 'Unauthorized Project Attempt',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission|forbidden/i);
  });

  it('6. rejects template creation, update, and deletion by regular members', async () => {
    // Attempt Create
    const createRes = await request(app)
      .post('/templates')
      .set('Authorization', `Bearer ${regularMemberToken}`)
      .set('x-workspace-id', workspace.id)
      .send({
        name: 'Hacker Template',
        graphJson: { nodes: [], edges: [] },
      });
    expect(createRes.status).toBe(403);

    // Attempt Update
    const updateRes = await request(app)
      .patch(`/templates/${realEstateTemplate.id}`)
      .set('Authorization', `Bearer ${regularMemberToken}`)
      .set('x-workspace-id', workspace.id)
      .send({ name: 'Tampered Template' });
    expect(updateRes.status).toBe(403);

    // Attempt Delete
    const deleteRes = await request(app)
      .delete(`/templates/${realEstateTemplate.id}`)
      .set('Authorization', `Bearer ${regularMemberToken}`)
      .set('x-workspace-id', workspace.id);
    expect(deleteRes.status).toBe(403);
  });

  it('7. allows platform admin and manager to duplicate and customize templates', async () => {
    const duplicateRes = await request(app)
      .post(`/templates/${realEstateTemplate.id}/duplicate`)
      .set('Authorization', `Bearer ${projectManagerToken}`)
      .set('x-workspace-id', workspace.id);

    expect(duplicateRes.status).toBe(201);
    expect(duplicateRes.body.name).toBe('Plotted Real Estate Layout (50 acres) (Copy)');
    expect(duplicateRes.body.workspaceId).toBe(workspace.id);

    // Cleanup duplicated template
    await prisma.template.delete({ where: { id: duplicateRes.body.id } });
  });

  it('8. verifies confidentiality: unrelated user cannot view created confidential project', async () => {
    const viewRes = await request(app)
      .get(`/projects/${createdProjectId1}`)
      .set('Authorization', `Bearer ${unrelatedMemberToken}`)
      .set('x-workspace-id', workspace.id);

    // Confidentiality isolation: unauthorized user receives 404 Not Found to prevent enumeration
    expect([403, 404]).toContain(viewRes.status);
  });

  it('9. verifies all creation actions appear in the immutable audit log', async () => {
    const auditLogs = await prisma.auditEvent.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { timestamp: 'desc' },
    });

    expect(auditLogs.length).toBeGreaterThan(0);

    const templateAudits = auditLogs.filter((a) => a.action === 'PROJECT_CREATED_FROM_TEMPLATE');
    expect(templateAudits.length).toBeGreaterThanOrEqual(2);

    const p1Audit = templateAudits.find((a) => a.targetId === createdProjectId1);
    expect(p1Audit).toBeDefined();
    expect(p1Audit?.actorId).toBe(projectManagerUser.id);
  });
});
