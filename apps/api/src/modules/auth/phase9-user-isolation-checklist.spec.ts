import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { Role, ConfidentialityLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NodesService } from '../nodes/nodes.service';
import { TaskLifecycleService } from '../nodes/task-lifecycle.service';
import { NodesController } from '../nodes/nodes.controller';
import { AuthorizationService } from './authorization.service';
import { AuditService } from '../audit/audit.service';
import { AdminService } from '../admin/admin.service';
import { AdminController } from '../admin/admin.controller';
import { ReportsService } from '../reports/reports.service';
import { ReportsController } from '../reports/reports.controller';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { WorkspacesController } from '../workspaces/workspaces.controller';

describe('Phase 9 — User Isolation & Task Checklist Real DB HTTP Verification', () => {
  let app: Express;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Real entities created in database
  let workspace: any;
  let projectP: any;
  let projectQ: any;
  let confidentialProject: any;
  let nodeType: any;
  let defaultStatus: any;

  let sandeepUser: any;
  let sureshUser: any;
  let projectManagerUser: any;
  let unrelatedManagerUser: any;
  let platformAdminUser: any;

  let sandeepToken: string;
  let sureshToken: string;
  let projectManagerToken: string;
  let unrelatedManagerToken: string;
  let platformAdminToken: string;

  let sureshTaskId: string;
  let confidentialTaskId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'flowtrack-super-secret-jwt-key-2026-very-secure',
      signOptions: { expiresIn: '1d' },
    });

    const auditService = new AuditService(prisma);
    const authService = new AuthorizationService(prisma);
    const lifecycleService = new TaskLifecycleService(prisma, auditService, undefined, authService, undefined);
    const nodesService = new NodesService(prisma, auditService, undefined, undefined, authService);
    const nodesController = new NodesController(nodesService, lifecycleService);

    const adminService = new AdminService(prisma);
    const adminController = new AdminController(adminService);

    const reportsService = new ReportsService(prisma);
    const reportsController = new ReportsController(reportsService);

    const workspacesService = new WorkspacesService(prisma);
    const workspacesController = new WorkspacesController(workspacesService);

    // Setup Express Server
    app = express();
    app.use(express.json());

    // JWT Auth Middleware
    const authMiddleware = async (req: any, res: any, next: any) => {
      try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
        }
        const token = authHeader.split(' ')[1];
        const payload = jwtService.verify(token);
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          include: { memberships: true },
        });
        if (!user || !user.isActive || user.deletedAt) {
          return res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
        }
        req.user = {
          ...user,
          activeWorkspaceId: payload.activeWorkspaceId,
          workspaceId: payload.activeWorkspaceId,
        };
        next();
      } catch (err: any) {
        return res.status(401).json({ statusCode: 401, message: 'Invalid token' });
      }
    };

    // Mount Real Controller Routes
    app.get('/api/v1/nodes/:id', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.get(req, req.params.id);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.patch('/api/v1/nodes/:id', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.update(req, req.params.id, req.body);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.delete('/api/v1/nodes/:id', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.delete(req.params.id);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.patch('/api/v1/nodes/:id/checklist', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.updateChecklist(req, req.params.id, req.body);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.post('/api/v1/nodes/:id/work-updates', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.createWorkUpdate(req, req.params.id, req.body);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.post('/api/v1/nodes/:id/evidence', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.attachEvidence(req, req.params.id, req.body);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.post('/api/v1/nodes/:id/submit-work', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.submitWork(req, req.params.id, req.body);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.get('/api/v1/workspaces/:workspaceId/reports/role-dashboard', authMiddleware, async (req, res, next) => {
      try {
        const result = await reportsController.getRoleScopedDashboard(req.params.workspaceId, req);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.patch('/api/v1/admin/users/:id/role', authMiddleware, async (req, res, next) => {
      try {
        const result = await adminController.updateUserRole(req, req.params.id, req.body.role, req.body.workspaceId);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.patch('/api/v1/workspaces/:id/members/:userId/role', authMiddleware, async (req, res, next) => {
      try {
        const result = await workspacesController.updateRole(req, req.params.id, req.params.userId, req.body);
        res.json(result);
      } catch (e) { next(e); }
    });

    // Error handler
    app.use((err: any, req: any, res: any, next: any) => {
      const status = err.status || err.statusCode || (err.getStatus ? err.getStatus() : 500);
      const message = err.message || (err.getResponse ? err.getResponse() : 'Internal Server Error');
      res.status(status).json({ statusCode: status, message });
    });

    // Seed Real Database Entities for this test
    const timestamp = Date.now();
    workspace = await prisma.workspace.create({
      data: {
        name: `Test Isolation Workspace ${timestamp}`,
        slug: `iso-ws-${timestamp}`,
      },
    });

    const statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: `Default Status Set ${timestamp}`,
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
    defaultStatus = statusSet.statuses.find((s) => s.category === 'todo');

    nodeType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: `Task Type ${timestamp}`,
        key: `task-${timestamp}`,
        defaultStatusSetId: statusSet.id,
      },
    });

    // 1. Sandeep (Member)
    sandeepUser = await prisma.user.create({
      data: {
        email: `sandeep_${timestamp}@flowtrack.test`,
        fullName: 'Sandeep Raichur',
        passwordHash: 'dummyhash',
        isActive: true,
        memberships: {
          create: { workspaceId: workspace.id, role: Role.MEMBER },
        },
      },
    });

    // 2. Suresh (Member)
    sureshUser = await prisma.user.create({
      data: {
        email: `suresh_${timestamp}@flowtrack.test`,
        fullName: 'Suresh Kumar',
        passwordHash: 'dummyhash',
        isActive: true,
        memberships: {
          create: { workspaceId: workspace.id, role: Role.MEMBER },
        },
      },
    });

    // 3. Project Manager (Manager of Project P)
    projectManagerUser = await prisma.user.create({
      data: {
        email: `pm_${timestamp}@flowtrack.test`,
        fullName: 'Project Manager P',
        passwordHash: 'dummyhash',
        isActive: true,
        memberships: {
          create: { workspaceId: workspace.id, role: Role.MANAGER },
        },
      },
    });

    // 4. Unrelated Manager (Manager of Project Q only)
    unrelatedManagerUser = await prisma.user.create({
      data: {
        email: `unrelated_pm_${timestamp}@flowtrack.test`,
        fullName: 'Unrelated Manager Q',
        passwordHash: 'dummyhash',
        isActive: true,
        memberships: {
          create: { workspaceId: workspace.id, role: Role.MANAGER },
        },
      },
    });

    // 5. Platform Admin (Platform Administrator)
    platformAdminUser = await prisma.user.create({
      data: {
        email: `admin_${timestamp}@flowtrack.test`,
        fullName: 'Platform Admin',
        passwordHash: 'dummyhash',
        isActive: true,
        memberships: {
          create: { workspaceId: workspace.id, role: Role.ADMIN },
        },
      },
    });

    // Generate real JWT tokens
    sandeepToken = jwtService.sign({ sub: sandeepUser.id, email: sandeepUser.email, activeWorkspaceId: workspace.id });
    sureshToken = jwtService.sign({ sub: sureshUser.id, email: sureshUser.email, activeWorkspaceId: workspace.id });
    projectManagerToken = jwtService.sign({ sub: projectManagerUser.id, email: projectManagerUser.email, activeWorkspaceId: workspace.id });
    unrelatedManagerToken = jwtService.sign({ sub: unrelatedManagerUser.id, email: unrelatedManagerUser.email, activeWorkspaceId: workspace.id });
    platformAdminToken = jwtService.sign({ sub: platformAdminUser.id, email: platformAdminUser.email, activeWorkspaceId: workspace.id });

    // Create Project P (Managed by projectManagerUser)
    projectP = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Project P ${timestamp}`,
        key: `P${String(timestamp).slice(-3)}`,
        ownerId: projectManagerUser.id,
        responsibleManagerId: projectManagerUser.id,
        members: {
          create: [
            { userId: projectManagerUser.id, role: Role.MANAGER },
            { userId: sureshUser.id, role: Role.MEMBER },
            { userId: sandeepUser.id, role: Role.MEMBER },
          ],
        },
      },
    });

    // Create Project Q (Managed by unrelatedManagerUser)
    projectQ = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Project Q ${timestamp}`,
        key: `Q${String(timestamp).slice(-3)}`,
        ownerId: unrelatedManagerUser.id,
        responsibleManagerId: unrelatedManagerUser.id,
        members: {
          create: [
            { userId: unrelatedManagerUser.id, role: Role.MANAGER },
          ],
        },
      },
    });

    // Create Confidential Project (Restricted to Project Manager, platform admin NOT a member)
    confidentialProject = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Confidential Alpha ${timestamp}`,
        key: `SEC${String(timestamp).slice(-3)}`,
        ownerId: projectManagerUser.id,
        classification: ConfidentialityLevel.CONFIDENTIAL,
        members: {
          create: [
            { userId: projectManagerUser.id, role: Role.MANAGER },
          ],
        },
      },
    });

    // Create Task assigned to Suresh in Project P
    const sureshNode = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: projectP.id,
        nodeTypeId: nodeType.id,
        statusId: defaultStatus.id,
        title: 'Suresh Core Task: Wireframe & Schematics',
        description: 'Assigned strictly to Suresh',
        ownerId: sureshUser.id,
        reviewerId: projectManagerUser.id,
        checklist: [
          { id: 'step-1', text: 'Create initial Figma mockups', completed: false },
          { id: 'step-2', text: 'Review architectural dimensions', completed: false },
        ],
        progressPct: 0,
      },
    });
    sureshTaskId = sureshNode.id;

    // Create Confidential Task
    const confidentialNode = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: confidentialProject.id,
        nodeTypeId: nodeType.id,
        statusId: defaultStatus.id,
        title: 'Top Secret Strategy',
        ownerId: projectManagerUser.id,
        classification: ConfidentialityLevel.CONFIDENTIAL,
      },
    });
    confidentialTaskId = confidentialNode.id;
  });

  afterAll(async () => {
    if (workspace?.id) {
      await prisma.node.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.project.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [
              sandeepUser?.id,
              sureshUser?.id,
              projectManagerUser?.id,
              unrelatedManagerUser?.id,
              platformAdminUser?.id,
            ].filter(Boolean),
          },
        },
      }).catch(() => null);
      await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
    }
    await prisma.$disconnect();
  });

  describe('Requirement 1 & Bug 3 Reproduction: Sandeep CANNOT edit Suresh Task', () => {
    it('proves Sandeep cannot edit title or description on Suresh task (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${sandeepToken}`)
        .send({ title: 'Hacked by Sandeep', description: 'Malicious modification' });

      // Before fix: Sandeep could edit if not checked or if role allowed
      // Must be 403 Forbidden
      expect(res.status).toBe(403);
    });

    it('proves Sandeep cannot update progressPct or task work on Suresh task (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${sandeepToken}`)
        .send({ progressPct: 100 });

      expect(res.status).toBe(403);
    });

    it('proves Sandeep cannot reassign Suresh task to himself or change dates (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${sandeepToken}`)
        .send({ ownerId: sandeepUser.id, dueDate: '2028-12-31T00:00:00.000Z' });

      expect(res.status).toBe(403);
    });

    it('proves Sandeep cannot delete Suresh task (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${sandeepToken}`);

      expect(res.status).toBe(403);
    });

    it('proves Sandeep cannot tick, untick or modify Suresh checklist items (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}/checklist`)
        .set('Authorization', `Bearer ${sandeepToken}`)
        .send({
          checklist: [
            { id: 'step-1', text: 'Create initial Figma mockups', completed: true },
          ],
        });

      expect(res.status).toBe(403);
    });

    it('proves Sandeep cannot submit work updates or evidence on Suresh task (403 Forbidden)', async () => {
      const resWorkUpdate = await request(app)
        .post(`/api/v1/nodes/${sureshTaskId}/work-updates`)
        .set('Authorization', `Bearer ${sandeepToken}`)
        .send({ notes: 'Sandeep pretending to work', progressPct: 50 });

      expect(resWorkUpdate.status).toBe(403);

      const resEvidence = await request(app)
        .post(`/api/v1/nodes/${sureshTaskId}/evidence`)
        .set('Authorization', `Bearer ${sandeepToken}`)
        .send({ title: 'Fake Evidence', category: 'General' });

      expect(resEvidence.status).toBe(403);
    });
  });

  describe('Requirement 2: Dashboard & My Tasks Isolation (no client-supplied userId leakage)', () => {
    it('strictly returns Sandeep own work when Sandeep accesses role-dashboard, ignoring ?userId=', async () => {
      const res = await request(app)
        .get(`/api/v1/workspaces/${workspace.id}/reports/role-dashboard?userId=${sureshUser.id}`)
        .set('Authorization', `Bearer ${sandeepToken}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('MEMBER');
      // Must NOT contain Suresh task in Sandeep's assigned list!
      const myTaskIds = (res.body.assigneeWork?.myTasks || []).map((t: any) => t.id);
      expect(myTaskIds).not.toContain(sureshTaskId);
    });
  });

  describe('Requirement 3: Role Self-Change & Platform Admin Content Isolation', () => {
    it('proves Sandeep cannot promote himself to MANAGER (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspace.id}/members/${sandeepUser.id}/role`)
        .set('Authorization', `Bearer ${sandeepToken}`)
        .send({ role: 'MANAGER' });

      expect(res.status).toBe(403);
    });

    it('proves Platform Admin CAN update user role with audit event', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${sureshUser.id}/role`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ role: 'MEMBER', workspaceId: workspace.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify audit event exists
      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          targetId: sureshUser.id,
          action: 'USER_ROLE_UPDATED',
        },
      });
      expect(auditEvent).toBeDefined();
    });

    it('proves Platform Admin CANNOT view confidential project business content (404 Not Found)', async () => {
      const res = await request(app)
        .get(`/api/v1/nodes/${confidentialTaskId}`)
        .set('Authorization', `Bearer ${platformAdminToken}`);

      // Technical admin without business grant receives 404 to hide confidential initiative existence
      expect(res.status).toBe(404);
    });
  });

  describe('Requirement 4: Manager Scope & Checklists (Project Manager vs Unrelated Manager)', () => {
    it('proves Unrelated Manager Q cannot modify tasks in Project P (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${unrelatedManagerToken}`)
        .send({ title: 'Unrelated Manager Hijack' });

      expect(res.status).toBe(403);
    });

    it('proves Project Manager P can manage dates/scope, but CANNOT tick assignee checklist (403 Forbidden)', async () => {
      // 1. Managing task dates: Allowed for Project Manager
      const resDate = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${projectManagerToken}`)
        .send({ dueDate: '2027-06-30T00:00:00.000Z' });

      expect(resDate.status).toBe(200);

      // 2. Ticking assignee checklist: FORBIDDEN for Project Manager (only assignee can tick)
      const resTick = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}/checklist`)
        .set('Authorization', `Bearer ${projectManagerToken}`)
        .send({
          checklist: [
            { id: 'step-1', text: 'Create initial Figma mockups', completed: true },
          ],
        });

      expect(resTick.status).toBe(403);
    });
  });

  describe('Requirement 5: Assignee Checklist Lifecycle & Completion Gate', () => {
    it('proves Assignee Suresh can tick checklist items, persisting to DB and updating gate', async () => {
      const res = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}/checklist`)
        .set('Authorization', `Bearer ${sureshToken}`)
        .send({
          checklist: [
            { id: 'step-1', text: 'Create initial Figma mockups', completed: true },
            { id: 'step-2', text: 'Review architectural dimensions', completed: true },
          ],
        });

      expect(res.status).toBe(200);

      // Verify persistence in DB
      const dbNode = await prisma.node.findUnique({ where: { id: sureshTaskId } });
      const savedList = dbNode?.checklist as any[];
      expect(savedList).toBeDefined();
      expect(savedList.every((i) => i.completed === true)).toBe(true);
    });

    it('proves Assignee Suresh can add and delete checklist items', async () => {
      // Add a third item
      const resAdd = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}/checklist`)
        .set('Authorization', `Bearer ${sureshToken}`)
        .send({
          checklist: [
            { id: 'step-1', text: 'Create initial Figma mockups', completed: true },
            { id: 'step-2', text: 'Review architectural dimensions', completed: true },
            { id: 'step-3', text: 'Third item added', completed: false },
          ],
        });

      expect(resAdd.status).toBe(200);
      let dbNode = await prisma.node.findUnique({ where: { id: sureshTaskId } });
      expect((dbNode?.checklist as any[]).length).toBe(3);

      // Delete the third item
      const resDelete = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}/checklist`)
        .set('Authorization', `Bearer ${sureshToken}`)
        .send({
          checklist: [
            { id: 'step-1', text: 'Create initial Figma mockups', completed: true },
            { id: 'step-2', text: 'Review architectural dimensions', completed: true },
          ],
        });

      expect(resDelete.status).toBe(200);
      dbNode = await prisma.node.findUnique({ where: { id: sureshTaskId } });
      expect((dbNode?.checklist as any[]).length).toBe(2);
    });
  });

  describe('Requirement 6: Mass-Assignment Attack Prevention', () => {
    it('ignores or rejects attempts by a regular user to override projectId, workspaceId, or role', async () => {
      const res = await request(app)
        .patch(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${sureshToken}`)
        .send({
          projectId: projectQ.id,
          workspaceId: 'evil-ws',
          role: 'ADMIN',
        });

      // Should succeed for allowed fields or reject, but MUST NOT change projectId or workspaceId in DB
      const dbNode = await prisma.node.findUnique({ where: { id: sureshTaskId } });
      expect(dbNode?.projectId).toBe(projectP.id);
      expect(dbNode?.workspaceId).toBe(workspace.id);
    });
  });

  describe('Requirement 7: Server-Driven Capabilities (can object on task responses)', () => {
    it('returns can object tailored to Sandeep on Suresh task (can.edit: false, can.tickChecklist: false, can.work: false)', async () => {
      const res = await request(app)
        .get(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${sandeepToken}`);

      expect(res.status).toBe(200);
      expect(res.body.can).toBeDefined();
      expect(res.body.can.edit).toBe(false);
      expect(res.body.can.work).toBe(false);
      expect(res.body.can.tickChecklist).toBe(false);
      expect(res.body.can.submit).toBe(false);
      expect(res.body.can.delete).toBe(false);
    });

    it('returns can object tailored to Suresh on Suresh task (can.work: true, can.tickChecklist: true, can.submit: true)', async () => {
      const res = await request(app)
        .get(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${sureshToken}`);

      expect(res.status).toBe(200);
      expect(res.body.can).toBeDefined();
      expect(res.body.can.work).toBe(true);
      expect(res.body.can.tickChecklist).toBe(true);
      expect(res.body.can.submit).toBe(true);
      expect(res.body.can.delete).toBe(false); // only manager can delete
    });

    it('returns can object tailored to Project Manager P (can.edit: true, can.manage: true, can.changeDates: true, can.tickChecklist: false)', async () => {
      const res = await request(app)
        .get(`/api/v1/nodes/${sureshTaskId}`)
        .set('Authorization', `Bearer ${projectManagerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.can).toBeDefined();
      expect(res.body.can.edit).toBe(true);
      expect(res.body.can.manage).toBe(true);
      expect(res.body.can.changeDates).toBe(true);
      expect(res.body.can.tickChecklist).toBe(false); // manager cannot tick assignee's checklist
    });
  });
});
