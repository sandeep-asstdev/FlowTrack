import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspacesService } from './workspaces/workspaces.service';
import { ProjectsService } from './projects/projects.service';
import { NodesService } from './nodes/nodes.service';
import { DocumentsService } from './documents/documents.service';
import { ReportsService } from './reports/reports.service';
import { Role } from '@prisma/client';
import { calculateUniversalDashboardMetrics, generateProjectCsv } from '@flowtrack/shared';

describe('End-to-End Project Creation to Completion Lifecycle Workflow', () => {
  let workspacesService: WorkspacesService;
  let projectsService: ProjectsService;
  let nodesService: NodesService;
  let documentsService: DocumentsService;
  let reportsService: ReportsService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      workspace: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
      membership: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
      statusSet: {
        create: vi.fn(),
      },
      nodeType: {
        create: vi.fn(),
        createMany: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      project: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      fieldDefinition: {
        findMany: vi.fn(),
      },
      node: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      edge: {
        findMany: vi.fn(),
      },
      document: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      status: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      notification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      remark: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    workspacesService = new WorkspacesService(prismaMock);
    projectsService = new ProjectsService(prismaMock);
    nodesService = new NodesService(prismaMock);
    documentsService = new DocumentsService(
      prismaMock,
      { log: vi.fn().mockResolvedValue({}) } as any,
      { notify: vi.fn().mockResolvedValue({}) } as any,
      { broadcastToProject: vi.fn(), emitNodeUpdate: vi.fn(), emitDocumentAdded: vi.fn() } as any
    );
    reportsService = new ReportsService(prismaMock);
  });

  it('successfully executes complete end-to-end project lifecycle', async () => {
    const adminUserId = 'user-admin-1';
    const workspaceId = 'ws-e2e-100';

    // 1. Workspace Creation
    prismaMock.workspace.create.mockResolvedValue({
      id: workspaceId,
      name: 'Titan Infrastructure Ltd',
      slug: 'titan-infra',
    });
    prismaMock.statusSet.create.mockResolvedValue({ id: 'ss-1' });
    prismaMock.nodeType.createMany.mockResolvedValue({ count: 5 });

    const ws = await workspacesService.createWorkspace(adminUserId, {
      name: 'Titan Infrastructure Ltd',
    });
    expect(ws.id).toBe(workspaceId);

    // 2. Project Creation with Industry Configuration & Budget Baseline
    const projectId = 'proj-e2e-1';
    prismaMock.fieldDefinition.findMany.mockResolvedValue([]);
    prismaMock.project.create.mockResolvedValue({
      id: projectId,
      workspaceId,
      name: 'Skyline Metro Rail Extension',
      settings: {
        industry: 'construction_real_estate',
        features: { budgetTracking: true, approvals: true },
        budgetConfig: {
          approvedBudget: 1500000,
          contractAmount: 1400000,
          contingencyReserve: 150000,
        },
      },
    });

    const project = await projectsService.createProject(workspaceId, {
      name: 'Skyline Metro Rail Extension',
      settings: {
        industry: 'construction_real_estate',
        budgetConfig: {
          approvedBudget: 1500000,
          contractAmount: 1400000,
          contingencyReserve: 150000,
        },
      } as any,
    }, adminUserId);
    expect(project.id).toBe(projectId);

    // 3. Stage & Node Hierarchy Creation
    const stageId = 'stage-foundation';
    const taskId = 'task-piling';

    prismaMock.nodeType.findUnique.mockResolvedValue({ id: 'nt-task', isGroup: false });
    prismaMock.node.create.mockResolvedValueOnce({
      id: stageId,
      workspaceId,
      projectId,
      title: 'Phase 1: Civil Foundation',
      isMilestone: false,
      progressPct: 0,
      weight: 3.0,
    });

    const stage = await nodesService.createNode(workspaceId, {
      projectId,
      nodeTypeId: 'nt-stage',
      title: 'Phase 1: Civil Foundation',
      weight: 3.0,
    });
    expect(stage.id).toBe(stageId);

    prismaMock.node.create.mockResolvedValueOnce({
      id: taskId,
      workspaceId,
      projectId,
      parentNodeId: stageId,
      title: 'Reinforced Pier Piling',
      isMilestone: false,
      progressPct: 0,
      weight: 1.0,
      estimatedCost: 350000,
      reviewerId: adminUserId,
      approvalStatus: 'not_required',
    });

    prismaMock.node.findMany.mockResolvedValueOnce([
      { id: stageId, parentNodeId: null },
    ]);

    const task = await nodesService.createNode(workspaceId, {
      projectId,
      parentNodeId: stageId,
      nodeTypeId: 'nt-task',
      title: 'Reinforced Pier Piling',
      estimatedCost: 350000,
      reviewerId: adminUserId,
    });
    expect(task.id).toBe(taskId);

    // 4. Document Evidence Upload & Versioning
    prismaMock.node.findUnique.mockResolvedValue({
      id: taskId,
      workspaceId,
      projectId,
      deletedAt: null,
      project: { id: projectId },
    });
    prismaMock.membership.findUnique.mockResolvedValue({
      workspaceId,
      userId: adminUserId,
      role: Role.ADMIN,
    });
    prismaMock.document.findFirst.mockResolvedValue(null);
    prismaMock.document.create.mockResolvedValue({
      id: 'doc-1',
      nodeId: taskId,
      name: 'Concrete_Core_Test_Results.pdf',
      version: 1,
      category: 'evidence',
      fileSize: 1024 * 500,
      mimeType: 'application/pdf',
    });

    const doc = await documentsService.addDocument(taskId, adminUserId, {
      name: 'Concrete_Core_Test_Results.pdf',
      category: 'evidence',
      fileSize: 1024 * 500,
      mimeType: 'application/pdf',
    });
    expect(doc.version).toBe(1);
    expect(doc.category).toBe('evidence');

    // 5. Blocker Reporting
    prismaMock.node.findUnique.mockResolvedValue({
      id: taskId,
      workspaceId,
      projectId,
      approvalStatus: 'not_required',
      version: 1,
      status: { category: 'active' },
    });
    prismaMock.node.update.mockResolvedValue({
      id: taskId,
      approvalFeedback: 'Delayed awaiting seismic bedrock sensor calibration',
    });

    const blockedTask = await nodesService.reportBlocker(taskId, adminUserId, {
      reason: 'Delayed awaiting seismic bedrock sensor calibration',
    });
    expect(blockedTask.approvalFeedback).toContain('seismic bedrock');

    // 6. Blocker Resolution & Review Submission
    prismaMock.node.findUnique.mockResolvedValue({
      id: taskId,
      workspaceId,
      projectId,
      approvalStatus: 'not_required',
      reviewerId: adminUserId,
      version: 2,
    });
    prismaMock.node.update.mockResolvedValue({
      id: taskId,
      approvalStatus: 'pending',
    });

    const reviewSubmitted = await nodesService.updateNode(taskId, {
      approvalStatus: 'pending',
    }, adminUserId);
    expect(reviewSubmitted.approvalStatus).toBe('pending');

    // 7. Manager Approval Gate Execution
    const managerUserId = 'manager-raj';
    prismaMock.node.findUnique.mockResolvedValue({
      id: taskId,
      workspaceId,
      projectId,
      ownerId: 'engineer-anil',
      reviewerId: managerUserId,
      workspace: { memberships: [{ role: 'MANAGER' }] },
      project: { members: [{ role: 'MANAGER' }] },
      approvalStatus: 'pending',
      version: 3,
    });
    prismaMock.node.update.mockResolvedValue({
      id: taskId,
      approvalStatus: 'approved',
      progressPct: 100,
      actualCost: 320000,
    });

    const approvedTask = await nodesService.approveTask(taskId, managerUserId, {
      decision: 'approved',
      feedback: 'All core tests and sensor calibrations certified.',
    });
    expect(approvedTask.approvalStatus).toBe('approved');

    // 8. Universal Dashboard Intelligence & CSV Export
    const mockNodes = [
      {
        id: stageId,
        title: 'Phase 1: Civil Foundation',
        parentNodeId: null,
        status: { category: 'active' },
        progressPct: 80,
        weight: 3.0,
      },
      {
        id: taskId,
        title: 'Reinforced Pier Piling',
        parentNodeId: stageId,
        status: { category: 'done' },
        progressPct: 100,
        weight: 1.0,
        estimatedCost: 350000,
        actualCost: 320000,
        approvalStatus: 'approved',
      },
    ];

    const metrics = calculateUniversalDashboardMetrics(mockNodes, project);
    expect(metrics.industry).toBe('construction_real_estate');
    expect(metrics.industryTerminology.stage).toBe('Phase / Work Package');
    expect(metrics.financials.isConfigured).toBe(true);
    expect(metrics.financials.approvedBudget).toBe(1500000);
    expect(metrics.financials.actualExpenditure).toBe(320000);
    expect(metrics.financials.budgetVariance).toBeGreaterThan(0); // Under budget
    expect(metrics.financials.varianceStatus).toBe('favorable');

    const csv = generateProjectCsv(metrics, project, 'financials');
    expect(csv).toContain('Approved Budget Baseline');
    expect(csv).toContain('1500000');
    expect(csv).toContain('FAVORABLE');
  });
});
