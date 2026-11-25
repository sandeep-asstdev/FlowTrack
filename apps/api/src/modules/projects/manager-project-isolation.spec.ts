import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectsService } from './projects.service';
import { NodesService } from '../nodes/nodes.service';
import { EdgesService } from '../edges/edges.service';
import { DocumentsService } from '../documents/documents.service';
import { ReportsService } from '../reports/reports.service';

describe('Manager-to-Manager Project Read Isolation (Real Database)', () => {
  let prisma: PrismaClient;
  let authService: AuthorizationService;
  let projectsService: ProjectsService;
  let nodesService: NodesService;
  let edgesService: EdgesService;
  let documentsService: DocumentsService;
  let reportsService: ReportsService;

  let workspace: any;
  let adminUser: any;
  let miaManager: any;
  let omarManager: any;
  let assignedMember: any;
  let nodeType: any;

  let miaProject: any;
  let task1: any;
  let task2: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    authService = new AuthorizationService(prisma as any);
    const auditService = new AuditService(prisma as any);
    const notificationsService = new NotificationsService(prisma as any);
    const mockGateway = { broadcastToProject: () => null, broadcastToNode: () => null };

    projectsService = new ProjectsService(prisma as any, authService, auditService);
    nodesService = new NodesService(prisma as any, auditService, notificationsService, mockGateway as any, authService);
    edgesService = new EdgesService(prisma as any, authService);
    documentsService = new DocumentsService(prisma as any, auditService, notificationsService, mockGateway as any, authService);
    reportsService = new ReportsService(prisma as any, authService);

    const ts = Date.now();
    workspace = await prisma.workspace.create({
      data: { name: `WS-Iso-${ts}`, slug: `ws-iso-${ts}` },
    });

    adminUser = await prisma.user.create({
      data: { email: `admin-iso-${ts}@test.com`, fullName: 'Admin Iso' },
    });
    miaManager = await prisma.user.create({
      data: { email: `mia-iso-${ts}@test.com`, fullName: 'Mia Manager' },
    });
    omarManager = await prisma.user.create({
      data: { email: `omar-iso-${ts}@test.com`, fullName: 'Omar Manager' },
    });
    assignedMember = await prisma.user.create({
      data: { email: `member-iso-${ts}@test.com`, fullName: 'Assigned Member' },
    });

    await prisma.membership.createMany({
      data: [
        { workspaceId: workspace.id, userId: adminUser.id, role: Role.ADMIN },
        { workspaceId: workspace.id, userId: miaManager.id, role: Role.MANAGER },
        { workspaceId: workspace.id, userId: omarManager.id, role: Role.MANAGER },
        { workspaceId: workspace.id, userId: assignedMember.id, role: Role.MEMBER },
      ],
    });

    const statusSet = await prisma.statusSet.create({
      data: { workspaceId: workspace.id, name: `SS-Iso-${ts}` },
    });
    const activeStatus = await prisma.status.create({
      data: { statusSetId: statusSet.id, key: 'active', category: 'active' },
    });
    nodeType = await prisma.nodeType.create({
      data: { workspaceId: workspace.id, key: 'task', name: 'Task', defaultStatusSetId: statusSet.id },
    });

    miaProject = await projectsService.createProject(
      workspace.id,
      { name: `Mia Secret Init ${ts}`, key: `MIA${String(ts).slice(-4)}` },
      miaManager.id,
      'MANAGER'
    );

    task1 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: miaProject.id,
        nodeTypeId: nodeType.id,
        statusId: activeStatus.id,
        title: `Mia Task Alpha ${ts}`,
        ownerId: miaManager.id,
        approvalStatus: 'pending',
      },
    });
    task2 = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: miaProject.id,
        nodeTypeId: nodeType.id,
        statusId: activeStatus.id,
        title: `Mia Task Beta ${ts}`,
        ownerId: assignedMember.id,
      },
    });

    await prisma.edge.create({
      data: {
        workspaceId: workspace.id,
        projectId: miaProject.id,
        sourceNodeId: task1.id,
        targetNodeId: task2.id,
      },
    });

    await prisma.document.create({
      data: {
        workspace: { connect: { id: workspace.id } },
        node: { connect: { id: task1.id } },
        uploader: { connect: { id: miaManager.id } },
        name: 'mia-spec.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: `vault/mia-spec-${ts}.pdf`,
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

  it('blocks unrelated Manager Omar from reading Mia project, nodes, search, edges, documents, and dashboard (404)', async () => {
    // 1. Project detail -> 404
    await expect(
      projectsService.getProject(miaProject.id, workspace.id, { id: omarManager.id, role: 'MANAGER' })
    ).rejects.toThrow(NotFoundException);

    // 2. Project list -> excluded
    const omarList = await projectsService.listWorkspaceProjects(workspace.id, { id: omarManager.id, role: 'MANAGER' });
    expect(omarList.some((p: any) => p.id === miaProject.id)).toBe(false);

    // 3. Project nodes -> 404
    await expect(
      nodesService.listProjectNodes(miaProject.id, 'all', {}, omarManager.id, 'MANAGER')
    ).rejects.toThrow(NotFoundException);

    // 4. Search within project -> 404
    await expect(
      nodesService.listProjectNodes(miaProject.id, 'all', { search: 'Alpha' }, omarManager.id, 'MANAGER')
    ).rejects.toThrow(NotFoundException);

    // 5. Single node -> 404
    await expect(
      nodesService.getNode(task1.id, omarManager.id, 'MANAGER')
    ).rejects.toThrow(NotFoundException);

    // 6. Edges -> 404
    await expect(
      edgesService.listProjectEdges(miaProject.id, omarManager.id, 'MANAGER')
    ).rejects.toThrow(NotFoundException);

    // 7. Documents -> 404
    await expect(
      documentsService.getNodeDocuments(task1.id, omarManager.id)
    ).rejects.toThrow(NotFoundException);

    // 8. Project dashboard -> 404; Workspace & role dashboards exclude Mia project
    await expect(
      reportsService.getProjectDashboard(workspace.id, miaProject.id, omarManager.id)
    ).rejects.toThrow(NotFoundException);

    const omarWsDash = await reportsService.getWorkspaceDashboard(workspace.id, omarManager.id);
    expect(omarWsDash.projectsSummary.totalProjects).toBe(0);
    expect(omarWsDash.projectsSummary.projectsList.some((p: any) => p.id === miaProject.id)).toBe(false);

    const omarRoleDash = await reportsService.getRoleScopedDashboard(workspace.id, omarManager.id);
    const pendingInMia = (omarRoleDash.managerReviewQueue?.items || []).filter(
      (i: any) => i.projectId === miaProject.id
    );
    expect(pendingInMia.length).toBe(0);
  });

  it('allows Admin, creator Mia, and assigned Member to read the project', async () => {
    const adminProj = await projectsService.getProject(miaProject.id, workspace.id, {
      id: adminUser.id,
      role: 'ADMIN',
    });
    expect(adminProj.id).toBe(miaProject.id);

    const miaProj = await projectsService.getProject(miaProject.id, workspace.id, {
      id: miaManager.id,
      role: 'MANAGER',
    });
    expect(miaProj.id).toBe(miaProject.id);

    const memberProj = await projectsService.getProject(miaProject.id, workspace.id, {
      id: assignedMember.id,
      role: 'MEMBER',
    });
    expect(memberProj.id).toBe(miaProject.id);
  });
});
