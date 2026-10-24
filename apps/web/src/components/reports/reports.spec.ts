import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../services/api';

describe('Universal Dashboard & Reporting Frontend Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('queries project reports with appropriate filter payloads', async () => {
    const mockReport = {
      overview: {
        totalTasks: 10,
        completedTasks: 5,
        inProgressTasks: 3,
        waitingBlockedTasks: 1,
        overdueTasks: 1,
        physicalProgressPct: 50,
        milestonesTotal: 3,
        milestonesCompleted: 1,
        milestonesOverdue: 0,
        pendingApprovalsCount: 2,
      },
      milestones: [],
      stages: [],
      overdueList: [],
      blockedList: [],
      upcomingDeadlines: [],
      pendingApprovals: [],
      teamWorkload: [],
      financials: {
        isConfigured: true,
        currencySymbol: '$',
        currencyCode: 'USD',
        approvedBudget: 100000,
        contractAmount: 90000,
        actualExpenditure: 45000,
        forecastFinalCost: 85000,
        budgetVariance: 15000,
        varianceStatus: 'favorable',
        contingencyReserve: 10000,
        remainingContingency: 10000,
        physicalProgressPct: 50,
        financialSpentPct: 45,
        itemsWithFinancialData: 5,
        totalItems: 10,
        costByStage: [],
      },
      industryTerminology: {
        stage: 'Phase / Work Package',
        task: 'Construction Task',
        milestone: 'Key Handover Milestone',
      },
      industry: 'construction_real_estate',
    };

    ApiClient.setActiveWorkspaceId('ws-test');
    const spy = vi.spyOn(ApiClient, 'request').mockResolvedValue(mockReport);

    const result = await ApiClient.getProjectReport('proj-123', {
      statusCategory: 'active',
      priority: 'HIGH',
    });

    expect(spy).toHaveBeenCalledWith(
      '/workspaces/ws-test/reports/project/proj-123?statusCategory=active&priority=HIGH'
    );
    expect(result.industry).toBe('construction_real_estate');
    expect(result.financials.budgetVariance).toBe(15000);
    expect(result.overview.physicalProgressPct).toBe(50);
  });

  it('retrieves workspace report overview for the logged-in user', async () => {
    ApiClient.setActiveWorkspaceId('ws-test');
    const spy = vi.spyOn(ApiClient, 'request').mockResolvedValue({
      projectsSummary: { totalProjects: 3, activeProjects: 2 },
      myWork: { assignedCount: 7, overdueCount: 1 },
      pendingReviews: [],
    });

    const result = await ApiClient.getWorkspaceReport();
    expect(spy).toHaveBeenCalledWith('/workspaces/ws-test/reports/workspace');
    expect(result.myWork.assignedCount).toBe(7);
    expect(result.myWork.overdueCount).toBe(1);
  });
});
