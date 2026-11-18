import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, ConfidentialityLevel } from '@prisma/client';
import { EdgesService } from './edges.service';
import { ProjectsService } from '../projects/projects.service';
import { NodesService } from '../nodes/nodes.service';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

describe('Edges Management & Task Dependencies (Real Database)', () => {
  let prisma: PrismaClient;
  let edgesService: EdgesService;
  let projectsService: ProjectsService;
  let nodesService: NodesService;
  let authService: AuthorizationService;

  let workspace: any;
  let adminUser: any;
  let managerOwnUser: any;
  let managerAssignedUser: any;
  let unrelatedManagerUser: any;
  let memberUser: any;

  let ownProject: any;
  let assignedProject: any;

  let statusSet: any;
  let inProgressStatus: any;
  let nodeType: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    edgesService = new EdgesService(prisma as any);
    authService = new AuthorizationService(prisma as any);
    const auditService = new AuditService(prisma as any);
    const notificationsService = new NotificationsService(prisma as any);
    nodesService = new NodesService(prisma as any, null as any, authService);
    projectsService = new ProjectsService(
      prisma as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any
    );

    const timestamp = Date.now();

    workspace = await prisma.workspace.create({
      data: {
        name: `Edge WS ${timestamp}`,
        slug: `edge-ws-${timestamp}`,
      },
    });

    // Create users & memberships
    adminUser = await prisma.user.create({
      data: { email: `admin-${timestamp}@edge-test.com`, fullName: 'Admin User', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: adminUser.id, role: Role.ADMIN },
    });

    managerOwnUser = await prisma.user.create({
      data: { email: `mgr-own-${timestamp}@edge-test.com`, fullName: 'Own Manager', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: managerOwnUser.id, role: Role.MANAGER },
    });

    managerAssignedUser = await prisma.user.create({
      data: { email: `mgr-assigned-${timestamp}@edge-test.com`, fullName: 'Assigned Manager', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: managerAssignedUser.id, role: Role.MANAGER },
    });

    unrelatedManagerUser = await prisma.user.create({
      data: { email: `mgr-unrelated-${timestamp}@edge-test.com`, fullName: 'Unrelated Manager', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: unrelatedManagerUser.id, role: Role.MANAGER },
    });

    memberUser = await prisma.user.create({
      data: { email: `member-${timestamp}@edge-test.com`, fullName: 'Member User', isActive: true },
    });
    await prisma.membership.create({
      data: { workspaceId: workspace.id, userId: memberUser.id, role: Role.MEMBER },
    });

    // StatusSet & NodeType
    statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: `Edge Status Set ${timestamp}`,
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
    inProgressStatus = statusSet.statuses.find((s: any) => s.key === 'in_progress');

    nodeType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Task',
        key: 'task',
        defaultStatusSetId: statusSet.id,
      },
    });

    // 1. Own Project: Created by managerOwnUser
    ownProject = await projectsService.createProject(
      workspace.id,
      {
        name: `Manager Own Project ${timestamp}`,
        classification: 'INTERNAL',
      },
      managerOwnUser.id,
      'MANAGER'
    );

    // 2. Assigned Project: Owned by adminUser, managerAssignedUser is member only
    assignedProject = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Admin Project ${timestamp}`,
        ownerId: adminUser.id,
        responsibleManagerId: adminUser.id,
        classification: ConfidentialityLevel.INTERNAL,
      },
    });
    await prisma.projectMember.create({
      data: { projectId: assignedProject.id, userId: managerAssignedUser.id, role: Role.MANAGER },
    });
    await prisma.projectMember.create({
      data: { projectId: assignedProject.id, userId: memberUser.id, role: Role.MEMBER },
    });
  });

  afterAll(async () => {
    await prisma.edge.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.node.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.projectMember.deleteMany({ where: { project: { workspaceId: workspace.id } } });
    await prisma.project.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.nodeType.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.status.deleteMany({ where: { statusSet: { workspaceId: workspace.id } } });
    await prisma.statusSet.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            adminUser.id,
            managerOwnUser.id,
            managerAssignedUser.id,
            unrelatedManagerUser.id,
            memberUser.id,
          ],
        },
      },
    });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.$disconnect();
  });

  it('Verifies manager is recorded in DB as creator/owner/responsible manager on project creation', async () => {
    const fetched = await prisma.project.findUnique({
      where: { id: ownProject.id },
    });
    expect(fetched?.ownerId === managerOwnUser.id || fetched?.responsibleManagerId === managerOwnUser.id).toBe(true);
    expect(fetched?.responsibleManagerId).toBe(managerOwnUser.id);
  });

  it('a manager in their own project can create and delete an edge (even on tasks assigned to members)', async () => {
    // Two tasks in manager's own project, assigned to members or unassigned
    const task1 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: ownProject.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Own Project Task 1',
        ownerId: memberUser.id,
      },
    });
    const task2 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: ownProject.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Own Project Task 2',
        ownerId: null,
      },
    });

    // Manager creates edge
    const edge = await edgesService.createEdge(
      workspace.id,
      {
        projectId: ownProject.id,
        sourceNodeId: task1.id,
        targetNodeId: task2.id,
      },
      managerOwnUser.id,
      'MANAGER'
    );
    expect(edge).toBeDefined();
    expect(edge.id).toBeDefined();

    // Manager deletes edge
    const deleted = await edgesService.deleteEdge(edge.id, managerOwnUser.id, 'MANAGER');
    expect(deleted).toBeDefined();
    expect(deleted.id).toBe(edge.id);
  });

  it('a manager in an assigned project can connect only inside their own tasks and descendants', async () => {
    // In assigned project: Task A assigned to managerAssignedUser
    const taskA = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: assignedProject.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Manager Assigned Task A',
        ownerId: managerAssignedUser.id,
      },
    });

    // Task B is a child/descendant of Task A
    const taskB = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: assignedProject.id,
        parentNodeId: taskA.id,
        path: `/${taskA.id}`,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Manager Assigned Task B (Subtask)',
        ownerId: null,
      },
    });

    // Task C assigned to Member
    const taskC = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: assignedProject.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Other Task C',
        ownerId: memberUser.id,
      },
    });

    // Task D assigned to Member
    const taskD = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: assignedProject.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Other Task D',
        ownerId: memberUser.id,
      },
    });

    // 1. Manager connecting Task A to Task B (inside own tasks/descendants) -> SUCCEEDS
    const edgeAB = await edgesService.createEdge(
      workspace.id,
      {
        projectId: assignedProject.id,
        sourceNodeId: taskA.id,
        targetNodeId: taskB.id,
      },
      managerAssignedUser.id,
      'MANAGER'
    );
    expect(edgeAB).toBeDefined();

    // 2. Manager connecting Task A to Task C (outside scope) -> FORBIDDEN
    await expect(
      edgesService.createEdge(
        workspace.id,
        {
          projectId: assignedProject.id,
          sourceNodeId: taskA.id,
          targetNodeId: taskC.id,
        },
        managerAssignedUser.id,
        'MANAGER'
      )
    ).rejects.toThrow(ForbiddenException);

    // 3. Manager connecting Task C to Task D (unrelated tasks) -> FORBIDDEN
    await expect(
      edgesService.createEdge(
        workspace.id,
        {
          projectId: assignedProject.id,
          sourceNodeId: taskC.id,
          targetNodeId: taskD.id,
        },
        managerAssignedUser.id,
        'MANAGER'
      )
    ).rejects.toThrow(ForbiddenException);

    // Manager can delete own edge AB
    await edgesService.deleteEdge(edgeAB.id, managerAssignedUser.id, 'MANAGER');
  });

  it('an unrelated manager and a member cannot connect others tasks', async () => {
    const taskOther1 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: assignedProject.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'External Task 1',
        ownerId: adminUser.id,
      },
    });
    const taskOther2 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: assignedProject.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'External Task 2',
        ownerId: adminUser.id,
      },
    });

    // 1. Unrelated manager cannot connect others' tasks
    await expect(
      edgesService.createEdge(
        workspace.id,
        {
          projectId: assignedProject.id,
          sourceNodeId: taskOther1.id,
          targetNodeId: taskOther2.id,
        },
        unrelatedManagerUser.id,
        'MANAGER'
      )
    ).rejects.toThrow(ForbiddenException);

    // 2. Member cannot connect others' tasks
    await expect(
      edgesService.createEdge(
        workspace.id,
        {
          projectId: assignedProject.id,
          sourceNodeId: taskOther1.id,
          targetNodeId: taskOther2.id,
        },
        memberUser.id,
        'MEMBER'
      )
    ).rejects.toThrow(ForbiddenException);

    // 3. Member can connect their own assigned tasks
    const memberTask1 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: assignedProject.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Member Task 1',
        ownerId: memberUser.id,
      },
    });
    const memberTask2 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: assignedProject.id,
        nodeTypeId: nodeType.id,
        statusId: inProgressStatus.id,
        title: 'Member Task 2',
        ownerId: memberUser.id,
      },
    });

    const memberEdge = await edgesService.createEdge(
      workspace.id,
      {
        projectId: assignedProject.id,
        sourceNodeId: memberTask1.id,
        targetNodeId: memberTask2.id,
      },
      memberUser.id,
      'MEMBER'
    );
    expect(memberEdge).toBeDefined();

    // Member can delete their own edge
    await edgesService.deleteEdge(memberEdge.id, memberUser.id, 'MEMBER');
  });

  it('no PATCH /projects is sent when panning or zooming (viewport is stored in localStorage only)', () => {
    const canvasStudioFilePath = path.resolve(
      __dirname,
      '../../../../web/src/components/canvas/CanvasStudio.tsx'
    );
    const canvasStudioContent = fs.readFileSync(canvasStudioFilePath, 'utf-8');

    // Verify onViewportMoveEnd does NOT call ApiClient.updateProject
    expect(canvasStudioContent).not.toMatch(/onViewportMoveEnd[\s\S]*?ApiClient\.updateProject/);

    // Verify viewport is saved into localStorage with user id and project id
    expect(canvasStudioContent).toContain('localStorage.setItem(`flowtrack_viewport_${userId}_${project.id}`');

    // Verify onViewportMoveEnd never needs edit rights or permission checks
    expect(canvasStudioContent).not.toMatch(/onViewportMoveEnd[\s\S]*?canEditProjectSettings/);
  });
});
