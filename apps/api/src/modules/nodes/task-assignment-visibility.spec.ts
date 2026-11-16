import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { PrismaClient, Role, ConfidentialityLevel } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { TaskLifecycleService } from './task-lifecycle.service';
import { ReportsService } from '../reports/reports.service';
import { ReportsController } from '../reports/reports.controller';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthorizationService } from '../auth/authorization.service';

describe('Task Assignment, Scoping, and Visibility Verification (task-assignment-visibility.spec.ts)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let jwtService: JwtService;

  let workspace: any;
  let normalProject: any;
  let restrictedProject: any;
  let taskType: any;
  let defaultStatus: any;

  let managerUser: any;
  let assigneeUser: any;
  let otherMemberUser: any;
  let unrelatedManagerUser: any;

  let managerToken: string;
  let assigneeToken: string;
  let otherMemberToken: string;
  let unrelatedManagerToken: string;

  let assignedTaskId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    jwtService = new JwtService({ secret: 'test-secret-key-task-assignment' });

    const timestamp = Date.now();

    // 1. Create Workspace
    workspace = await prisma.workspace.create({
      data: {
        name: `Assignment Vis Workspace ${timestamp}`,
        slug: `assign-vis-${timestamp}`,
      },
    });

    // 2. Create Users & Workspace Memberships
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

    assigneeUser = await prisma.user.create({
      data: {
        email: `assignee-${timestamp}@flowtrack.test`,
        fullName: 'Ananya Assignee',
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: assigneeUser.id,
        role: Role.MEMBER,
      },
    });

    otherMemberUser = await prisma.user.create({
      data: {
        email: `other-${timestamp}@flowtrack.test`,
        fullName: 'Omkar Other',
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: otherMemberUser.id,
        role: Role.MEMBER,
      },
    });

    unrelatedManagerUser = await prisma.user.create({
      data: {
        email: `unrelated-mgr-${timestamp}@flowtrack.test`,
        fullName: 'Umesh Unrelated Manager',
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: unrelatedManagerUser.id,
        role: Role.MANAGER,
      },
    });

    // 3. Issue Tokens
    managerToken = jwtService.sign({ sub: managerUser.id, role: Role.MANAGER, activeWorkspaceId: workspace.id });
    assigneeToken = jwtService.sign({ sub: assigneeUser.id, role: Role.MEMBER, activeWorkspaceId: workspace.id });
    otherMemberToken = jwtService.sign({ sub: otherMemberUser.id, role: Role.MEMBER, activeWorkspaceId: workspace.id });
    unrelatedManagerToken = jwtService.sign({ sub: unrelatedManagerUser.id, role: Role.MANAGER, activeWorkspaceId: workspace.id });

    // 4. Create Node Type & Status
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

    taskType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Task',
        key: 'task',
        defaultStatusSetId: statusSet.id,
      },
    });

    // 5. Create Projects
    normalProject = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Normal Project ${timestamp}`,
        key: `NORM${timestamp.toString().slice(-4)}`,
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        classification: ConfidentialityLevel.INTERNAL,
      },
    });
    await prisma.projectMember.create({
      data: {
        projectId: normalProject.id,
        userId: managerUser.id,
        role: Role.MANAGER,
      },
    });

    restrictedProject = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Restricted Project ${timestamp}`,
        key: `RST${timestamp.toString().slice(-4)}`,
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        classification: ConfidentialityLevel.RESTRICTED,
      },
    });
    await prisma.projectMember.create({
      data: {
        projectId: restrictedProject.id,
        userId: managerUser.id,
        role: Role.MANAGER,
      },
    });

    // 6. Build App & Controllers
    const auditService = new AuditService(prisma as any);
    const notifService = new NotificationsService(prisma as any);
    const authService = new AuthorizationService(prisma as any);
    const workspacesService = new WorkspacesService(prisma as any);
    const nodesService = new NodesService(prisma as any, auditService, notifService);
    const lifecycleService = new TaskLifecycleService(prisma as any, auditService, notifService);
    const nodesController = new NodesController(nodesService, lifecycleService);
    const reportsService = new ReportsService(prisma as any, authService);
    const reportsController = new ReportsController(reportsService);

    app = express();
    app.use(express.json());

    const authMiddleware = async (req: any, res: any, next: any) => {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
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

    app.get('/api/v1/workspaces/:workspaceId/reports/role-dashboard', authMiddleware, async (req, res, next) => {
      try {
        const result = await reportsController.getRoleScopedDashboard(req.params.workspaceId, req);
        res.json(result);
      } catch (e) { next(e); }
    });

    // Error handler
    app.use((err: any, req: any, res: any, next: any) => {
      const status = err.getStatus ? err.getStatus() : err.status || 500;
      res.status(status).json({ message: err.message });
    });
  });

  afterAll(async () => {
    if (workspace?.id) {
      await prisma.node.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.projectMember.deleteMany({ where: { project: { workspaceId: workspace.id } } }).catch(() => null);
      await prisma.project.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
    }
    await prisma.$disconnect();
  });

  it('allows Manager to create a task assigned to User A in normal project, auto-granting limited project membership', async () => {
    const res = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        projectId: normalProject.id,
        nodeTypeId: taskType.id,
        title: 'Initial Architectural Drafting',
        ownerId: assigneeUser.id,
      });

    expect(res.status).toBe(201);
    assignedTaskId = res.body.id;
    expect(res.body.ownerId).toBe(assigneeUser.id);
    expect(res.body.assignedById).toBe(managerUser.id);

    // Verify limited project membership was auto-granted to assigneeUser
    const pm = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: normalProject.id, userId: assigneeUser.id } },
    });
    expect(pm).toBeDefined();
    expect(pm?.userId).toBe(assigneeUser.id);
  });

  it('allows Assignee User A to see the assigned task in their role-dashboard (My Tasks)', async () => {
    const res = await request(app)
      .get(`/api/v1/workspaces/${workspace.id}/reports/role-dashboard`)
      .set('Authorization', `Bearer ${assigneeToken}`);

    expect(res.status).toBe(200);
    const myTasks = res.body?.assigneeWork?.myTasks || [];
    const found = myTasks.find((t: any) => t.id === assignedTaskId);
    expect(found).toBeDefined();
    expect(found.title).toBe('Initial Architectural Drafting');
  });

  it('allows Assignee User A to retrieve the task with work capabilities (can.work: true, can.view: true)', async () => {
    const res = await request(app)
      .get(`/api/v1/nodes/${assignedTaskId}`)
      .set('Authorization', `Bearer ${assigneeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(assignedTaskId);
    expect(res.body.can?.view).toBe(true);
    expect(res.body.can?.work).toBe(true);
  });

  it('allows Assignee User A to create a child subtask under their assigned parent task', async () => {
    const res = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${assigneeToken}`)
      .send({
        projectId: normalProject.id,
        parentNodeId: assignedTaskId,
        nodeTypeId: taskType.id,
        title: 'Draft Subtask: Floor Layout',
        ownerId: assigneeUser.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.parentNodeId).toBe(assignedTaskId);
    expect(res.body.depth).toBe(2);
  });

  it('denies unrelated Other Member from creating a child subtask under Assignee User A task (403)', async () => {
    const res = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${otherMemberToken}`)
      .send({
        projectId: normalProject.id,
        parentNodeId: assignedTaskId,
        nodeTypeId: taskType.id,
        title: 'Unauthorized Child Task by Other Member',
        ownerId: otherMemberUser.id,
      });

    expect(res.status).toBe(403);
  });

  it('denies Unrelated Manager from modifying tasks in a project they are not authorized for (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/nodes/${assignedTaskId}`)
      .set('Authorization', `Bearer ${unrelatedManagerToken}`)
      .send({ title: 'Hijacked by Unrelated Manager' });

    expect(res.status).toBe(403);
  });

  it('denies assigning a non-member to a RESTRICTED project task (Cross-project access denied 403)', async () => {
    const res = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        projectId: restrictedProject.id,
        nodeTypeId: taskType.id,
        title: 'Highly Secret Task',
        ownerId: otherMemberUser.id,
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Cross-project access denied/i);
  });
});
