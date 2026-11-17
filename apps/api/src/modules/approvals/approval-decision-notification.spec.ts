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
import { NodesController } from '../nodes/nodes.controller';

describe('Approval Decision Notification Integration', () => {
  let app: Express;
  let prisma: PrismaClient;
  let jwtService: JwtService;

  let workspace: any;
  let managerUser: any;
  let memberUser: any;
  let project: any;
  let task: any;
  let memberToken: string;
  let managerToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    jwtService = new JwtService({ secret: 'decision-notification-secret' });

    const timestamp = Date.now();
    workspace = await prisma.workspace.create({
      data: { name: `Decision Test WS ${timestamp}`, slug: `decision-${timestamp}` },
    });

    managerUser = await prisma.user.create({
      data: { email: `ravi-mgr-${timestamp}@test.com`, fullName: 'Ravi Manager', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: managerUser.id, role: Role.MANAGER },
    });

    memberUser = await prisma.user.create({
      data: { email: `suresh-mem-${timestamp}@test.com`, fullName: 'Suresh Member', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: memberUser.id, role: Role.MEMBER },
    });

    memberToken = jwtService.sign({ sub: memberUser.id, role: Role.MEMBER, activeWorkspaceId: workspace.id });
    managerToken = jwtService.sign({ sub: managerUser.id, role: Role.MANAGER, activeWorkspaceId: workspace.id });

    const statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: `Status Set ${timestamp}`,
        statuses: {
          create: [
            { key: 'in_progress', category: 'active', labelI18n: { en: 'In Progress' }, displayOrder: 1 },
            { key: 'done', category: 'done', labelI18n: { en: 'Done' }, displayOrder: 2 },
          ],
        },
      },
      include: { statuses: true },
    });

    const nodeType = await prisma.nodeType.create({
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
        name: `Project ${timestamp}`,
        ownerId: managerUser.id,
        classification: ConfidentialityLevel.INTERNAL,
      },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: managerUser.id, role: Role.MANAGER },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: memberUser.id, role: Role.MEMBER },
    });

    task = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        state: 'In Progress',
        title: 'Drafting Architecture Specs',
        ownerId: memberUser.id,
        assignedById: managerUser.id,
        approvalStatus: 'not_required',
      },
    });

    const auditService = new AuditService(prisma as any);
    const notificationsService = new NotificationsService(prisma as any);
    const authService = new AuthorizationService(prisma as any);
    const approvalsService = new ApprovalsService(prisma as any, auditService, notificationsService, authService);
    const nodesService = new NodesService(prisma as any, auditService, notificationsService, undefined, authService);

    const approvalsController = new ApprovalsController(approvalsService);
    const nodesController = new NodesController(nodesService);

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

    app.post('/api/v1/approvals/requests', authMiddleware, async (req, res) => {
      try {
        const result = await approvalsController.createApprovalRequest(req, req.body, req.query.workspaceId as string);
        res.status(201).json(result);
      } catch (err: any) {
        res.status(err.status || 500).json({ message: err.message });
      }
    });

    app.post('/api/v1/nodes/:id/approve', authMiddleware, async (req, res) => {
      try {
        const result = await nodesController.approve(req, req.params.id, req.body);
        res.status(200).json(result);
      } catch (err: any) {
        res.status(err.status || 500).json({ message: err.message });
      }
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.taskApproval.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.approvalRequest.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.node.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.projectMember.deleteMany({ where: { project: { workspaceId: workspace.id } } });
    await prisma.project.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.nodeType.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.status.deleteMany({ where: { statusSet: { workspaceId: workspace.id } } });
    await prisma.statusSet.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.user.deleteMany({ where: { id: { in: [managerUser.id, memberUser.id] } } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.$disconnect();
  });

  it('requester gets exactly one notification with decider name, decision, and feedback', async () => {
    // 1. Member asks Manager for approval
    const reqRes = await request(app)
      .post('/api/v1/approvals/requests')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        nodeId: task.id,
        chosenApproverId: managerUser.id,
        payload: { notes: 'Ready for architecture review' },
      });

    expect(reqRes.status).toBe(201);

    // 2. Manager approves with feedback
    const approveRes = await request(app)
      .post(`/api/v1/nodes/${task.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        decision: 'approved',
        feedback: 'Looks good to proceed with implementation.',
      });

    expect(approveRes.status).toBe(200);

    // 3. Verify requester receives exactly one notification
    const requesterNotifications = await prisma.notification.findMany({
      where: {
        workspaceId: workspace.id,
        userId: memberUser.id,
      },
    });

    expect(requesterNotifications).toHaveLength(1);

    const notif = requesterNotifications[0];
    expect(notif.type).toBe('APPROVAL_DECISION');
    expect(notif.title).toBe('Ravi Manager approved your request for "Drafting Architecture Specs"');
    expect(notif.body).toBe(
      'Ravi Manager approved your request for "Drafting Architecture Specs". Reason: Looks good to proceed with implementation.'
    );

    // 4. Verify task state and approval status are updated
    const updatedTask = await prisma.node.findUnique({ where: { id: task.id } });
    expect(updatedTask?.state).toBe('Approved');
    expect(updatedTask?.approvalStatus).toBe('approved');
  });
});
