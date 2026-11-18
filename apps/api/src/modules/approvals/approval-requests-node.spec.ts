import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { PrismaClient, Role, ConfidentialityLevel } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NodesService } from '../nodes/nodes.service';

describe('GET /api/v1/approvals/requests?nodeId=... (Real Database)', () => {
  let app: Express;
  let prisma: PrismaClient;

  let workspace: any;
  let otherWorkspace: any;
  let project: any;
  let nodeType: any;
  let statusSet: any;
  let inProgressStatus: any;
  let policy: any;

  let adminUser: any;
  let managerUser: any;
  let memberUser: any;
  let unauthorizedUser: any;

  let taskNoApprovals: any;
  let taskWithPendingApproval: any;
  let pendingApprovalRequest: any;

  let approvalsController: ApprovalsController;
  let approvalsService: ApprovalsService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const auditService = new AuditService(prisma as any);
    const notificationsService = new NotificationsService(prisma as any);
    const authService = new AuthorizationService(prisma as any);
    const nodesService = new NodesService(prisma as any, null as any, authService);
    approvalsService = new ApprovalsService(prisma as any, auditService, notificationsService, authService, nodesService);
    approvalsController = new ApprovalsController(approvalsService);

    const timestamp = Date.now();

    workspace = await prisma.workspace.create({
      data: {
        name: `Approval Requests WS ${timestamp}`,
        slug: `app-req-ws-${timestamp}`,
      },
    });

    otherWorkspace = await prisma.workspace.create({
      data: {
        name: `Other WS ${timestamp}`,
        slug: `other-ws-${timestamp}`,
      },
    });

    adminUser = await prisma.user.create({
      data: { email: `admin-${timestamp}@test.com`, fullName: 'Admin User', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: adminUser.id, role: Role.ADMIN },
    });

    managerUser = await prisma.user.create({
      data: { email: `manager-${timestamp}@test.com`, fullName: 'Manager User', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: managerUser.id, role: Role.MANAGER },
    });

    memberUser = await prisma.user.create({
      data: { email: `member-${timestamp}@test.com`, fullName: 'Member User', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: memberUser.id, role: Role.MEMBER },
    });

    unauthorizedUser = await prisma.user.create({
      data: { email: `unauth-${timestamp}@test.com`, fullName: 'Unauthorized User', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: otherWorkspace.id, userId: unauthorizedUser.id, role: Role.MEMBER },
    });

    statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: `StatusSet ${timestamp}`,
        statuses: {
          create: [
            { key: 'in_progress', category: 'active', labelI18n: { en: 'In Progress' }, displayOrder: 1 },
          ],
        },
      },
      include: { statuses: true },
    });
    inProgressStatus = statusSet.statuses[0];

    nodeType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Task',
        key: 'task',
        defaultStatusSetId: statusSet.id,
      },
    });

    project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Approvals Project ${timestamp}`,
        ownerId: adminUser.id,
        responsibleManagerId: managerUser.id,
        classification: ConfidentialityLevel.INTERNAL,
      },
    });

    policy = await approvalsService.createPolicy(workspace.id, adminUser.id, {
      name: `Default Policy ${timestamp}`,
      operationType: 'TASK_COMPLETION',
      stages: [
        {
          stageOrder: 1,
          name: 'Sign Off',
          mode: 'SEQUENTIAL',
          rule: 'ANY_ONE_APPROVES',
          roles: ['MANAGER'],
        },
      ],
    });

    // Task 1: No approvals
    taskNoApprovals = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Task With No Approvals',
        ownerId: memberUser.id,
      },
    });

    // Task 2: With one pending approval
    taskWithPendingApproval = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Task With Pending Approval',
        ownerId: memberUser.id,
        approvalStatus: 'pending',
      },
    });

    pendingApprovalRequest = await prisma.approvalRequest.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeId: taskWithPendingApproval.id,
        policyId: policy.id,
        policyVersion: 1,
        submitterId: memberUser.id,
        status: 'PENDING',
        payload: {
          subject: 'Review request for task',
          reason: 'Work completed and ready for verification',
        },
        stageInstances: {
          create: [
            {
              stageOrder: 1,
              name: 'Sign Off',
              mode: 'SEQUENTIAL',
              rule: 'ANY_ONE_APPROVES',
              status: 'PENDING',
              primaryApproverId: managerUser.id,
            },
          ],
        },
      },
      include: { stageInstances: true },
    });

    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      const userHeader = req.headers['x-test-user'] as string;
      if (userHeader === 'admin') req.user = { id: adminUser.id, role: 'ADMIN', activeWorkspaceId: workspace.id };
      else if (userHeader === 'manager') req.user = { id: managerUser.id, role: 'MANAGER', activeWorkspaceId: workspace.id };
      else if (userHeader === 'member') req.user = { id: memberUser.id, role: 'MEMBER', activeWorkspaceId: workspace.id };
      else if (userHeader === 'unauthorized') req.user = { id: unauthorizedUser.id, role: 'MEMBER', activeWorkspaceId: otherWorkspace.id };
      next();
    });

    app.get('/api/v1/approvals/requests', async (req, res) => {
      try {
        const result = await approvalsController.listApprovalRequests(
          req,
          req.query.workspaceId as string,
          req.query.status as string,
          req.query.nodeId as string,
          req.query.projectId as string
        );
        res.status(200).json(result);
      } catch (err: any) {
        res.status(err.status || err.statusCode || 500).json({
          message: err.message,
          errorId: (err.response as any)?.errorId || err.errorId,
        });
      }
    });
  });

  afterAll(async () => {
    await prisma.approvalStageInstance.deleteMany({ where: { approvalRequest: { workspaceId: workspace.id } } });
    await prisma.approvalRequest.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.approvalPolicy.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.node.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.project.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.nodeType.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.status.deleteMany({ where: { statusSet: { workspaceId: workspace.id } } });
    await prisma.statusSet.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.membership.deleteMany({ where: { workspaceId: { in: [workspace.id, otherWorkspace.id] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUser.id, managerUser.id, memberUser.id, unauthorizedUser.id] } },
    });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, otherWorkspace.id] } } });
    await prisma.$disconnect();
  });

  it('a task with no approvals returns an empty list, never 500 (Manager, Member, Admin)', async () => {
    // 1. As Admin
    const resAdmin = await request(app)
      .get(`/api/v1/approvals/requests?nodeId=${taskNoApprovals.id}&status=PENDING&workspaceId=${workspace.id}`)
      .set('x-test-user', 'admin');
    expect(resAdmin.status).toBe(200);
    expect(Array.isArray(resAdmin.body)).toBe(true);
    expect(resAdmin.body).toHaveLength(0);

    // 2. As Manager
    const resMgr = await request(app)
      .get(`/api/v1/approvals/requests?nodeId=${taskNoApprovals.id}&status=PENDING&workspaceId=${workspace.id}`)
      .set('x-test-user', 'manager');
    expect(resMgr.status).toBe(200);
    expect(Array.isArray(resMgr.body)).toBe(true);
    expect(resMgr.body).toHaveLength(0);

    // 3. As Member (task owner)
    const resMember = await request(app)
      .get(`/api/v1/approvals/requests?nodeId=${taskNoApprovals.id}&status=PENDING&workspaceId=${workspace.id}`)
      .set('x-test-user', 'member');
    expect(resMember.status).toBe(200);
    expect(Array.isArray(resMember.body)).toBe(true);
    expect(resMember.body).toHaveLength(0);
  });

  it('a task with one pending approval returns the approval request item', async () => {
    const res = await request(app)
      .get(`/api/v1/approvals/requests?nodeId=${taskWithPendingApproval.id}&status=PENDING&workspaceId=${workspace.id}`)
      .set('x-test-user', 'manager');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(pendingApprovalRequest.id);
    expect(res.body[0].status).toBe('PENDING');
  });

  it('a user without access gets 404, not 500', async () => {
    const res = await request(app)
      .get(`/api/v1/approvals/requests?nodeId=${taskNoApprovals.id}&status=PENDING&workspaceId=${workspace.id}`)
      .set('x-test-user', 'unauthorized');
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('not found');
  });

  it('unexpected errors return a safe message with an error ID', async () => {
    // Call with an invalid prisma state or cause an internal exception
    const originalFindMany = prisma.approvalRequest.findMany;
    (prisma.approvalRequest as any).findMany = () => {
      throw new Error('Database connection reset unexpectedly');
    };

    try {
      const res = await request(app)
        .get(`/api/v1/approvals/requests?nodeId=${taskNoApprovals.id}&status=PENDING&workspaceId=${workspace.id}`)
        .set('x-test-user', 'manager');
      expect(res.status).toBe(500);
      expect(res.body.errorId).toBeDefined();
      expect(res.body.errorId).toMatch(/^ERR-APPV-/);
      expect(res.body.message).toBe('An unexpected error occurred. Please try again later.');
    } finally {
      prisma.approvalRequest.findMany = originalFindMany;
    }
  });
});
