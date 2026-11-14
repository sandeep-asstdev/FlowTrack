import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { Role, ConfidentialityLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NodesService } from './nodes.service';
import { TaskLifecycleService } from './task-lifecycle.service';
import { NodesController } from './nodes.controller';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import { ReportsService } from '../reports/reports.service';
import { ReportsController } from '../reports/reports.controller';
import { ProjectsService } from '../projects/projects.service';
import { ProjectsController } from '../projects/projects.controller';

describe('Phase 11 — Assignment Visibility, Child Tasks, Progress Removal, and Photo Evidence', () => {
  let app: Express;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let workspace: any;
  let project: any;
  let confidentialProject: any;
  let defaultTaskType: any;
  let defaultStatus: any;

  let managerUser: any;
  let userA: any;
  let userB: any;
  let unrelatedUser: any;

  let managerToken: string;
  let userAToken: string;
  let userBToken: string;
  let unrelatedToken: string;

  let taskForA: any;
  let taskForB: any;

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

    const reportsService = new ReportsService(prisma);
    const reportsController = new ReportsController(reportsService);

    const projectsService = new ProjectsService(prisma, undefined, undefined, undefined, authService, auditService);
    const projectsController = new ProjectsController(projectsService);

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
          role: payload.role,
          activeWorkspaceId: payload.activeWorkspaceId,
          workspaceId: payload.activeWorkspaceId,
        };
        next();
      } catch (err: any) {
        return res.status(401).json({ statusCode: 401, message: 'Invalid token' });
      }
    };

    // Controller Routes
    app.get('/api/v1/projects/:id', authMiddleware, async (req, res, next) => {
      try {
        const result = await projectsController.getProject(req.params.id, req);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.get('/api/v1/nodes', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.list(
          req,
          req.query.projectId as string,
          req.query.parentNodeId as string,
          req.query.search as string,
          req.query.customFieldKey as string,
          req.query.customFieldValue as string,
          req.query.ownerId as string,
          req.query.assignedById as string,
          req.query.assignedToMe as string,
          req.query.assignedByMe as string,
          req.query.teamId as string,
          req.query.statusId as string,
          req.query.approvalStatus as string,
          req.query.dueBefore as string,
          req.query.dueAfter as string,
        );
        res.json(result);
      } catch (e) { next(e); }
    });

    app.post('/api/v1/nodes', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.create(req, req.body);
        res.status(201).json(result);
      } catch (e) { next(e); }
    });

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
        const result = await nodesController.delete(req, req.params.id);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.post('/api/v1/nodes/:id/work-updates', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.createWorkUpdate(req, req.params.id, req.body);
        res.status(201).json(result);
      } catch (e) { next(e); }
    });

    app.get('/api/v1/nodes/:id/work-updates', authMiddleware, async (req, res, next) => {
      try {
        const result = await nodesController.listWorkUpdates(req, req.params.id);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.get('/api/v1/workspaces/:workspaceId/reports/role-dashboard', authMiddleware, async (req, res, next) => {
      try {
        const result = await reportsController.getRoleScopedDashboard(req.params.workspaceId, req);
        res.json(result);
      } catch (e) { next(e); }
    });

    // Error handler
    app.use((err: any, req: any, res: any, next: any) => {
      const status = err.status || err.statusCode || (err.getStatus ? err.getStatus() : 500);
      const message = err.message || (err.getResponse ? err.getResponse() : 'Internal Server Error');
      res.status(status).json({ statusCode: status, message });
    });

    // Seed Real Database Entities
    const timestamp = Date.now();
    workspace = await prisma.workspace.create({
      data: {
        name: `Phase 11 Workspace ${timestamp}`,
        slug: `phase11-ws-${timestamp}`,
      },
    });

    const statusSet = await prisma.statusSet.create({
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
    defaultStatus = statusSet.statuses[0];

    defaultTaskType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        key: 'task',
        name: 'Task',
        defaultStatusSetId: statusSet.id,
      },
    });

    // Create Users
    managerUser = await prisma.user.create({
      data: {
        email: `manager-${timestamp}@flowtrack.test`,
        fullName: 'Manish Manager',
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: managerUser.id,
        role: Role.MANAGER,
      },
    });

    userA = await prisma.user.create({
      data: {
        email: `usera-${timestamp}@flowtrack.test`,
        fullName: 'Ananya Assignee',
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: userA.id,
        role: Role.MEMBER,
      },
    });

    userB = await prisma.user.create({
      data: {
        email: `userb-${timestamp}@flowtrack.test`,
        fullName: 'Bharat Assignee',
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: userB.id,
        role: Role.MEMBER,
      },
    });

    unrelatedUser = await prisma.user.create({
      data: {
        email: `unrelated-${timestamp}@flowtrack.test`,
        fullName: 'Uma Unrelated',
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: unrelatedUser.id,
        role: Role.MEMBER,
      },
    });

    // Issue JWT Tokens
    managerToken = jwtService.sign({ sub: managerUser.id, role: Role.MANAGER, activeWorkspaceId: workspace.id });
    userAToken = jwtService.sign({ sub: userA.id, role: Role.MEMBER, activeWorkspaceId: workspace.id });
    userBToken = jwtService.sign({ sub: userB.id, role: Role.MEMBER, activeWorkspaceId: workspace.id });
    unrelatedToken = jwtService.sign({ sub: unrelatedUser.id, role: Role.MEMBER, activeWorkspaceId: workspace.id });

    // Create Projects
    project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Project Apollo ${timestamp}`,
        key: `APL${timestamp.toString().slice(-4)}`,
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        classification: ConfidentialityLevel.INTERNAL,
      },
    });

    // Add manager to project members
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: managerUser.id,
        role: Role.MANAGER,
      },
    });

    confidentialProject = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Classified Stealth ${timestamp}`,
        key: `STL${timestamp.toString().slice(-4)}`,
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        classification: ConfidentialityLevel.RESTRICTED,
      },
    });
    await prisma.projectMember.create({
      data: {
        projectId: confidentialProject.id,
        userId: managerUser.id,
        role: Role.MANAGER,
      },
    });
  });

  afterAll(async () => {
    if (workspace?.id) {
      await prisma.node.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.project.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
    }
    await prisma.$disconnect();
  });

  describe('Bug 1: Task Assignment Visibility, Access Grant, and Reassignment', () => {
    it('allows Manager to create a task assigned to User A (even if not yet in project_members), auto-granting limited project membership', async () => {
      const res = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectId: project.id,
          nodeTypeId: defaultTaskType.id,
          title: 'Design Apollo Wireframes',
          ownerId: userA.id,
        });

      expect(res.status).toBe(201);
      taskForA = res.body;

      // Must write assignee and assigned-by in one place
      expect(taskForA.ownerId).toBe(userA.id);
      expect(taskForA.owner?.fullName).toBe('Ananya Assignee');
      expect(taskForA.assignedById).toBe(managerUser.id);
      expect(taskForA.assignedBy?.fullName).toBe('Manish Manager');
      expect(taskForA.assignedAt).toBeDefined();

      // Verify User A was automatically granted limited project membership
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: userA.id } },
      });
      expect(member).toBeDefined();
      expect(member?.userId).toBe(userA.id);
    });

    it('allows Manager to create task for User B in the same project', async () => {
      const res = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectId: project.id,
          nodeTypeId: defaultTaskType.id,
          title: 'Backend API for Apollo',
          ownerId: userB.id,
        });

      expect(res.status).toBe(201);
      taskForB = res.body;
      expect(taskForB.ownerId).toBe(userB.id);
      expect(taskForB.owner?.fullName).toBe('Bharat Assignee');
    });

    it('allows Assignee User A to see task in My Tasks (role-dashboard)', async () => {
      const res = await request(app)
        .get(`/api/v1/workspaces/${workspace.id}/reports/role-dashboard`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      const myTasks = res.body?.assigneeWork?.myTasks || [];
      const found = myTasks.find((t: any) => t.id === taskForA.id);
      expect(found).toBeDefined();
      expect(found.title).toBe('Design Apollo Wireframes');
    });

    it('allows Assignee User A to open and view their assigned task', async () => {
      const res = await request(app)
        .get(`/api/v1/nodes/${taskForA.id}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(taskForA.id);
      expect(res.body.title).toBe('Design Apollo Wireframes');
      expect(res.body.owner?.fullName).toBe('Ananya Assignee');
      expect(res.body.can?.view).toBe(true);
      expect(res.body.can?.work).toBe(true);
    });

    it('isolates User A: User A CANNOT see sibling task assigned to User B', async () => {
      // Direct GET on User B's task by User A must return 404 Not Found
      const res = await request(app)
        .get(`/api/v1/nodes/${taskForB.id}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
    });

    it('isolates User A in listProjectNodes: User A sees only their assigned tasks on canvas/list/tree', async () => {
      const res = await request(app)
        .get(`/api/v1/nodes?projectId=${project.id}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      const nodeIds = res.body.map((n: any) => n.id);
      expect(nodeIds).toContain(taskForA.id);
      expect(nodeIds).not.toContain(taskForB.id);
    });

    it('proves User A cannot edit User B task (direct API check)', async () => {
      const res = await request(app)
        .patch(`/api/v1/nodes/${taskForB.id}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'Hacked by User A' });

      expect(res.status).toBe(403);
    });

    it('reassigning task from User A to User B revokes User A project access (if no remaining tasks) and grants User B', async () => {
      const res = await request(app)
        .patch(`/api/v1/nodes/${taskForA.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ownerId: userB.id });

      expect(res.status).toBe(200);
      expect(res.body.ownerId).toBe(userB.id);
      expect(res.body.owner?.fullName).toBe('Bharat Assignee');

      // User A now loses access
      const resA = await request(app)
        .get(`/api/v1/nodes/${taskForA.id}`)
        .set('Authorization', `Bearer ${userAToken}`);
      expect(resA.status).toBe(404);

      // User A removed from projectMember since they have no more tasks
      const memberA = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: userA.id } },
      });
      expect(memberA).toBeNull();

      // User B gains access
      const resB = await request(app)
        .get(`/api/v1/nodes/${taskForA.id}`)
        .set('Authorization', `Bearer ${userBToken}`);
      expect(resB.status).toBe(200);
    });
  });

  describe('Bug 2: Creating Child Tasks & Permission Scopes', () => {
    let parentTask: any;

    beforeAll(async () => {
      // Manager creates a parent task assigned to User A
      const res = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectId: project.id,
          nodeTypeId: defaultTaskType.id,
          title: 'Parent Deliverable for User A',
          ownerId: userA.id,
        });
      parentTask = res.body;
    });

    it('allows Assignee User A to create a child task beneath their assigned parent task', async () => {
      const res = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          projectId: project.id,
          parentNodeId: parentTask.id,
          nodeTypeId: defaultTaskType.id,
          title: 'Child Step 1: Draft Specs',
          ownerId: userA.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.parentNodeId).toBe(parentTask.id);
      expect(res.body.depth).toBe(parentTask.depth + 1);
      expect(res.body.path).toContain(parentTask.id);
    });

    it('rejects unrelated User B attempting to create child task beneath User A parent task (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          projectId: project.id,
          parentNodeId: parentTask.id,
          nodeTypeId: defaultTaskType.id,
          title: 'Illegitimate Child Step by User B',
        });

      expect(res.status).toBe(403);
    });

    it('enforces maximum task depth of 10 with clear message', async () => {
      // Artificially set a deep chain or test depth check
      let currentParentId = parentTask.id; // depth 1
      for (let d = 2; d <= 10; d++) {
        const res = await request(app)
          .post('/api/v1/nodes')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            projectId: project.id,
            parentNodeId: currentParentId,
            nodeTypeId: defaultTaskType.id,
            title: `Subtask at depth ${d}`,
          });
        expect(res.status).toBe(201);
        currentParentId = res.body.id;
      }

      // 11th level must fail
      const resTooDeep = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectId: project.id,
          parentNodeId: currentParentId,
          nodeTypeId: defaultTaskType.id,
          title: 'Subtask at depth 11 (exceeds limit)',
        });

      expect(resTooDeep.status).toBe(400);
      expect(resTooDeep.body.message).toMatch(/depth/i);
    });

    it('enforces confidentiality inheritance: child cannot be less restrictive than parent', async () => {
      // Create confidential parent task
      const resParent = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectId: confidentialProject.id,
          nodeTypeId: defaultTaskType.id,
          title: 'Restricted Strategy Parent',
          classification: ConfidentialityLevel.RESTRICTED,
        });
      expect(resParent.status).toBe(201);

      // Attempt to create child with PUBLIC_INTERNAL classification
      const resChild = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectId: confidentialProject.id,
          parentNodeId: resParent.body.id,
          nodeTypeId: defaultTaskType.id,
          title: 'Illegally Public Child',
          classification: ConfidentialityLevel.PUBLIC_INTERNAL,
        });

      expect(resChild.status).toBe(400);
      expect(resChild.body.message).toMatch(/confidentiality/i);
    });
  });

  describe('Bug 3: Progress Percentage Removal', () => {
    it('verifies task completion readiness and completion do NOT require progress percentage', async () => {
      const res = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectId: project.id,
          nodeTypeId: defaultTaskType.id,
          title: 'Factual Completion Test Task',
          ownerId: userA.id,
        });
      expect(res.status).toBe(201);
      const taskId = res.body.id;

      // Update task to Done category status without providing progressPct
      const doneStatus = await prisma.status.findFirst({
        where: { category: 'done' },
      });
      if (doneStatus) {
        const resUpdate = await request(app)
          .patch(`/api/v1/nodes/${taskId}`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ statusId: doneStatus.id });

        expect(resUpdate.status).toBe(200);
        expect(resUpdate.body.status?.category).toBe('done');
      }
    });
  });

  describe('Bug 4: Work Reporting with Photos and Attachments', () => {
    let taskForWork: any;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectId: project.id,
          nodeTypeId: defaultTaskType.id,
          title: 'Physical Site Inspection',
          ownerId: userA.id,
        });
      taskForWork = res.body;
    });

    it('allows Assignee User A to post a work update with note and photo/document attachments', async () => {
      const res = await request(app)
        .post(`/api/v1/nodes/${taskForWork.id}/work-updates`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          notes: 'Completed morning inspection of beam integrity',
          attachments: [
            {
              fileName: 'inspection-photo.jpg',
              fileType: 'image/jpeg',
              fileSize: 102400,
              fileUrl: 'https://storage.flowtrack.test/evidence/inspection-photo.jpg',
              category: 'Photo',
              caption: 'Crack measurement on Pillar 4',
            },
            {
              fileName: 'structural-report.pdf',
              fileType: 'application/pdf',
              fileSize: 512000,
              fileUrl: 'https://storage.flowtrack.test/evidence/structural-report.pdf',
              category: 'Document',
              caption: 'Certified engineering signoff',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.notes).toContain('beam integrity');
      expect(res.body.attachments).toHaveLength(2);
      expect(res.body.attachments[0].fileName).toBe('inspection-photo.jpg');
    });

    it('allows Manager and Reviewer to view posted updates and attachments in timeline', async () => {
      const res = await request(app)
        .get(`/api/v1/nodes/${taskForWork.id}/work-updates`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const update = res.body[0];
      expect(update.attachments).toHaveLength(2);
      expect(update.attachments[0].caption).toBe('Crack measurement on Pillar 4');
    });

    it('rejects unrelated User B from viewing task work updates and attachments (404/403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/nodes/${taskForWork.id}/work-updates`)
        .set('Authorization', `Bearer ${userBToken}`);

      // Unrelated user cannot view work updates of User A's task
      expect([403, 404]).toContain(res.status);
    });
  });
});
