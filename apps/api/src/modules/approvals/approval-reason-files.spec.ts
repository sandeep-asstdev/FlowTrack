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

describe('Approval Request Reason and Files Validation', () => {
  let app: Express;
  let prisma: PrismaClient;
  let jwtService: JwtService;

  let workspace: any;
  let managerUser: any;
  let memberUser: any;
  let project: any;
  let task1: any;
  let task2: any;
  let memberToken: string;
  let managerToken: string;
  let doc1: any;
  let doc2: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    jwtService = new JwtService({ secret: 'reason-files-test-secret' });

    const timestamp = Date.now();
    workspace = await prisma.workspace.create({
      data: { name: `Reason Files WS ${timestamp}`, slug: `reason-files-${timestamp}` },
    });

    managerUser = await prisma.user.create({
      data: { email: `mgr-rf-${timestamp}@test.com`, fullName: 'Deepa Manager', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: managerUser.id, role: Role.MANAGER },
    });

    memberUser = await prisma.user.create({
      data: { email: `mem-rf-${timestamp}@test.com`, fullName: 'Anand Member', isActive: true },
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

    task1 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        state: 'In Progress',
        title: 'Foundation Concrete Pouring',
        ownerId: memberUser.id,
        assignedById: managerUser.id,
        approvalStatus: 'not_required',
      },
    });

    task2 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        state: 'In Progress',
        title: 'Roof Structural Framing',
        ownerId: memberUser.id,
        assignedById: managerUser.id,
        approvalStatus: 'not_required',
      },
    });

    doc1 = await prisma.document.create({
      data: {
        workspaceId: workspace.id,
        nodeId: task2.id,
        uploadedBy: memberUser.id,
        name: 'structural-test-report.pdf',
        mimeType: 'application/pdf',
        fileSize: BigInt(51200),
        storageKey: 'mock/storage/structural-test-report.pdf',
        category: 'evidence',
      },
    });

    doc2 = await prisma.document.create({
      data: {
        workspaceId: workspace.id,
        nodeId: task2.id,
        uploadedBy: memberUser.id,
        name: 'framing-inspection.jpg',
        mimeType: 'image/jpeg',
        fileSize: BigInt(122880),
        storageKey: 'mock/storage/framing-inspection.jpg',
        category: 'evidence',
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
        res.status(err.status || 400).json({ message: err.message });
      }
    });

    app.get('/api/v1/approvals/requests', authMiddleware, async (req, res) => {
      try {
        const result = await approvalsController.listApprovalRequests(req, req.query.workspaceId as string);
        res.status(200).json(result);
      } catch (err: any) {
        res.status(err.status || 500).json({ message: err.message });
      }
    });

    app.get('/api/v1/approvals/requests/:id', authMiddleware, async (req, res) => {
      try {
        const result = await approvalsController.getApprovalRequest(req.params.id, req, req.query.workspaceId as string);
        res.status(200).json(result);
      } catch (err: any) {
        res.status(err.status || 500).json({ message: err.message });
      }
    });

    app.get('/api/v1/nodes/review-queue', authMiddleware, async (req, res) => {
      try {
        const result = await nodesController.getReviewQueue(req, req.query.workspaceId as string);
        res.status(200).json(result);
      } catch (err: any) {
        res.status(err.status || 500).json({ message: err.message });
      }
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.document.deleteMany({ where: { workspaceId: workspace.id } });
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

  it('rejects an empty or 5-character reason with 400 Bad Request', async () => {
    // 1. Empty reason
    const resEmpty = await request(app)
      .post('/api/v1/approvals/requests')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        nodeId: task1.id,
        targetApproverId: managerUser.id,
        chosenApproverId: managerUser.id,
        reason: '   ',
      });

    expect(resEmpty.status).toBe(400);
    expect(resEmpty.body.message).toContain('reason of at least 20 characters is required');

    // 2. 5-character reason
    const resShort = await request(app)
      .post('/api/v1/approvals/requests')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        nodeId: task1.id,
        targetApproverId: managerUser.id,
        chosenApproverId: managerUser.id,
        reason: 'Done!',
      });

    expect(resShort.status).toBe(400);
    expect(resShort.body.message).toContain('reason of at least 20 characters is required');
  });

  it('succeeds for a request with a valid reason and no files', async () => {
    const validReason = 'Concrete curing completed per standard specifications and ready for load bearing.';
    const resValidNoFiles = await request(app)
      .post('/api/v1/approvals/requests')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        nodeId: task1.id,
        targetApproverId: managerUser.id,
        chosenApproverId: managerUser.id,
        reason: validReason,
        fileIds: [],
      });

    expect(resValidNoFiles.status).toBe(201);
    expect(resValidNoFiles.body.id).toBeDefined();
    expect(resValidNoFiles.body.payload.reason).toBe(validReason);
    expect(resValidNoFiles.body.payload.fileIds).toEqual([]);
    expect(resValidNoFiles.body.payload.subject).toBe(task1.title);
  });

  it('saves attached files when provided and allows approver to see the reason and files', async () => {
    const framingReason = 'All structural roof beams installed and verified against civil engineering drawings.';
    const resWithFiles = await request(app)
      .post('/api/v1/approvals/requests')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        nodeId: task2.id,
        targetApproverId: managerUser.id,
        chosenApproverId: managerUser.id,
        reason: framingReason,
        fileIds: [doc1.id, doc2.id],
      });

    expect(resWithFiles.status).toBe(201);
    expect(resWithFiles.body.payload.reason).toBe(framingReason);
    expect(resWithFiles.body.payload.fileIds).toEqual([doc1.id, doc2.id]);

    // Check node customData in DB
    const updatedTask = await prisma.node.findUnique({ where: { id: task2.id } });
    expect((updatedTask?.customData as any)?.approvalReason).toBe(framingReason);
    expect((updatedTask?.customData as any)?.approvalFileIds).toEqual([doc1.id, doc2.id]);

    // Approver gets request details and sees the reason and task title
    const approverReqRes = await request(app)
      .get(`/api/v1/approvals/requests/${resWithFiles.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(approverReqRes.status).toBe(200);
    expect(approverReqRes.body.payload.reason).toBe(framingReason);
    expect(approverReqRes.body.payload.subject).toBe(task2.title);
    expect(approverReqRes.body.payload.fileIds).toEqual([doc1.id, doc2.id]);

    // Approver checks review queue
    const queueRes = await request(app)
      .get('/api/v1/nodes/review-queue')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(queueRes.status).toBe(200);
    const queueItem = queueRes.body.find((item: any) => item.id === task2.id);
    expect(queueItem).toBeDefined();
    expect((queueItem.approvalRequests?.[0]?.payload as any)?.reason).toBe(framingReason);
    expect((queueItem.customData as any)?.approvalReason).toBe(framingReason);
    expect((queueItem.customData as any)?.approvalFileIds).toEqual([doc1.id, doc2.id]);
  });
});
