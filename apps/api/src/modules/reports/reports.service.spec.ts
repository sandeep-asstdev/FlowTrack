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

  describe('getRoleScopedDashboard()', () => {
    it('returns Admin user overview with role distribution and audit history for ADMIN role', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'admin-1',
        role: 'ADMIN',
      });

      prismaMock.membership.findMany = vi.fn().mockResolvedValue([
        { role: 'ADMIN', user: { id: 'admin-1', isActive: true, deletedAt: null } },
        { role: 'MANAGER', user: { id: 'mgr-1', isActive: true, deletedAt: null } },
        { role: 'MEMBER', user: { id: 'mem-1', isActive: true, deletedAt: null } },
        { role: 'MEMBER', user: { id: 'mem-2', isActive: false, deletedAt: null } },
      ]);

      prismaMock.team = {
        findMany: vi.fn().mockResolvedValue([
          { id: 'team-1', name: 'Engineering', colour: '#3b82f6', _count: { members: 3 } },
        ]),
      };

      prismaMock.auditLog = {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'audit-1',
            action: 'ROLE_CHANGE',
            entityName: 'Membership',
            entityId: 'mem-1',
            actor: { id: 'admin-1', fullName: 'Admin', email: 'admin@flowtrack.io', avatarUrl: null },
            createdAt: new Date(),
          },
        ]),
      };

      prismaMock.teamMember = { findMany: vi.fn().mockResolvedValue([]) };
      prismaMock.projectMember = { findMany: vi.fn().mockResolvedValue([]) };
      prismaMock.node.count = vi.fn().mockResolvedValue(0);

      const dashboard = await service.getRoleScopedDashboard('ws-1', 'admin-1');

      expect(dashboard.role).toBe('ADMIN');
      expect(dashboard.adminOverview).toBeDefined();
      expect(dashboard.adminOverview?.totalUsers).toBe(4);
      expect(dashboard.adminOverview?.activeUsers).toBe(3);
      expect(dashboard.adminOverview?.deactivatedUsers).toBe(1);
      expect(dashboard.adminOverview?.roleDistribution['ADMIN']).toBe(1);
      expect(dashboard.adminOverview?.roleDistribution['MEMBER']).toBe(2);
      expect(dashboard.adminOverview?.teamsSummary).toHaveLength(1);
      expect(dashboard.adminOverview?.recentAuditActivity).toHaveLength(1);
      expect(dashboard.adminOverview?.recentAuditActivity[0].action).toBe('ROLE_CHANGE');
    });

    it('returns Manager/Lead pending reviews and team workload for MANAGER role', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'mgr-1',
        role: 'MANAGER',
      });

      prismaMock.projectMember = {
        findMany: vi.fn().mockResolvedValue([{ projectId: 'proj-1', role: 'MANAGER' }]),
      };
      prismaMock.teamMember = {
        findMany: vi.fn().mockImplementation((args) => {
          if (args?.include) {
            return Promise.resolve([
              {
                userId: 'dev-1',
                role: 'member',
                teamId: 'team-1',
                team: { name: 'Alpha Team' },
                user: { id: 'dev-1', fullName: 'Alice Dev', email: 'alice@test.com', avatarUrl: null },
              },
            ]);
          }
          return Promise.resolve([{ teamId: 'team-1', role: 'lead' }]);
        }),
      };

      prismaMock.node.findMany.mockImplementation((args) => {
        // Pending approval queue query
        if (args?.where?.approvalStatus === 'pending') {
          return Promise.resolve([
            {
              id: 'node-review-1',
              title: 'Database Migration Script',
              projectId: 'proj-1',
              project: { name: 'Core Engine' },
              ownerId: 'dev-1',
              submitterId: 'dev-1',
              submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
              createdAt: new Date(),
              priority: 'HIGH',
              submitter: { fullName: 'Alice Dev', email: 'alice@test.com' },
              owner: { fullName: 'Alice Dev', email: 'alice@test.com' },
            },
          ]);
        }
        // Workload nodes query
        if (args?.where?.ownerId && args?.where?.ownerId?.in) {
          return Promise.resolve([
            {
              id: 'task-active',
              ownerId: 'dev-1',
              status: { category: 'active' },
              allocatedHours: 8,
              actualHours: 4,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      prismaMock.node.count = vi.fn().mockResolvedValue(1);

      const dashboard = await service.getRoleScopedDashboard('ws-1', 'mgr-1');

      expect(dashboard.role).toBe('MANAGER');
      expect(dashboard.managerWorkload).toBeDefined();
      expect(dashboard.managerWorkload?.pendingReviewCount).toBe(1);
      expect(dashboard.managerWorkload?.pendingReviews[0].title).toBe('Database Migration Script');
      expect(dashboard.managerWorkload?.teamWorkload).toHaveLength(1);
      expect(dashboard.managerWorkload?.teamWorkload[0].fullName).toBe('Alice Dev');
      expect(dashboard.managerWorkload?.teamWorkload[0].assignedTasksCount).toBe(1);
      expect(dashboard.managerWorkload?.blockedTasksCount).toBe(1);
    });

    it('returns assignee tasks and review status for MEMBER role', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'dev-1',
        role: 'MEMBER',
      });

      prismaMock.node.findMany.mockImplementation((args) => {
        if (args?.where?.ownerId === 'dev-1') {
          return Promise.resolve([
            {
              id: 'my-task-1',
              title: 'Implement OAuth Handler',
              projectId: 'proj-1',
              project: { name: 'Core Engine' },
              progressPct: 60,
              status: { key: 'In Progress', category: 'active', colour: '#3b82f6' },
              priority: 'URGENT',
              dueDate: new Date(Date.now() + 86400000),
              approvalStatus: 'not_required',
            },
          ]);
        }
        if (args?.where?.OR) {
          return Promise.resolve([
            {
              id: 'my-review-task',
              title: 'API Gateway Routing',
              projectId: 'proj-1',
              project: { name: 'Core Engine' },
              approvalStatus: 'changes_requested',
              submittedAt: new Date(),
              approvalFeedback: 'Please add request validation test cases.',
              reviewer: { fullName: 'Sarah Manager' },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const dashboard = await service.getRoleScopedDashboard('ws-1', 'dev-1');

      expect(dashboard.role).toBe('MEMBER');
      expect(dashboard.adminOverview).toBeUndefined();
      expect(dashboard.managerWorkload).toBeUndefined();
      expect(dashboard.assigneeWork).toBeDefined();
      expect(dashboard.assigneeWork?.assignedCount).toBe(1);
      expect(dashboard.assigneeWork?.myTasks[0].title).toBe('Implement OAuth Handler');
      expect(dashboard.assigneeWork?.reviewStatus.changesRequestedCount).toBe(1);
      expect(dashboard.assigneeWork?.reviewStatus.items[0].approvalFeedback).toContain('validation test cases');
    });
  });
});
