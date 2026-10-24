import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportsService } from './reports.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ReportsService', () => {
  let service: ReportsService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      membership: {
        findUnique: vi.fn(),
      },
      project: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      node: {
        findMany: vi.fn(),
      },
    };

    service = new ReportsService(prismaMock);
  });

  it('throws ForbiddenException if user is not a member of the workspace', async () => {
    prismaMock.membership.findUnique.mockResolvedValue(null);

    await expect(
      service.getProjectDashboard('ws-1', 'proj-1', 'unauthorized-user')
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException if project does not exist', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({
      workspaceId: 'ws-1',
      userId: 'user-1',
      role: 'ADMIN',
    });
    prismaMock.project.findFirst.mockResolvedValue(null);

    await expect(
      service.getProjectDashboard('ws-1', 'missing-proj', 'user-1')
    ).rejects.toThrow(NotFoundException);
  });

  it('returns universal dashboard metrics for an active project', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({
      workspaceId: 'ws-1',
      userId: 'user-1',
      role: 'MANAGER',
    });

    prismaMock.project.findFirst.mockResolvedValue({
      id: 'proj-1',
      workspaceId: 'ws-1',
      name: 'High-Rise Construction',
      settings: {
        industry: 'construction_real_estate',
        features: { budgetTracking: true },
        budgetConfig: { approvedBudget: 250000 },
      },
    });

    prismaMock.node.findMany.mockResolvedValue([
      {
        id: 'node-1',
        title: 'Excavation',
        status: { category: 'done' },
        progressPct: 100,
        weight: 1.0,
        estimatedCost: 50000,
        actualCost: 45000,
      },
      {
        id: 'node-2',
        title: 'Foundation Slab',
        status: { category: 'active' },
        progressPct: 50,
        weight: 2.0,
        estimatedCost: 100000,
        actualCost: 60000,
      },
    ]);

    const result = await service.getProjectDashboard('ws-1', 'proj-1', 'user-1');

    expect(result).toBeDefined();
    expect(result.industry).toBe('construction_real_estate');
    expect(result.industryTerminology.stage).toBe('Phase / Work Package');
    expect(result.overview.totalTasks).toBe(2);
    expect(result.overview.completedTasks).toBe(1);
    expect(result.financials.approvedBudget).toBe(250000);
    expect(result.financials.actualExpenditure).toBe(105000);
  });

  it('masks contingency reserve for MEMBER roles', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({
      workspaceId: 'ws-1',
      userId: 'member-user',
      role: 'MEMBER',
    });

    prismaMock.project.findFirst.mockResolvedValue({
      id: 'proj-1',
      workspaceId: 'ws-1',
      name: 'High-Rise Construction',
      settings: {
        budgetConfig: { approvedBudget: 250000, contingencyReserve: 25000 },
      },
    });

    prismaMock.node.findMany.mockResolvedValue([]);

    const result = await service.getProjectDashboard('ws-1', 'proj-1', 'member-user');
    expect(result.financials.contingencyReserve).toBeNull();
  });

  it('exports valid CSV data for a project', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({
      workspaceId: 'ws-1',
      userId: 'user-1',
      role: 'ADMIN',
    });

    prismaMock.project.findFirst.mockResolvedValue({
      id: 'proj-1',
      workspaceId: 'ws-1',
      name: 'Project Alpha',
      settings: {},
    });

    prismaMock.node.findMany.mockResolvedValue([
      {
        id: 'n1',
        title: 'Task 1',
        status: { category: 'active' },
        progressPct: 50,
        priority: 'HIGH',
      },
    ]);

    const exportRes = await service.exportProjectCsv('ws-1', 'proj-1', 'user-1', 'tasks');
    expect(exportRes.filename).toContain('Project_Alpha-tasks-report-');
    expect(exportRes.csv).toContain('"Task 1"');
  });
});
