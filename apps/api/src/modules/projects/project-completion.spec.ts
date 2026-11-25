import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { NodesService } from '../nodes/nodes.service';
import { EdgesService } from '../edges/edges.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('Complete Project Action & Lifecycle (Real Database)', () => {
  let prisma: PrismaClient;
  let projectsService: ProjectsService;
  let nodesService: NodesService;
  let edgesService: EdgesService;
  let approvalsService: ApprovalsService;
  let auditService: AuditService;

  let workspace: any;
  let adminUser: any;
  let managerUser: any;
  let memberUser: any;
  let nodeType: any;
  let statusSet: any;
  let activeStatus: any;
  let doneStatus: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const auditService = new AuditService(prisma as any);
    const notificationsService = new NotificationsService(prisma as any);
    const authService = new AuthorizationService(prisma as any);
    const mockGateway = { broadcastToProject: () => null, broadcastToNode: () => null };
    nodesService = new NodesService(prisma as any, auditService, notificationsService, mockGateway as any, authService);
    edgesService = new EdgesService(prisma as any);
    approvalsService = new ApprovalsService(prisma as any, auditService, notificationsService, authService, nodesService);
    projectsService = new ProjectsService(prisma as any, authService, auditService);

    const ts = Date.now();

    workspace = await prisma.workspace.create({
      data: {
        name: `WS-Complete-${ts}`,
        slug: `ws-complete-${ts}`,
      },
    });

    adminUser = await prisma.user.create({
      data: {
        email: `admin-${ts}@test.com`,
        fullName: 'Admin User',
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: adminUser.id,
        role: Role.ADMIN,
      },
    });

    managerUser = await prisma.user.create({
      data: {
        email: `manager-${ts}@test.com`,
        fullName: 'Manager User',
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: managerUser.id,
        role: Role.MANAGER,
      },
    });

    memberUser = await prisma.user.create({
      data: {
        email: `member-${ts}@test.com`,
        fullName: 'Member User',
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: memberUser.id,
        role: Role.MEMBER,
      },
    });

    statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: `StatusSet-${ts}`,
      },
    });

    activeStatus = await prisma.status.create({
      data: {
        statusSetId: statusSet.id,
        key: 'in_progress',
        category: 'active',
      },
    });

    doneStatus = await prisma.status.create({
      data: {
        statusSetId: statusSet.id,
        key: 'done',
        category: 'done',
      },
    });

    nodeType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        key: 'task',
        name: 'Task',
        defaultStatusSetId: statusSet.id,
      },
    });
  });

  afterAll(async () => {
    if (workspace?.id) {
      await prisma.project.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
    }
    await prisma.$disconnect();
  });

  it('completing with open tasks is refused and lists them', async () => {
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'Project With Open Tasks',
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        status: 'ACTIVE',
      },
    });

    const openTask = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        title: 'Unfinished Inspection Task',
        statusId: activeStatus.id,
        state: 'In Progress',
      },
    });

    await expect(
      projectsService.completeProject(project.id, workspace.id, managerUser.id, 'MANAGER')
    ).rejects.toThrow(BadRequestException);

    try {
      await projectsService.completeProject(project.id, workspace.id, managerUser.id, 'MANAGER');
      expect.unreachable('Should have failed');
    } catch (err: any) {
      expect(err.message).toContain('Unfinished Inspection Task');
      expect(err.message).toContain('open tasks');
    }
  });

  it('completing when all is done works and creates audit event', async () => {
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'Ready Project',
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        status: 'ACTIVE',
      },
    });

    await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        title: 'Completed Task 1',
        statusId: doneStatus.id,
        state: 'Completed',
      },
    });

    const result = await projectsService.completeProject(project.id, workspace.id, managerUser.id, 'MANAGER');
    expect(result.status).toBe('COMPLETED');
    expect(result.can.completeProject).toBe(false);

    const reloaded = await prisma.project.findUnique({ where: { id: project.id } });
    expect(reloaded?.status).toBe('COMPLETED');

    const auditEvent = await prisma.auditLog.findFirst({
      where: {
        projectId: project.id,
        action: 'STATUS_CHANGE',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditEvent).toBeDefined();
    expect((auditEvent?.newValues as any)?.status).toBe('COMPLETED');
    expect(auditEvent?.actorId).toBe(managerUser.id);
  });

  it('a Member cannot complete a project (403 Forbidden)', async () => {
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'Member Attempt Project',
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        status: 'ACTIVE',
      },
    });

    await expect(
      projectsService.completeProject(project.id, workspace.id, memberUser.id, 'MEMBER')
    ).rejects.toThrow(ForbiddenException);
  });

  it('a completed project rejects edits (nodes, edges, approvals)', async () => {
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'Completed Immutable Project',
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        status: 'COMPLETED',
      },
    });

    const task1 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        title: 'Completed Immutable Task 1',
        statusId: doneStatus.id,
        state: 'Completed',
      },
    });

    const task2 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        title: 'Completed Immutable Task 2',
        statusId: doneStatus.id,
        state: 'Completed',
      },
    });

    // 1. Rejects project update
    await expect(
      projectsService.updateProject(project.id, workspace.id, { name: 'Renamed Project' }, managerUser.id, 'MANAGER')
    ).rejects.toThrow(ForbiddenException);

    // 2. Rejects task creation
    await expect(
      nodesService.createNode(workspace.id, {
        projectId: project.id,
        nodeTypeId: nodeType.id,
        title: 'New Forbidden Task',
      }, managerUser.id)
    ).rejects.toThrow(ForbiddenException);

    // 3. Rejects task update
    await expect(
      nodesService.updateNode(task1.id, { title: 'Modified Task Title' }, managerUser.id)
    ).rejects.toThrow(ForbiddenException);

    // 4. Rejects edge creation
    await expect(
      edgesService.createEdge(workspace.id, {
        projectId: project.id,
        sourceNodeId: task1.id,
        targetNodeId: task2.id,
      }, managerUser.id, 'MANAGER')
    ).rejects.toThrow(ForbiddenException);

    // 5. Rejects approval creation
    await expect(
      approvalsService.createApprovalRequest(workspace.id, memberUser.id, {
        projectId: project.id,
        nodeId: task1.id,
        reason: 'This is an approval reason that has more than 20 characters for testing.',
        policyId: 'dummy-policy',
      } as any)
    ).rejects.toThrow(ForbiddenException);

    // 6. Member comment rejected
    await expect(
      nodesService.addRemark(task1.id, memberUser.id, 'Member comment')
    ).rejects.toThrow(ForbiddenException);

    // 7. Admin comment allowed
    const adminRemark = await nodesService.addRemark(task1.id, adminUser.id, 'Admin official remark on completed project');
    expect(adminRemark.id).toBeDefined();
    expect(adminRemark.body).toBe('Admin official remark on completed project');
  });

  it('the Admin can reopen with reason, non-admin cannot reopen, and audit logs it', async () => {
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'Project To Reopen',
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
        status: 'COMPLETED',
      },
    });

    // 1. Reopening without reason is rejected
    await expect(
      projectsService.reopenProject(project.id, workspace.id, adminUser.id, 'ADMIN', { reason: '' })
    ).rejects.toThrow(BadRequestException);

    // 2. Non-admin reopening is rejected
    await expect(
      projectsService.reopenProject(project.id, workspace.id, managerUser.id, 'MANAGER', { reason: 'Manager attempt' })
    ).rejects.toThrow(ForbiddenException);

    // 3. Admin reopening with reason succeeds
    const reopened = await projectsService.reopenProject(project.id, workspace.id, adminUser.id, 'ADMIN', {
      reason: 'Client requested supplemental scope and post-audit review.',
    });
    expect(reopened.status).toBe('ACTIVE');
    expect(reopened.can.completeProject).toBe(true);

    const reloaded = await prisma.project.findUnique({ where: { id: project.id } });
    expect(reloaded?.status).toBe('ACTIVE');

    // 4. Audit event logged
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        projectId: project.id,
        action: 'STATUS_CHANGE',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditLog).toBeDefined();
    expect((auditLog?.newValues as any)?.status).toBe('ACTIVE');
    expect((auditLog?.newValues as any)?.reason).toBe('Client requested supplemental scope and post-audit review.');
  });
});
