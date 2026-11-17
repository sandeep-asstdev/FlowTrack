import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, ConfidentialityLevel } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NodesService } from '../nodes/nodes.service';

describe('Manager and Team Leader Approval Requests (Real Database)', () => {
  let prisma: PrismaClient;
  let authService: AuthorizationService;
  let approvalsService: ApprovalsService;
  let nodesService: NodesService;

  let workspace: any;
  let adminUser: any;
  let managerUser: any;
  let teamLeadUser: any;
  let memberUser: any;
  let project: any;
  let statusSet: any;
  let nodeType: any;
  let inProgressStatus: any;
  let draftStatus: any;

  let managerTask: any;
  let teamLeadTask: any;
  let draftTask: any;
  let unassignedTask: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    authService = new AuthorizationService(prisma as any);
    const auditService = new AuditService(prisma as any);
    const notificationsService = new NotificationsService(prisma as any);
    approvalsService = new ApprovalsService(prisma as any, auditService, notificationsService, authService);
    nodesService = new NodesService(prisma as any, null as any, authService);

    const timestamp = Date.now();

    workspace = await prisma.workspace.create({
      data: {
        name: `Approval Workspace ${timestamp}`,
        slug: `approval-ws-${timestamp}`,
      },
    });

    adminUser = await prisma.user.create({
      data: { email: `admin-${timestamp}@test.com`, fullName: 'Arjun Admin', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: adminUser.id, role: Role.ADMIN },
    });

    managerUser = await prisma.user.create({
      data: { email: `manager-${timestamp}@test.com`, fullName: 'Meera Manager', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: managerUser.id, role: Role.MANAGER },
    });

    teamLeadUser = await prisma.user.create({
      data: { email: `lead-${timestamp}@test.com`, fullName: 'Tanvi TeamLead', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: teamLeadUser.id, role: Role.TEAM_LEAD },
    });

    memberUser = await prisma.user.create({
      data: { email: `member-${timestamp}@test.com`, fullName: 'Mohan Member', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: memberUser.id, role: Role.MEMBER },
    });

    statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: `Status Set ${timestamp}`,
        statuses: {
          create: [
            { key: 'draft', category: 'draft', labelI18n: { en: 'Draft' }, displayOrder: 1 },
            { key: 'in_progress', category: 'active', labelI18n: { en: 'In Progress' }, displayOrder: 2 },
            { key: 'done', category: 'done', labelI18n: { en: 'Done' }, displayOrder: 3 },
          ],
        },
      },
      include: { statuses: true },
    });

    draftStatus = statusSet.statuses.find((s: any) => s.key === 'draft');
    inProgressStatus = statusSet.statuses.find((s: any) => s.key === 'in_progress');

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
        name: `Project Alpha ${timestamp}`,
        ownerId: adminUser.id,
        responsibleManagerId: managerUser.id,
        classification: ConfidentialityLevel.INTERNAL,
      },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: managerUser.id, role: Role.MANAGER },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: teamLeadUser.id, role: Role.TEAM_LEAD },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: memberUser.id, role: Role.MEMBER },
    });

    // 1. Manager task: Admin assigns task to Manager, In Progress
    managerTask = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        state: 'In Progress',
        title: 'Manager Milestone Deliverable',
        ownerId: managerUser.id,
        assignedById: adminUser.id,
        approvalStatus: 'not_required',
      },
    });

    // 2. Team Leader task: Admin assigns task to Team Leader, In Progress
    teamLeadTask = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        state: 'In Progress',
        title: 'Team Leader Sprint Task',
        ownerId: teamLeadUser.id,
        assignedById: adminUser.id,
        approvalStatus: 'not_required',
      },
    });

    // 3. Draft task
    draftTask = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        statusId: draftStatus.id,
        state: 'Draft',
        title: 'Draft Unstarted Task',
        ownerId: managerUser.id,
        assignedById: adminUser.id,
        approvalStatus: 'not_required',
      },
    });

    // 4. Unassigned task
    unassignedTask = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        state: 'In Progress',
        title: 'Unassigned Task',
        ownerId: null,
        assignedById: adminUser.id,
        approvalStatus: 'not_required',
      },
    });
  });

  afterAll(async () => {
    await prisma.node.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.projectMember.deleteMany({ where: { project: { workspaceId: workspace.id } } });
    await prisma.project.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.nodeType.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.status.deleteMany({ where: { statusSet: { workspaceId: workspace.id } } });
    await prisma.statusSet.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, managerUser.id, teamLeadUser.id, memberUser.id] } } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.$disconnect();
  });

  it('Manager task approval flow: manager can request approval from workspace Admins', async () => {
    // 1. Server decides can.requestApproval for Manager
    const nodeData = await nodesService.getNode(managerTask.id, managerUser.id, Role.MANAGER);
    expect(nodeData.can.requestApproval).toBe(true);

    // 2. Server returns eligible approvers: only Admins in workspace, excluding Manager
    const approvers = await approvalsService.getEligibleApprovers(workspace.id, {
      taskId: managerTask.id,
      projectId: project.id,
      submitterId: managerUser.id,
    });
    expect(approvers.length).toBeGreaterThan(0);
    expect(approvers.every((a) => a.role === 'ADMIN')).toBe(true);
    expect(approvers.some((a) => a.id === adminUser.id)).toBe(true);
    expect(approvers.some((a) => a.id === managerUser.id)).toBe(false);

    // Non-assignee cannot request approval
    const otherUserNode = await nodesService.getNode(managerTask.id, memberUser.id, Role.MEMBER);
    expect(otherUserNode.can.requestApproval).toBe(false);
  });

  it('Team Leader task approval flow: team leader can request approval from Managers or Admins', async () => {
    // 1. Server decides can.requestApproval for Team Leader
    const nodeData = await nodesService.getNode(teamLeadTask.id, teamLeadUser.id, Role.TEAM_LEAD);
    expect(nodeData.can.requestApproval).toBe(true);

    // 2. Server returns eligible approvers: Managers and Admins, excluding Team Leader themselves
    const approvers = await approvalsService.getEligibleApprovers(workspace.id, {
      taskId: teamLeadTask.id,
      projectId: project.id,
      submitterId: teamLeadUser.id,
    });
    expect(approvers.length).toBeGreaterThanOrEqual(2);
    const approverRoles = approvers.map((a) => a.role);
    expect(approverRoles).toContain('ADMIN');
    expect(approverRoles).toContain('MANAGER');
    expect(approvers.some((a) => a.id === teamLeadUser.id)).toBe(false);
    expect(approvers.some((a) => a.id === memberUser.id)).toBe(false);
  });

  it('Guards: Draft and Unassigned tasks hide card (can.requestApproval is false and eligible approvers are empty)', async () => {
    const draftNode = await nodesService.getNode(draftTask.id, managerUser.id, Role.MANAGER);
    expect(draftNode.can.requestApproval).toBe(false);

    const draftApprovers = await approvalsService.getEligibleApprovers(workspace.id, {
      taskId: draftTask.id,
      projectId: project.id,
      submitterId: managerUser.id,
    });
    expect(draftApprovers).toEqual([]);

    const unassignedApprovers = await approvalsService.getEligibleApprovers(workspace.id, {
      taskId: unassignedTask.id,
      projectId: project.id,
      submitterId: managerUser.id,
    });
    expect(unassignedApprovers).toEqual([]);
  });

  it('Guards: Admins never request approval', async () => {
    const adminNode = await nodesService.getNode(managerTask.id, adminUser.id, Role.ADMIN);
    expect(adminNode.can.requestApproval).toBe(false);

    const adminApprovers = await approvalsService.getEligibleApprovers(workspace.id, {
      taskId: managerTask.id,
      projectId: project.id,
      submitterId: adminUser.id,
    });
    expect(adminApprovers).toEqual([]);
  });
});
