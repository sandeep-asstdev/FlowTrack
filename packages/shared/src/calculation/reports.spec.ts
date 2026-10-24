import { describe, it, expect } from 'vitest';
import {
  calculateUniversalDashboardMetrics,
  generateProjectCsv,
  formatCurrency,
} from './reports.js';

describe('Universal Reports and Dashboard Calculations', () => {
  const mockNow = new Date('2026-10-24T12:00:00Z');

  describe('Construction Project Scenario', () => {
    const constructionProject = {
      id: 'proj-const-1',
      name: 'Downtown Commercial High-Rise',
      settings: {
        industry: 'construction_real_estate',
        currency: { code: 'USD', symbol: '$' },
        features: { budgetTracking: true },
        budgetConfig: {
          approvedBudget: 500000,
          contractAmount: 480000,
          contingencyReserve: 50000,
        },
      },
    };

    const constructionNodes = [
      {
        id: 'stage-1',
        title: 'Foundation & Substructure',
        nodeTypeId: 'stage-type',
        parentNodeId: null,
        isMilestone: false,
        status: { category: 'done' },
        progressPct: 100,
        weight: 2.0,
        estimatedCost: 100000,
        actualCost: 95000,
      },
      {
        id: 'task-1',
        title: 'Pour Concrete Footings',
        parentNodeId: 'stage-1',
        isMilestone: false,
        status: { category: 'done' },
        progressPct: 100,
        weight: 1.0,
        estimatedCost: 50000,
        actualCost: 48000,
        ownerId: 'user-contractor',
        owner: { fullName: 'Bob Builder' },
      },
      {
        id: 'milestone-1',
        title: 'Substructure Handover Sign-off',
        parentNodeId: 'stage-1',
        isMilestone: true,
        milestoneDueDate: '2026-10-20T00:00:00Z', // past due date, but completed
        status: { category: 'done' },
        progressPct: 100,
        weight: 1.0,
        approvalStatus: 'approved',
        estimatedCost: 0,
        actualCost: 0,
      },
      {
        id: 'stage-2',
        title: 'Superstructure Framing',
        nodeTypeId: 'stage-type',
        parentNodeId: null,
        isMilestone: false,
        status: { category: 'active' },
        progressPct: 50,
        weight: 3.0,
        estimatedCost: 200000,
        actualCost: 120000,
      },
      {
        id: 'task-2',
        title: 'Steel Column Erection',
        parentNodeId: 'stage-2',
        isMilestone: false,
        status: { category: 'blocked' },
        progressPct: 30,
        weight: 1.5,
        estimatedCost: 100000,
        actualCost: 40000,
        dueDate: '2026-10-22T00:00:00Z', // past due & blocked -> overdue
        approvalFeedback: 'Delayed awaiting steel beam shipment inspection',
        ownerId: 'user-contractor',
        owner: { fullName: 'Bob Builder' },
      },
      {
        id: 'milestone-2',
        title: 'Structural Topping Out Milestone',
        parentNodeId: 'stage-2',
        isMilestone: true,
        milestoneDueDate: '2026-11-15T00:00:00Z', // future
        status: { category: 'active' },
        progressPct: 20,
        weight: 1.0,
        approvalStatus: 'pending',
      },
    ];

    it('adapts industry terminology for construction', () => {
      const metrics = calculateUniversalDashboardMetrics(
        constructionNodes,
        constructionProject,
        {},
        mockNow
      );

      expect(metrics.industry).toBe('construction_real_estate');
      expect(metrics.industryTerminology.stage).toBe('Phase / Work Package');
      expect(metrics.industryTerminology.task).toBe('Construction Task');
      expect(metrics.industryTerminology.milestone).toBe('Key Handover Milestone');
    });

    it('calculates physical progress strictly from task weights and completion', () => {
      const metrics = calculateUniversalDashboardMetrics(
        constructionNodes,
        constructionProject,
        {},
        mockNow
      );

      expect(metrics.overview.totalTasks).toBe(6);
      expect(metrics.overview.completedTasks).toBe(3);
      expect(metrics.overview.waitingBlockedTasks).toBe(1);
      expect(metrics.overview.overdueTasks).toBe(1); // task-2 is blocked and past due
      expect(metrics.overview.physicalProgressPct).toBeGreaterThan(0);
      expect(metrics.overview.physicalProgressPct).toBeLessThan(100);
    });

    it('calculates financial variance, forecast final cost (EAC), and keeps physical vs financial spend separate', () => {
      const metrics = calculateUniversalDashboardMetrics(
        constructionNodes,
        constructionProject,
        {},
        mockNow
      );

      const fin = metrics.financials;
      expect(fin.isConfigured).toBe(true);
      expect(fin.approvedBudget).toBe(500000);
      expect(fin.contractAmount).toBe(480000);
      expect(fin.contingencyReserve).toBe(50000);

      // Actual expenditure sum: 95000 + 48000 + 0 + 120000 + 40000 = 303,000
      expect(fin.actualExpenditure).toBe(303000);

      // Forecast final cost (EAC = Actual + remaining estimated on incomplete items)
      // incomplete: stage-2 (50% remaining of 200k = 100k), task-2 (70% remaining of 100k = 70k)
      expect(fin.forecastFinalCost).toBeGreaterThan(fin.actualExpenditure!);

      // Budget variance: approvedBudget - forecastFinalCost
      expect(fin.budgetVariance).toBe(fin.approvedBudget! - fin.forecastFinalCost!);

      // Crucial requirement: Physical progress % != Financial spent %
      expect(fin.financialSpentPct).toBe(Math.round((303000 / 500000) * 100)); // 61%
      expect(fin.physicalProgressPct).not.toBe(fin.financialSpentPct);
    });

    it('identifies root cause blockers and overdue critical path items', () => {
      const metrics = calculateUniversalDashboardMetrics(
        constructionNodes,
        constructionProject,
        {},
        mockNow
      );

      expect(metrics.blockedList.length).toBe(1);
      expect(metrics.blockedList[0].id).toBe('task-2');
      expect(metrics.blockedList[0].approvalFeedback).toContain('steel beam');

      expect(metrics.overdueList.length).toBe(1);
      expect(metrics.overdueList[0].id).toBe('task-2');
      expect(metrics.overdueList[0].daysOverdue).toBe(2);
    });
  });

  describe('Education & Academics Scenario (No Budget Tracked)', () => {
    const educationProject = {
      id: 'proj-edu-1',
      name: 'Medical School Accreditation 2026',
      settings: {
        industry: 'education_academics',
        currency: { code: 'EUR', symbol: '€' },
        features: { budgetTracking: false },
        budgetConfig: {}, // no budget defined
      },
    };

    const educationNodes = [
      {
        id: 'edu-stage-1',
        title: 'Curriculum Review & Standards',
        isMilestone: false,
        status: { category: 'done' },
        progressPct: 100,
        weight: 1.0,
      },
      {
        id: 'edu-milestone-1',
        title: 'Preliminary Accreditation Dossier Submission',
        isMilestone: true,
        milestoneDueDate: '2026-11-01T00:00:00Z',
        status: { category: 'active' },
        progressPct: 80,
        weight: 1.0,
        approvalStatus: 'pending',
        owner: { fullName: 'Dr. Aris Thorne' },
      },
      {
        id: 'edu-task-1',
        title: 'Faculty Credential Verification',
        isMilestone: false,
        dueDate: '2026-10-30T00:00:00Z',
        status: { category: 'active' },
        progressPct: 60,
        weight: 1.0,
        owner: { fullName: 'Dr. Aris Thorne' },
      },
    ];

    it('adapts industry terminology for education', () => {
      const metrics = calculateUniversalDashboardMetrics(
        educationNodes,
        educationProject,
        {},
        mockNow
      );

      expect(metrics.industry).toBe('education_academics');
      expect(metrics.industryTerminology.stage).toBe('Academic Phase');
      expect(metrics.industryTerminology.task).toBe('Curricular / Admin Task');
      expect(metrics.industryTerminology.milestone).toBe('Accreditation Milestone');
    });

    it('never invents financial data or silently defaults missing values to zero', () => {
      const metrics = calculateUniversalDashboardMetrics(
        educationNodes,
        educationProject,
        {},
        mockNow
      );

      const fin = metrics.financials;
      expect(fin.isConfigured).toBe(false);
      expect(fin.approvedBudget).toBeNull();
      expect(fin.actualExpenditure).toBeNull();
      expect(fin.forecastFinalCost).toBeNull();
      expect(fin.budgetVariance).toBeNull();
      expect(fin.financialSpentPct).toBeNull();
      expect(fin.varianceStatus).toBe('untracked');
    });

    it('tracks accreditation milestones and pending approvals', () => {
      const metrics = calculateUniversalDashboardMetrics(
        educationNodes,
        educationProject,
        {},
        mockNow
      );

      expect(metrics.milestones.length).toBe(1);
      expect(metrics.milestones[0].title).toBe('Preliminary Accreditation Dossier Submission');
      expect(metrics.milestones[0].daysRemaining).toBe(8);
      expect(metrics.pendingApprovals.length).toBe(1);
      expect(metrics.pendingApprovals[0].id).toBe('edu-milestone-1');
    });
  });

  describe('Filtering and Aggregations', () => {
    const mixedNodes = [
      {
        id: 'n1',
        title: 'Task A',
        ownerId: 'user-alice',
        status: { category: 'active' },
        priority: 'HIGH',
        dueDate: '2026-10-25T00:00:00Z',
        progressPct: 50,
      },
      {
        id: 'n2',
        title: 'Task B',
        ownerId: 'user-bob',
        status: { category: 'done' },
        priority: 'LOW',
        dueDate: '2026-10-20T00:00:00Z',
        progressPct: 100,
      },
    ];

    it('filters by assignee', () => {
      const metrics = calculateUniversalDashboardMetrics(
        mixedNodes,
        {},
        { assigneeId: 'user-alice' },
        mockNow
      );
      expect(metrics.overview.totalTasks).toBe(1);
      expect(metrics.teamWorkload.length).toBe(1);
      expect(metrics.teamWorkload[0].userId).toBe('user-alice');
    });

    it('filters by status category', () => {
      const metrics = calculateUniversalDashboardMetrics(
        mixedNodes,
        {},
        { statusCategory: 'done' },
        mockNow
      );
      expect(metrics.overview.totalTasks).toBe(1);
      expect(metrics.overview.completedTasks).toBe(1);
    });

    it('filters by date range', () => {
      const metrics = calculateUniversalDashboardMetrics(
        mixedNodes,
        {},
        { dateFrom: '2026-10-22T00:00:00Z' },
        mockNow
      );
      expect(metrics.overview.totalTasks).toBe(1);
      expect(metrics.overview.inProgressTasks).toBe(1);
    });
  });

  describe('CSV Generation & Currency Formatting', () => {
    it('generates well-formed CSV for financial dossier', () => {
      const metrics = calculateUniversalDashboardMetrics(
        [],
        {
          name: 'Bridge Project',
          settings: {
            budgetConfig: { approvedBudget: 1000000 },
            currency: { code: 'USD', symbol: '$' },
          },
        },
        {},
        mockNow
      );

      const csv = generateProjectCsv(metrics, { name: 'Bridge Project' }, 'financials');
      expect(csv).toContain('# FINANCIAL EXECUTIVE DOSSIER');
      expect(csv).toContain('Approved Budget Baseline');
      expect(csv).toContain('1000000');
    });

    it('formats currency correctly without false zeroes', () => {
      expect(formatCurrency(null)).toBe('Not specified');
      expect(formatCurrency(undefined)).toBe('Not specified');
      expect(formatCurrency(125000, '$', 'USD')).toContain('$125,000 USD');
      expect(formatCurrency(0, '€')).toContain('€0');
    });
  });
});
