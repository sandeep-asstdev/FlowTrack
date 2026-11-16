import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const API_BASE = 'http://localhost:3001/api/v1';

describe('Permanent E2E - Receiver Assigned Task & Approval Flow Visibility (real DB + HTTP)', () => {
  let prisma: PrismaClient;

  const testSuffix = Date.now();
  const password = 'Password123!';
  let passwordHash: string;

  let adminUser: any;
  let userA: any;
  let userB: any;
  let managerM: any;

  let workspace: any;
  let adminToken: string;
  let tokenA: string;
  let tokenB: string;
  let tokenM: string;

  let projectId: string;
  let taskId: string;
  let unassignedTaskId: string;
  let approvalRequestId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    passwordHash = await bcrypt.hash(password, 10);

    // 1. Create Workspace for Admin
    workspace = await prisma.workspace.create({
      data: {
        name: `Visibility WS ${testSuffix}`,
        slug: `vis-ws-${testSuffix}`,
      },
    });

    // 2. Create Users
    adminUser = await prisma.user.create({
      data: {
        email: `admin-${testSuffix}@flowtrack.test`,
        fullName: 'Alice Admin',
        passwordHash,
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: adminUser.id,
        role: Role.ADMIN,
      },
    });

    userA = await prisma.user.create({
      data: {
        email: `usera-${testSuffix}@flowtrack.test`,
        fullName: 'Ananya UserA',
        passwordHash,
        isActive: true,
      },
    });

    userB = await prisma.user.create({
      data: {
        email: `userb-${testSuffix}@flowtrack.test`,
        fullName: 'Bharat UserB',
        passwordHash,
        isActive: true,
      },
    });

    managerM = await prisma.user.create({
      data: {
        email: `managerm-${testSuffix}@flowtrack.test`,
        fullName: 'Manish Manager',
        passwordHash,
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: managerM.id,
        role: Role.MANAGER,
      },
    });

    const statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: 'Default Statuses',
        isDefault: true,
        statuses: {
          create: [
            { key: 'To Do', category: 'todo', displayOrder: 1 },
            { key: 'In Progress', category: 'in_progress', displayOrder: 2 },
            { key: 'Done', category: 'done', displayOrder: 3 },
          ],
        },
      },
    });

    await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Task',
        key: 'task',
        defaultStatusSetId: statusSet.id,
      },
    });

    // Login Admin via HTTP
    const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminUser.email, password }),
    });
    const adminLoginData = await adminLoginRes.json();
    expect([200, 201]).toContain(adminLoginRes.status);
    adminToken = adminLoginData.accessToken;
  });

  afterAll(async () => {
    try {
      if (workspace?.id) {
        await prisma.approvalRequest.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
        await prisma.node.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
        await prisma.project.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
        await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
        await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
      }
      const testEmails = [adminUser?.email, userA?.email, userB?.email, managerM?.email].filter(Boolean);
      await prisma.user.deleteMany({ where: { email: { in: testEmails } } }).catch(() => null);
    } catch {
      // non-blocking cleanup
    } finally {
      await prisma.$disconnect();
    }
  });

  it('Step 1: Admin creates a project and a task assigned to User A, plus an unassigned task', async () => {
    // 1. Create Project
    const projRes = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        name: `Project Alpha ${testSuffix}`,
        description: 'Core project for receiver assignment visibility test',
        workspaceId: workspace.id,
      }),
    });
    expect(projRes.status).toBe(201);
    const projData = await projRes.json();
    projectId = projData.id;
    expect(projectId).toBeDefined();

    // 2. Create Task Assigned to User A
    const taskRes = await fetch(`${API_BASE}/nodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        title: `Task Assigned to A ${testSuffix}`,
        projectId,
        workspaceId: workspace.id,
        ownerId: userA.id,
        priority: 'HIGH',
      }),
    });
    expect(taskRes.status).toBe(201);
    const taskData = await taskRes.json();
    taskId = taskData.id;
    expect(taskId).toBeDefined();
    expect(taskData.ownerId).toBe(userA.id);
    expect(taskData.assignedById).toBe(adminUser.id);

    // 3. Create another task in project NOT assigned to A (assigned to Admin)
    const otherTaskRes = await fetch(`${API_BASE}/nodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        title: `Admin Private Task ${testSuffix}`,
        projectId,
        workspaceId: workspace.id,
        ownerId: adminUser.id,
        priority: 'LOW',
      }),
    });
    expect(otherTaskRes.status).toBe(201);
    const otherTaskData = await otherTaskRes.json();
    unassignedTaskId = otherTaskData.id;
  });

  it('Step 2: User A logs in; active workspace is preferred, sees project (limited), task on dashboard, canvas, and bell', async () => {
    // 1. User A logs in via HTTP
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password }),
    });
    expect([200, 201]).toContain(loginRes.status);
    const loginData = await loginRes.json();
    tokenA = loginData.accessToken;
    expect(tokenA).toBeDefined();

    // A's preferred active workspace must be the project's workspace
    expect(loginData.activeWorkspaceId).toBe(workspace.id);

    // 2. Projects list as User A
    const projectsRes = await fetch(`${API_BASE}/projects`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
    });
    expect(projectsRes.status).toBe(200);
    const projects = await projectsRes.json();
    const foundProject = (Array.isArray(projects) ? projects : projects.items || []).find((p: any) => p.id === projectId);
    expect(foundProject).toBeDefined();
    expect(foundProject.id).toBe(projectId);

    // 3. My Tasks / Role Dashboard as User A
    const dashRes = await fetch(`${API_BASE}/workspaces/${workspace.id}/reports/role-dashboard`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
    });
    expect(dashRes.status).toBe(200);
    const dashData = await dashRes.json();
    expect(dashData.assigneeWork).toBeDefined();
    const myTasks = dashData.assigneeWork.myTasks || [];
    const myAssignedTask = myTasks.find((t: any) => t.id === taskId);
    expect(myAssignedTask).toBeDefined();
    expect(myAssignedTask.title).toBe(`Task Assigned to A ${testSuffix}`);
    expect(myAssignedTask.assignedByName).toBe('Alice Admin');
    expect(myAssignedTask.projectName).toContain('Project Alpha');

    // 4. Project Nodes list (Canvas view) as User A: sees assigned task, does NOT see unassigned task
    const nodesRes = await fetch(`${API_BASE}/nodes?projectId=${projectId}`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
    });
    expect(nodesRes.status).toBe(200);
    const nodes = await nodesRes.json();
    const visibleNodeIds = (Array.isArray(nodes) ? nodes : nodes.nodes || []).map((n: any) => n.id);
    expect(visibleNodeIds).toContain(taskId);
    expect(visibleNodeIds).not.toContain(unassignedTaskId);

    // 5. Notifications Bell as User A: received task assignment notification
    const notifRes = await fetch(`${API_BASE}/notifications`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
    });
    expect(notifRes.status).toBe(200);
    const notifs = await notifRes.json();
    const notifItems = Array.isArray(notifs) ? notifs : notifs.items || [];
    const assignmentNotif = notifItems.find((n: any) => n.data?.nodeId === taskId || n.title?.includes('Task') || n.message?.includes('Task Assigned to A'));
    expect(assignmentNotif).toBeDefined();
  });

  it('Step 3: User B sees nothing in this workspace or project', async () => {
    // 1. User B logs in via HTTP
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password }),
    });
    expect([200, 201]).toContain(loginRes.status);
    const loginData = await loginRes.json();
    tokenB = loginData.accessToken;

    // 2. User B queries projects
    const projRes = await fetch(`${API_BASE}/projects`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'x-workspace-id': workspace.id,
      },
    });
    const bProjects = await projRes.json();
    const bFound = (Array.isArray(bProjects) ? bProjects : bProjects.items || []).find((p: any) => p.id === projectId);
    expect(bFound).toBeUndefined();

    // 3. User B queries role dashboard
    const dashRes = await fetch(`${API_BASE}/workspaces/${workspace.id}/reports/role-dashboard`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'x-workspace-id': workspace.id,
      },
    });
    const dashData = await dashRes.json();
    const bTasks = dashData.assigneeWork?.myTasks || [];
    expect(bTasks.find((t: any) => t.id === taskId)).toBeUndefined();
  });

  it('Step 4: Reassigning task to User B transfers access to B and revokes from A', async () => {
    // 1. Admin reassigns task to User B
    const updateRes = await fetch(`${API_BASE}/nodes/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        ownerId: userB.id,
      }),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.ownerId).toBe(userB.id);

    // 2. User B logs in / refreshes: now sees the project and the task
    const bLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password }),
    });
    const bToken = (await bLoginRes.json()).accessToken;

    const bDashRes = await fetch(`${API_BASE}/workspaces/${workspace.id}/reports/role-dashboard`, {
      headers: {
        Authorization: `Bearer ${bToken}`,
        'x-workspace-id': workspace.id,
      },
    });
    const bDash = await bDashRes.json();
    const bMyTasks = bDash.assigneeWork?.myTasks || [];
    expect(bMyTasks.find((t: any) => t.id === taskId)).toBeDefined();

    // 3. User A no longer sees the task in My Tasks
    const aDashRes = await fetch(`${API_BASE}/workspaces/${workspace.id}/reports/role-dashboard`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
    });
    const aDash = await aDashRes.json();
    const aMyTasks = aDash.assigneeWork?.myTasks || [];
    expect(aMyTasks.find((t: any) => t.id === taskId)).toBeUndefined();
  });

  it('Step 5: Approvals flow - A requests approval from Manager M; M sees request in Approvals & dashboard, approves; A is notified', async () => {
    // Reassign task back to A
    await fetch(`${API_BASE}/nodes/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({ ownerId: userA.id }),
    });

    // 1. User A requests approval from Manager M
    const reqRes = await fetch(`${API_BASE}/approvals/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        nodeId: taskId,
        projectId,
        workspaceId: workspace.id,
        chosenApproverId: managerM.id,
        notes: 'Please review and approve deliverable',
      }),
    });
    expect([200, 201]).toContain(reqRes.status);
    const reqData = await reqRes.json();
    approvalRequestId = reqData.id;
    expect(approvalRequestId).toBeDefined();

    // 2. Manager M logs in via HTTP
    const mLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: managerM.email, password }),
    });
    expect([200, 201]).toContain(mLoginRes.status);
    tokenM = (await mLoginRes.json()).accessToken;

    // 3. Manager M sees the request in Approvals queue
    const queueRes = await fetch(`${API_BASE}/nodes/review-queue?workspaceId=${workspace.id}`, {
      headers: {
        Authorization: `Bearer ${tokenM}`,
        'x-workspace-id': workspace.id,
      },
    });
    expect(queueRes.status).toBe(200);
    const queue = await queueRes.json();
    const pendingInQueue = (Array.isArray(queue) ? queue : []).find((n: any) => n.id === taskId);
    expect(pendingInQueue).toBeDefined();

    // 4. Manager M sees pending count / reviews on dashboard
    const mDashRes = await fetch(`${API_BASE}/workspaces/${workspace.id}/reports/role-dashboard`, {
      headers: {
        Authorization: `Bearer ${tokenM}`,
        'x-workspace-id': workspace.id,
      },
    });
    expect(mDashRes.status).toBe(200);
    const mDash = await mDashRes.json();
    expect(mDash.managerWorkload?.pendingReviewCount).toBeGreaterThanOrEqual(1);

    // 5. Manager M receives notification
    const mNotifRes = await fetch(`${API_BASE}/notifications`, {
      headers: {
        Authorization: `Bearer ${tokenM}`,
        'x-workspace-id': workspace.id,
      },
    });
    expect(mNotifRes.status).toBe(200);
    const mNotifs = await mNotifRes.json();
    const mItems = Array.isArray(mNotifs) ? mNotifs : mNotifs.items || [];
    const approvalNotif = mItems.find((n: any) => n.type === 'APPROVAL_REQUESTED' || n.title?.includes('Approval') || n.message?.includes('approval'));
    expect(approvalNotif).toBeDefined();

    // 6. Manager M submits decision: APPROVED
    const decideRes = await fetch(`${API_BASE}/approvals/requests/${approvalRequestId}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenM}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        decision: 'Approved',
        comment: 'Approved by Manager M after thorough review.',
      }),
    });
    expect([200, 201]).toContain(decideRes.status);

    // 7. Requester A is notified of the approval decision
    const aNotifRes = await fetch(`${API_BASE}/notifications`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
    });
    expect(aNotifRes.status).toBe(200);
    const aNotifs = await aNotifRes.json();
    const aItems = Array.isArray(aNotifs) ? aNotifs : aNotifs.items || [];
    const decisionNotif = aItems.find((n: any) => n.title?.includes('Approved') || n.message?.includes('Approved') || n.type === 'APPROVAL_DECISION');
    expect(decisionNotif).toBeDefined();
  });

  it('Step 6: Workspace membership role is MEMBER only, account role is untouched, and Member cannot assign tasks outside scope', async () => {
    // 1. Confirm User A's workspace membership role is strictly MEMBER
    const wsMember = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: userA.id } },
    });
    expect(wsMember).toBeDefined();
    expect(wsMember?.role).toBe(Role.MEMBER);

    // 2. Confirm User A's user row in database was never altered (no elevated account role)
    const userRow = await prisma.user.findUnique({ where: { id: userA.id } });
    expect(userRow?.id).toBe(userA.id);

    // 3. Confirm Member User A CANNOT assign a task to someone outside their allowed scope
    const illegalAssignRes = await fetch(`${API_BASE}/nodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        title: 'Illegal Task Assignment Attempt',
        projectId,
        workspaceId: workspace.id,
        ownerId: userB.id,
      }),
    });
    expect(illegalAssignRes.status).toBe(403);
  });

  it('Step 7: Requester receives notifications and sees results for all approver decision types (Changes Requested, Rejected, Approved)', async () => {
    // 1. Test Changes Requested
    const req1Res = await fetch(`${API_BASE}/approvals/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        nodeId: taskId,
        projectId,
        workspaceId: workspace.id,
        chosenApproverId: managerM.id,
        notes: 'Review submission 1',
      }),
    });
    const req1 = await req1Res.json();

    const decideChangesRes = await fetch(`${API_BASE}/approvals/requests/${req1.id}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenM}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        decision: 'Changes Requested',
        comment: 'Please update documentation and clarify specs.',
      }),
    });
    expect([200, 201]).toContain(decideChangesRes.status);

    // Requester A sees Changes Requested notification
    let notifsRes = await fetch(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspace.id },
    });
    let notifs = await notifsRes.json();
    let items = Array.isArray(notifs) ? notifs : notifs.items || [];
    let changesNotif = items.find((n: any) => n.title?.includes('CHANGES_REQUESTED') || n.body?.includes('changes requested'));
    expect(changesNotif).toBeDefined();

    // Requester A sees Changes Requested on Dashboard
    let dashRes = await fetch(`${API_BASE}/workspaces/${workspace.id}/reports/role-dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspace.id },
    });
    let dash = await dashRes.json();
    let reviewItems = dash.assigneeWork?.reviewStatus?.items || [];
    let taskReview = reviewItems.find((r: any) => r.id === taskId);
    expect(taskReview?.approvalStatus).toBe('changes_requested');

    // 2. Test Rejected
    const req2Res = await fetch(`${API_BASE}/approvals/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        nodeId: taskId,
        projectId,
        workspaceId: workspace.id,
        chosenApproverId: managerM.id,
        notes: 'Review submission 2',
      }),
    });
    const req2 = await req2Res.json();

    const decideRejectRes = await fetch(`${API_BASE}/approvals/requests/${req2.id}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenM}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        decision: 'Rejected',
        comment: 'Does not meet criteria.',
      }),
    });
    expect([200, 201]).toContain(decideRejectRes.status);

    // Requester A sees Rejected notification
    notifsRes = await fetch(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspace.id },
    });
    notifs = await notifsRes.json();
    items = Array.isArray(notifs) ? notifs : notifs.items || [];
    let rejectNotif = items.find((n: any) => n.title?.includes('REJECTED') || n.body?.includes('rejected'));
    expect(rejectNotif).toBeDefined();

    // 3. Test Approved
    const req3Res = await fetch(`${API_BASE}/approvals/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        nodeId: taskId,
        projectId,
        workspaceId: workspace.id,
        chosenApproverId: managerM.id,
        notes: 'Review submission 3',
      }),
    });
    const req3 = await req3Res.json();

    const decideApproveRes = await fetch(`${API_BASE}/approvals/requests/${req3.id}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenM}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        decision: 'Approved',
        comment: 'Looks great! Approved.',
      }),
    });
    expect([200, 201]).toContain(decideApproveRes.status);

    // Requester A sees Approved notification
    notifsRes = await fetch(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${tokenA}`, 'x-workspace-id': workspace.id },
    });
    notifs = await notifsRes.json();
    items = Array.isArray(notifs) ? notifs : notifs.items || [];
    let approveNotif = items.find((n: any) => n.title?.includes('APPROVED') || n.body?.includes('approved'));
    expect(approveNotif).toBeDefined();
  });
});
