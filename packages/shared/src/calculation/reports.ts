import { STATUS_CATEGORIES } from '../constants/index.js';
import { DEFAULT_INDUSTRY_TERMINOLOGY, UniversalIndustry } from '../constants/industry.js';

export interface ReportFilterOptions {
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
  assigneeId?: string | null;
  stageId?: string | null;
  statusCategory?: string | null;
  priority?: string | null;
}

export interface NodeReportItem {
  id: string;
  title: string;
  description?: string | null;
  nodeTypeId?: string;
  nodeTypeName?: string;
  parentNodeId?: string | null;
  parentTitle?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  reviewerId?: string | null;
  reviewerName?: string | null;
  statusCategory: string;
  statusName?: string;
  progressPct: number;
  weight: number;
  priority: string;
  isMilestone: boolean;
  milestoneDueDate?: string | Date | null;
  startDate?: string | Date | null;
  dueDate?: string | Date | null;
  approvalStatus?: string | null;
  approvalFeedback?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  allocatedHours?: number | null;
  actualHours?: number | null;
  currency?: string | null;
  customData?: Record<string, any>;
  isOverdue: boolean;
  daysOverdue: number;
  daysRemaining: number;
}

export interface MilestoneReportItem {
  id: string;
  title: string;
  dueDate?: string | null;
  progressPct: number;
  statusCategory: string;
  approvalStatus?: string | null;
  ownerName?: string | null;
  isOverdue: boolean;
  daysRemaining: number;
  deliverableCount: number;
}

export interface TeamWorkloadItem {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  allocatedHours: number;
  actualHours: number;
  utilizationPct: number | null;
}

export interface CostByStageItem {
  stageId: string;
  stageName: string;
  estimated: number | null;
  actual: number | null;
  variance: number | null;
}

export interface FinancialSummaryResult {
  isConfigured: boolean;
  currencySymbol: string;
  currencyCode: string;
  approvedBudget: number | null;
  contractAmount: number | null;
  purchaseOrderAmount: number | null;
  actualExpenditure: number | null;
  forecastFinalCost: number | null; // EAC: Actual + remaining estimated
  budgetVariance: number | null; // approvedBudget - forecastFinalCost
  varianceStatus: 'favorable' | 'unfavorable' | 'neutral' | 'untracked';
  contingencyReserve: number | null;
  remainingContingency: number | null;
  physicalProgressPct: number; // strictly from task progress
  financialSpentPct: number | null; // (actual / approved) * 100
  itemsWithFinancialData: number;
  totalItems: number;
  costByStage: CostByStageItem[];
}

export interface StageReportItem {
  id: string;
  name: string;
  totalTasks: number;
  completedTasks: number;
  progressPct: number;
  isOverdue: boolean;
}

export interface UniversalDashboardMetrics {
  overview: {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    waitingBlockedTasks: number;
    overdueTasks: number;
    physicalProgressPct: number;
    milestonesTotal: number;
    milestonesCompleted: number;
    milestonesOverdue: number;
    pendingApprovalsCount: number;
  };
  milestones: MilestoneReportItem[];
  stages: StageReportItem[];
  tasks: NodeReportItem[];
  overdueList: NodeReportItem[];
  blockedList: NodeReportItem[];
  upcomingDeadlines: NodeReportItem[];
  pendingApprovals: NodeReportItem[];
  teamWorkload: TeamWorkloadItem[];
  financials: FinancialSummaryResult;
  industryTerminology: Record<string, string>;
  industry: string;
}

/**
 * Format currency amounts with proper sign, symbol, and precision.
 * Returns 'Not specified' if amount is null/undefined to avoid inventing zeros.
 */
export function formatCurrency(
  val: number | null | undefined,
  symbol: string = '$',
  code?: string
): string {
  if (val === null || val === undefined) {
    return 'Not specified';
  }
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(val);

  return `${symbol}${formatted}${code ? ` ${code}` : ''}`;
}

/**
 * Computes comprehensive universal dashboard metrics adapting to project config & industry.
 */
export function calculateUniversalDashboardMetrics(
  rawNodes: any[],
  project: any = {},
  filters: ReportFilterOptions = {},
  now: Date = new Date()
): UniversalDashboardMetrics {
  const settings = project.settings || {};
  const industry: UniversalIndustry = (settings.industry as UniversalIndustry) || 'general';
  const customTerminology = settings.terminology || {};
  const defaultTerm = DEFAULT_INDUSTRY_TERMINOLOGY[industry] || DEFAULT_INDUSTRY_TERMINOLOGY.general;
  const terminology: Record<string, string> = { ...defaultTerm, ...customTerminology };

  const currencySymbol = settings.currency?.symbol || '$';
  const currencyCode = settings.currency?.code || 'USD';

  // Apply filters
  const filteredNodes = rawNodes.filter((node) => {
    if (node.deletedAt) return false;

    // Filter by Assignee
    if (filters.assigneeId && node.ownerId !== filters.assigneeId && node.data?.ownerId !== filters.assigneeId) {
      return false;
    }

    // Filter by Status Category
    const statusCat = node.status?.category || node.data?.statusCategory || 'not_started';
    if (filters.statusCategory && statusCat !== filters.statusCategory) {
      return false;
    }

    // Filter by Priority
    const priority = node.priority || node.data?.priority || 'MEDIUM';
    if (filters.priority && priority !== filters.priority) {
      return false;
    }

    // Filter by Stage / Parent
    const parentId = node.parentNodeId || node.data?.parentNodeId;
    if (filters.stageId && parentId !== filters.stageId && node.id !== filters.stageId) {
      return false;
    }

    // Filter by Date Range
    const dueDate = node.dueDate || node.data?.dueDate;
    if (filters.dateFrom && dueDate) {
      if (new Date(dueDate).getTime() < new Date(filters.dateFrom).getTime()) {
        return false;
      }
    }
    if (filters.dateTo && dueDate) {
      if (new Date(dueDate).getTime() > new Date(filters.dateTo).getTime()) {
        return false;
      }
    }

    return true;
  });

  // Transform into enriched items
  const items: NodeReportItem[] = filteredNodes.map((n) => {
    const data = n.data || {};
    const dueDate = n.dueDate || data.dueDate || n.milestoneDueDate || data.milestoneDueDate;
    const isDone = (n.status?.category || data.statusCategory) === STATUS_CATEGORIES.DONE;
    const isCancelled = (n.status?.category || data.statusCategory) === STATUS_CATEGORIES.CANCELLED;

    let isOverdue = false;
    let daysOverdue = 0;
    let daysRemaining = 0;

    if (dueDate) {
      const dueTime = new Date(dueDate).getTime();
      const diffMs = dueTime - now.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (!isDone && !isCancelled && diffMs < 0) {
        isOverdue = true;
        daysOverdue = Math.abs(diffDays);
      } else {
        daysRemaining = Math.max(0, diffDays);
      }
    }

    const estCost = n.estimatedCost !== undefined && n.estimatedCost !== null
      ? Number(n.estimatedCost)
      : data.estimatedCost !== undefined && data.estimatedCost !== null
      ? Number(data.estimatedCost)
      : null;

    const actCost = n.actualCost !== undefined && n.actualCost !== null
      ? Number(n.actualCost)
      : data.actualCost !== undefined && data.actualCost !== null
      ? Number(data.actualCost)
      : null;

    const allocHours = n.allocatedHours !== undefined && n.allocatedHours !== null
      ? Number(n.allocatedHours)
      : data.allocatedHours !== undefined && data.allocatedHours !== null
      ? Number(data.allocatedHours)
      : null;

    const actHours = n.actualHours !== undefined && n.actualHours !== null
      ? Number(n.actualHours)
      : data.actualHours !== undefined && data.actualHours !== null
      ? Number(data.actualHours)
      : null;

    return {
      id: n.id,
      title: n.title || data.title || 'Untitled',
      description: n.description || data.description || null,
      nodeTypeId: n.nodeTypeId || data.nodeTypeId,
      nodeTypeName: n.nodeType?.name || data.nodeTypeName,
      parentNodeId: n.parentNodeId || data.parentNodeId || null,
      parentTitle: n.parentNode?.title || n.parent?.title || data.parentTitle || null,
      ownerId: n.ownerId || data.ownerId || null,
      ownerName: n.owner?.fullName || data.ownerName || (n.ownerId || data.ownerId ? 'Assigned' : 'Unassigned'),
      reviewerId: n.reviewerId || data.reviewerId || null,
      reviewerName: n.reviewer?.fullName || data.reviewerName || null,
      statusCategory: n.status?.category || data.statusCategory || 'not_started',
      statusName: n.status?.key || data.statusName || 'Not Started',
      progressPct: n.progressPct !== undefined ? n.progressPct : (data.progressPct || 0),
      weight: n.weight || data.weight || 1.0,
      priority: n.priority || data.priority || 'MEDIUM',
      isMilestone: Boolean(n.isMilestone || data.isMilestone),
      milestoneDueDate: n.milestoneDueDate || data.milestoneDueDate || null,
      startDate: n.startDate || data.startDate || null,
      dueDate: dueDate || null,
      approvalStatus: n.approvalStatus || data.approvalStatus || 'not_required',
      approvalFeedback: n.approvalFeedback || data.approvalFeedback || null,
      estimatedCost: estCost,
      actualCost: actCost,
      allocatedHours: allocHours,
      actualHours: actHours,
      currency: n.currency || data.currency || currencyCode,
      customData: n.customData || data.customData || {},
      isOverdue,
      daysOverdue,
      daysRemaining,
    };
  });

  // Calculate Overview metrics
  const totalTasks = items.length;
  const completedTasks = items.filter((i) => i.statusCategory === STATUS_CATEGORIES.DONE).length;
  const waitingBlockedTasks = items.filter((i) => i.statusCategory === STATUS_CATEGORIES.BLOCKED).length;
  const inProgressTasks = items.filter((i) => i.statusCategory === STATUS_CATEGORIES.ACTIVE).length;
  const overdueTasks = items.filter((i) => i.isOverdue).length;

  let totalWeight = 0;
  let weightedProgressSum = 0;
  items.forEach((item) => {
    const w = item.weight > 0 ? item.weight : 1.0;
    totalWeight += w;
    weightedProgressSum += (item.progressPct || 0) * w;
  });
  const physicalProgressPct = totalWeight > 0 ? Math.round(weightedProgressSum / totalWeight) : 0;

  // Milestones list
  const milestoneNodes = items.filter((i) => i.isMilestone);
  const milestones: MilestoneReportItem[] = milestoneNodes.map((m) => {
    const rawNode = rawNodes.find((rn) => rn.id === m.id);
    const deliverableCount = rawNode?.documents ? rawNode.documents.length : (rawNode?.data?.docCount || 0);

    return {
      id: m.id,
      title: m.title,
      dueDate: m.milestoneDueDate ? String(m.milestoneDueDate) : m.dueDate ? String(m.dueDate) : null,
      progressPct: m.progressPct,
      statusCategory: m.statusCategory,
      approvalStatus: m.approvalStatus,
      ownerName: m.ownerName,
      isOverdue: m.isOverdue,
      daysRemaining: m.daysRemaining,
      deliverableCount,
    };
  });
  const milestonesTotal = milestones.length;
  const milestonesCompleted = milestones.filter((m) => m.statusCategory === STATUS_CATEGORIES.DONE).length;
  const milestonesOverdue = milestones.filter((m) => m.isOverdue).length;

  // Stages breakdown: identify root nodes or parents
  const stageMap = new Map<string, { id: string; name: string; totalTasks: number; completedTasks: number; progressSum: number; overdue: boolean }>();
  items.forEach((item) => {
    const stageId = item.parentNodeId || 'ungrouped';
    const stageName = item.parentTitle || (item.parentNodeId ? 'Stage ' + item.parentNodeId.slice(0, 6) : 'Direct Tasks');

    const cur = stageMap.get(stageId) || {
      id: stageId,
      name: stageName,
      totalTasks: 0,
      completedTasks: 0,
      progressSum: 0,
      overdue: false,
    };

    cur.totalTasks += 1;
    if (item.statusCategory === STATUS_CATEGORIES.DONE) {
      cur.completedTasks += 1;
    }
    cur.progressSum += item.progressPct;
    if (item.isOverdue) cur.overdue = true;

    stageMap.set(stageId, cur);
  });

  const stages: StageReportItem[] = Array.from(stageMap.values()).map((s) => ({
    id: s.id,
    name: s.name,
    totalTasks: s.totalTasks,
    completedTasks: s.completedTasks,
    progressPct: s.totalTasks > 0 ? Math.round(s.progressSum / s.totalTasks) : 0,
    isOverdue: s.overdue,
  }));

  // Overdue and Blocked Lists
  const overdueList = items
    .filter((i) => i.isOverdue)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const blockedList = items
    .filter((i) => i.statusCategory === STATUS_CATEGORIES.BLOCKED);

  // Upcoming Deadlines (due in next 30 days)
  const upcomingDeadlines = items
    .filter((i) => !i.isOverdue && i.statusCategory !== STATUS_CATEGORIES.DONE && i.dueDate)
    .sort((a, b) => (a.daysRemaining || 0) - (b.daysRemaining || 0));

  // Pending Approvals
  const pendingApprovals = items.filter((i) => i.approvalStatus === 'pending');
  const pendingApprovalsCount = pendingApprovals.length;

  // Team Workload
  const userWorkloadMap = new Map<string, TeamWorkloadItem>();
  items.forEach((item) => {
    const uid = item.ownerId || 'unassigned';
    const uname = item.ownerName || 'Unassigned';

    const cur = userWorkloadMap.get(uid) || {
      userId: uid,
      userName: uname,
      avatarUrl: null,
      totalTasks: 0,
      openTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
      allocatedHours: 0,
      actualHours: 0,
      utilizationPct: null,
    };

    cur.totalTasks += 1;
    if (item.statusCategory === STATUS_CATEGORIES.DONE) {
      cur.completedTasks += 1;
    } else {
      cur.openTasks += 1;
      if (item.isOverdue) cur.overdueTasks += 1;
    }

    if (item.allocatedHours) cur.allocatedHours += item.allocatedHours;
    if (item.actualHours) cur.actualHours += item.actualHours;

    userWorkloadMap.set(uid, cur);
  });

  const teamWorkload = Array.from(userWorkloadMap.values()).map((w) => {
    const util = w.allocatedHours > 0 ? Math.round((w.actualHours / w.allocatedHours) * 100) : null;
    return { ...w, utilizationPct: util };
  });

  // Financial calculations
  const budgetConfig = settings.budgetConfig || {};
  const isBudgetEnabled = settings.features?.budgetTracking !== false;

  let approvedBudget: number | null = budgetConfig.approvedBudget !== undefined && budgetConfig.approvedBudget !== null
    ? Number(budgetConfig.approvedBudget)
    : null;

  let contractAmount: number | null = budgetConfig.contractAmount !== undefined && budgetConfig.contractAmount !== null
    ? Number(budgetConfig.contractAmount)
    : null;

  let purchaseOrderAmount: number | null = budgetConfig.purchaseOrderAmount !== undefined && budgetConfig.purchaseOrderAmount !== null
    ? Number(budgetConfig.purchaseOrderAmount)
    : null;

  let contingencyReserve: number | null = budgetConfig.contingencyReserve !== undefined && budgetConfig.contingencyReserve !== null
    ? Number(budgetConfig.contingencyReserve)
    : null;

  let actualExpenditureSum: number | null = null;
  let remainingEstimateSum: number | null = null;
  let itemsWithFinancialData = 0;

  const costByStageMap = new Map<string, { stageId: string; stageName: string; est: number; act: number }>();

  items.forEach((item) => {
    const hasFin = item.actualCost !== null || item.estimatedCost !== null;
    if (hasFin) itemsWithFinancialData++;

    if (typeof item.actualCost === 'number') {
      actualExpenditureSum = (actualExpenditureSum || 0) + item.actualCost;
    }

    // Remaining estimate is calculated for tasks that are not done
    if (item.statusCategory !== STATUS_CATEGORIES.DONE && typeof item.estimatedCost === 'number') {
      const remainingProgressFactor = Math.max(0, (100 - item.progressPct) / 100);
      remainingEstimateSum = (remainingEstimateSum || 0) + (item.estimatedCost * remainingProgressFactor);
    }

    // Cost by Stage
    const sId = item.parentNodeId || 'general';
    const sName = item.parentTitle || 'General / Uncategorized';
    const curStage = costByStageMap.get(sId) || { stageId: sId, stageName: sName, est: 0, act: 0 };
    if (item.estimatedCost) curStage.est += item.estimatedCost;
    if (item.actualCost) curStage.act += item.actualCost;
    costByStageMap.set(sId, curStage);
  });

  // If approvedBudget was not explicitly configured at the project level,
  // but individual nodes have estimated costs, we can roll up the baseline if items exist.
  // BUT: Do not invent values if nothing was ever entered.
  const isConfigured = isBudgetEnabled && (approvedBudget !== null || actualExpenditureSum !== null || itemsWithFinancialData > 0);

  let forecastFinalCost: number | null = null;
  if (actualExpenditureSum !== null || remainingEstimateSum !== null) {
    forecastFinalCost = (actualExpenditureSum || 0) + (remainingEstimateSum || 0);
  }

  let budgetVariance: number | null = null;
  let varianceStatus: 'favorable' | 'unfavorable' | 'neutral' | 'untracked' = 'untracked';

  if (approvedBudget !== null && forecastFinalCost !== null) {
    budgetVariance = approvedBudget - forecastFinalCost;
    if (budgetVariance > 0) {
      varianceStatus = 'favorable';
    } else if (budgetVariance < 0) {
      varianceStatus = 'unfavorable';
    } else {
      varianceStatus = 'neutral';
    }
  }

  let remainingContingency: number | null = null;
  if (contingencyReserve !== null) {
    if (budgetVariance !== null && budgetVariance < 0) {
      // unfavorable variance absorbs contingency
      remainingContingency = contingencyReserve + budgetVariance; // budgetVariance is negative
    } else {
      remainingContingency = contingencyReserve;
    }
  }

  // Strictly separate financial spent percentage from physical progress
  const financialSpentPct: number | null = (approvedBudget !== null && approvedBudget > 0 && actualExpenditureSum !== null)
    ? Math.round((actualExpenditureSum / approvedBudget) * 100)
    : null;

  const costByStage: CostByStageItem[] = Array.from(costByStageMap.values()).map((cs) => ({
    stageId: cs.stageId,
    stageName: cs.stageName,
    estimated: cs.est > 0 ? cs.est : null,
    actual: cs.act > 0 ? cs.act : null,
    variance: (cs.est > 0 && cs.act > 0) ? (cs.est - cs.act) : null,
  }));

  const financials: FinancialSummaryResult = {
    isConfigured,
    currencySymbol,
    currencyCode,
    approvedBudget,
    contractAmount,
    purchaseOrderAmount,
    actualExpenditure: actualExpenditureSum,
    forecastFinalCost,
    budgetVariance,
    varianceStatus,
    contingencyReserve,
    remainingContingency,
    physicalProgressPct,
    financialSpentPct,
    itemsWithFinancialData,
    totalItems: totalTasks,
    costByStage,
  };

  return {
    overview: {
      totalTasks,
      completedTasks,
      inProgressTasks,
      waitingBlockedTasks,
      overdueTasks,
      physicalProgressPct,
      milestonesTotal,
      milestonesCompleted,
      milestonesOverdue,
      pendingApprovalsCount,
    },
    milestones,
    stages,
    tasks: items,
    overdueList,
    blockedList,
    upcomingDeadlines,
    pendingApprovals,
    teamWorkload,
    financials,
    industryTerminology: terminology,
    industry,
  };
}

/**
 * Generate formatted CSV export string
 */
export function generateProjectCsv(
  metrics: UniversalDashboardMetrics,
  project: any = {},
  reportType: 'tasks' | 'milestones' | 'financials' | 'workload' = 'tasks'
): string {
  const terminology = metrics.industryTerminology;

  if (reportType === 'milestones') {
    const headers = [
      `"${terminology.milestone || 'Milestone'}"`,
      '"Due Date"',
      '"Progress %"',
      '"Status"',
      '"Approval Status"',
      '"Owner"',
      '"Deliverables Count"',
      '"Overdue?"',
    ];
    const rows = metrics.milestones.map((m) => [
      `"${m.title.replace(/"/g, '""')}"`,
      `"${m.dueDate || 'None'}"`,
      `${m.progressPct}%`,
      `"${m.statusCategory}"`,
      `"${m.approvalStatus || 'None'}"`,
      `"${m.ownerName || 'Unassigned'}"`,
      `${m.deliverableCount}`,
      `"${m.isOverdue ? 'YES' : 'NO'}"`,
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  if (reportType === 'financials') {
    const fin = metrics.financials;
    const summaryRows = [
      '# FINANCIAL EXECUTIVE DOSSIER',
      `"Project Name","${(project.name || 'Project').replace(/"/g, '""')}"`,
      `"Currency","${fin.currencyCode} (${fin.currencySymbol})"`,
      `"Approved Budget Baseline","${fin.approvedBudget !== null ? fin.approvedBudget : 'Not specified'}"`,
      `"Contract / PO Amount","${fin.contractAmount !== null ? fin.contractAmount : 'Not specified'}"`,
      `"Actual Incurred Expenditure","${fin.actualExpenditure !== null ? fin.actualExpenditure : 'Not specified'}"`,
      `"Forecast Final Cost (Estimate - EAC)","${fin.forecastFinalCost !== null ? fin.forecastFinalCost : 'Not specified'}"`,
      `"Budget Variance","${fin.budgetVariance !== null ? fin.budgetVariance : 'Not specified'}"`,
      `"Variance Status","${fin.varianceStatus.toUpperCase()}"`,
      `"Physical Progress %","${fin.physicalProgressPct}%"`,
      `"Financial Spend %","${fin.financialSpentPct !== null ? `${fin.financialSpentPct}%` : 'Not tracked'}"`,
      '',
      '# STAGE BUDGET BREAKDOWN',
      '"Stage / Work Package","Estimated Budget","Actual Spend","Variance"',
      ...fin.costByStage.map((s) =>
        `"${s.stageName.replace(/"/g, '""')}","${s.estimated !== null ? s.estimated : 'N/A'}","${s.actual !== null ? s.actual : 'N/A'}","${s.variance !== null ? s.variance : 'N/A'}"`
      ),
    ];
    return summaryRows.join('\n');
  }

  if (reportType === 'workload') {
    const headers = [
      '"Team Member"',
      '"Total Assigned"',
      '"Open Tasks"',
      '"Completed Tasks"',
      '"Overdue Tasks"',
      '"Allocated Hours"',
      '"Actual Hours Logged"',
      '"Utilization %"',
    ];
    const rows = metrics.teamWorkload.map((w) => [
      `"${w.userName.replace(/"/g, '""')}"`,
      `${w.totalTasks}`,
      `${w.openTasks}`,
      `${w.completedTasks}`,
      `${w.overdueTasks}`,
      `${w.allocatedHours}`,
      `${w.actualHours}`,
      `"${w.utilizationPct !== null ? `${w.utilizationPct}%` : 'N/A'}"`,
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  // Default: Tasks report
  const headers = [
    `"${terminology.task || 'Task'} Title"`,
    `"${terminology.stage || 'Stage'}"`,
    '"Status"',
    '"Physical Progress %"',
    '"Priority"',
    '"Owner"',
    '"Due Date"',
    '"Overdue?"',
    '"Days Overdue"',
    '"Approval Status"',
    '"Estimated Cost (Budget)"',
    '"Actual Cost (Incurred)"',
    '"Allocated Hours"',
    '"Actual Hours"',
  ];

  const allNodes = metrics.tasks && metrics.tasks.length > 0
    ? metrics.tasks
    : [
        ...metrics.overdueList,
        ...metrics.upcomingDeadlines,
        ...metrics.pendingApprovals,
      ];
  // Deduplicate by id
  const seen = new Set<string>();
  const uniqueItems: NodeReportItem[] = [];
  allNodes.forEach((n) => {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      uniqueItems.push(n);
    }
  });

  const rows = uniqueItems.map((item) => [
    `"${item.title.replace(/"/g, '""')}"`,
    `"${(item.parentTitle || 'General').replace(/"/g, '""')}"`,
    `"${item.statusName || item.statusCategory}"`,
    `${item.progressPct}%`,
    `"${item.priority}"`,
    `"${item.ownerName || 'Unassigned'}"`,
    `"${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'None'}"`,
    `"${item.isOverdue ? 'YES' : 'NO'}"`,
    `${item.daysOverdue}`,
    `"${item.approvalStatus || 'None'}"`,
    `"${item.estimatedCost !== null ? item.estimatedCost : 'Not specified'}"`,
    `"${item.actualCost !== null ? item.actualCost : 'Not specified'}"`,
    `"${item.allocatedHours !== null ? item.allocatedHours : 'N/A'}"`,
    `"${item.actualHours !== null ? item.actualHours : 'N/A'}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
