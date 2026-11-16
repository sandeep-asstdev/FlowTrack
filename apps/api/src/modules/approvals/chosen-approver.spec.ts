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

describe('Single Chosen-Approver Flow (chosen-approver.spec.ts)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let jwtService: JwtService;

  let workspace: any;
  let normalProject: any;
  let restrictedProject: any;
  let taskType: any;
  let statusSet: any;
  let normalTask: any;

  let adminUser: any;
  let managerUser: any;
  let teamLeadUser: any;
  let submitterMemberUser: any;
  let unrelatedMemberUser: any;

  let adminToken: string;
  let managerToken: string;
  let teamLeadToken: string;
  let submitterToken: string;
  let unrelatedMemberToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    jwtService = new JwtService({ secret: 'chosen-approver-secret-key' });

    const timestamp = Date.now();

    // 1. Create Workspace
    workspace = await prisma.workspace.create({
      data: {
        name: `Chosen Approver Workspace ${timestamp}`,
        slug: `chosen-appr-ws-${timestamp}`,
      },
    });

    // 2. Create Users & Memberships
    adminUser = await prisma.user.create({
      data: { email: `admin-${timestamp}@flowtrack.test`, fullName: 'Aditi Admin', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: adminUser.id, role: Role.ADMIN },
    });

    managerUser = await prisma.user.create({
      data: { email: `manager-${timestamp}@flowtrack.test`, fullName: 'Manoj Manager', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: managerUser.id, role: Role.MANAGER },
    });

    teamLeadUser = await prisma.user.create({
      data: { email: `lead-${timestamp}@flowtrack.test`, fullName: 'Lata Lead', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: teamLeadUser.id, role: Role.TEAM_LEAD },
    });

    submitterMemberUser = await prisma.user.create({
      data: { email: `submitter-${timestamp}@flowtrack.test`, fullName: 'Suresh Submitter', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: submitterMemberUser.id, role: Role.MEMBER },
    });

    unrelatedMemberUser = await prisma.user.create({
      data: { email: `member-${timestamp}@flowtrack.test`, fullName: 'Mukesh Member', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: unrelatedMemberUser.id, role: Role.MEMBER },
    });

    // 3. Issue Tokens
    adminToken = jwtService.sign({ sub: adminUser.id, role: Role.ADMIN, activeWorkspaceId: workspace.id });
    managerToken = jwtService.sign({ sub: managerUser.id, role: Role.MANAGER, activeWorkspaceId: workspace.id });
    teamLeadToken = jwtService.sign({ sub: teamLeadUser.id, role: Role.TEAM_LEAD, activeWorkspaceId: workspace.id });
    submitterToken = jwtService.sign({ sub: submitterMemberUser.id, role: Role.MEMBER, activeWorkspaceId: workspace.id });
    unrelatedMemberToken = jwtService.sign({ sub: unrelatedMemberUser.id, role: Role.MEMBER, activeWorkspaceId: workspace.id });

    // 4. StatusSet and NodeType
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

    taskType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Task',
        key: 'task',
        defaultStatusSetId: statusSet.id,
      },
    });

    // 5. Projects
    normalProject = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Project Apollo ${timestamp}`,
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        classification: ConfidentialityLevel.INTERNAL,
      },
    });
    await prisma.projectMember.create({
      data: { projectId: normalProject.id, userId: managerUser.id, role: Role.MANAGER },
    });

    restrictedProject = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Restricted Stealth ${timestamp}`,
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        classification: ConfidentialityLevel.RESTRICTED,
      },
    });
    await prisma.projectMember.create({
      data: { projectId: restrictedProject.id, userId: managerUser.id, role: Role.MANAGER },
    });

    // 6. Normal Task assigned to submitterMemberUser
    normalTask = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: normalProject.id,
        nodeTypeId: taskType.id,
        title: 'Backend Database Design',
        ownerId: submitterMemberUser.id,
        assignedById: managerUser.id,
        approvalStatus: 'not_required',
      },
    });

    // 7. Express & Services Wiring
    const auditService = new AuditService(prisma as any);
    const notificationsService = new NotificationsService(prisma as any);
    const authService = new AuthorizationService(prisma as any);
    const approvalsService = new ApprovalsService(
      prisma as any,
      auditService,
      notificationsService,
      authService
    );
    const approvalsController = new ApprovalsController(approvalsService);

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

    app.post('/api/v1/approvals/requests/:id/decide', authMiddleware, async (req, res, next) => {
      try {
        const result = await approvalsController.submitDecision(req.params.id, req, req.body, req.query.workspaceId as string);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.post('/api/v1/approvals/decide', authMiddleware, async (req, res, next) => {
      try {
        const result = await approvalsController.decide(req, req.body, req.query.workspaceId as string);
        res.json(result);
      } catch (e) { next(e); }
    });

    app.use((err: any, req: any, res: any, next: any) => {
      const status = err.getStatus ? err.getStatus() : err.status || 500;
      res.status(status).json({ message: err.message });
    });
  });

  afterAll(async () => {
    if (workspace?.id) {
      await prisma.approvalRequest.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.node.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.projectMember.deleteMany({ where: { project: { workspaceId: workspace.id } } }).catch(() => null);
      await prisma.project.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
    }
    await prisma.$disconnect();
  });

  describe('1. Eligible Approvers Query (Permission Matrix & Separation of Duties)', () => {
    it('returns eligible approvers for the task (Admin, Manager, Team Lead) and excludes the submitter/assignee', async () => {
      const res = await request(app)
        .get(`/api/v1/approvals/eligible-approvers?taskId=${normalTask.id}`)
        .set('Authorization', `Bearer ${submitterToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const approverIds = res.body.map((u: any) => u.id);
      // Must include manager and admin
      expect(approverIds).toContain(managerUser.id);
      expect(approverIds).toContain(adminUser.id);
      // Separation of duties: MUST NOT include the task assignee / submitter
      expect(approverIds).not.toContain(submitterMemberUser.id);
      // Must NOT include unrelated member without APPROVE_TASK permission
      expect(approverIds).not.toContain(unrelatedMemberUser.id);
    });
  });

  describe('2. Creating Single Chosen-Approver Request', () => {
    let createdRequestId: string;

    it('creates an approval request for the chosen manager and updates task status to pending', async () => {
      const res = await request(app)
        .post('/api/v1/approvals/requests')
        .set('Authorization', `Bearer ${submitterToken}`)
        .send({
          nodeId: normalTask.id,
          chosenApproverId: managerUser.id,
          payload: { notes: 'Completed schemas and migrations' },
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.stageInstances).toHaveLength(1);
      expect(res.body.stageInstances[0].primaryApproverId).toBe(managerUser.id);
      createdRequestId = res.body.id;

      // Verify task in DB updated
      const dbTask = await prisma.node.findUnique({ where: { id: normalTask.id } });
      expect(dbTask?.approvalStatus).toBe('pending');
      expect(dbTask?.reviewerId).toBe(managerUser.id);
      expect(dbTask?.submitterId).toBe(submitterMemberUser.id);
    });

    it('rejects attempt if submitter tries to select themselves as the chosen approver (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/approvals/requests')
        .set('Authorization', `Bearer ${submitterToken}`)
        .send({
          nodeId: normalTask.id,
          chosenApproverId: submitterMemberUser.id,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Separation of duties/i);
    });

    it('rejects attempt if submitter selects an ineligible member without APPROVE_TASK permission (403)', async () => {
      const res = await request(app)
        .post('/api/v1/approvals/requests')
        .set('Authorization', `Bearer ${submitterToken}`)
        .send({
          nodeId: normalTask.id,
          chosenApproverId: unrelatedMemberUser.id,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/(not an authorized eligible approver|Members can only request approval)/i);
    });

    it('rejects unauthorized third party from approving the request (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/approvals/requests/${createdRequestId}/decide`)
        .set('Authorization', `Bearer ${unrelatedMemberToken}`)
        .send({
          decision: 'Approved',
          comment: 'Illegitimate third-party approval attempt',
        });

      expect(res.status).toBe(403);
    });

    it('rejects submitter from approving their own request (Self-approval blocked 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/approvals/requests/${createdRequestId}/decide`)
        .set('Authorization', `Bearer ${submitterToken}`)
        .send({
          decision: 'Approved',
          comment: 'Self-approval attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Self-approval is forbidden/i);
    });

    it('allows the chosen manager to approve the request, updating request and task to Approved', async () => {
      const res = await request(app)
        .post(`/api/v1/approvals/requests/${createdRequestId}/decide`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          decision: 'Approved',
          comment: 'Database design looks solid and compliant.',
        });

      expect(res.status).toBe(200);
      expect(res.body.requestStatus).toBe('APPROVED');

      // Verify node approvalStatus updated to approved in DB
      const dbTask = await prisma.node.findUnique({ where: { id: normalTask.id } });
      expect(dbTask?.approvalStatus).toBe('approved');
    });
  });
});
