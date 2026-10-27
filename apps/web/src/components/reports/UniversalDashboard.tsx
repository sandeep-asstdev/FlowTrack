import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Users,
  ShieldAlert,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Check,
  Building2,
  GraduationCap,
  Stethoscope,
  Briefcase,
  Sparkles,
  Info,
} from 'lucide-react';
import { ApiClient } from '../../services/api';
import { UniversalDashboardMetrics, formatCurrency } from '@flowtrack/shared';

interface UniversalDashboardProps {
  projectId: string;
  project?: any;
  nodes?: any[];
  onClose?: () => void;
  isModal?: boolean;
}

export const UniversalDashboard: React.FC<UniversalDashboardProps> = ({
  projectId,
  project,
  nodes = [],
  onClose,
  isModal = false,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'milestones' | 'financials' | 'workload' | 'blockers' | 'approvals'>('overview');
  const [metrics, setMetrics] = useState<UniversalDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '14d' | '30d' | 'overdue'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);

  // Fetch report data from API
  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const filterPayload: any = {};
      if (statusFilter !== 'all') filterPayload.statusCategory = statusFilter;
      if (priorityFilter !== 'all') filterPayload.priority = priorityFilter;
      if (assigneeFilter !== 'all') filterPayload.assigneeId = assigneeFilter;

      const now = new Date();
      if (dateFilter === '7d') {
        const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        filterPayload.dateTo = next7.toISOString();
      } else if (dateFilter === '14d') {
        const next14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        filterPayload.dateTo = next14.toISOString();
      } else if (dateFilter === '30d') {
        const next30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        filterPayload.dateTo = next30.toISOString();
      }

      const res = await ApiClient.getProjectReport(projectId, filterPayload);
      setMetrics(res);
    } catch (err: any) {
      console.error('Failed to load project report:', err);
      setError(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchReport();
    }
  }, [projectId, dateFilter, statusFilter, priorityFilter, assigneeFilter]);

  const handleExportCsv = async (type: 'tasks' | 'milestones' | 'financials' | 'workload') => {
    try {
      setIsExporting(true);
      await ApiClient.downloadProjectReportCsv(projectId, type);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const terminology = metrics?.industryTerminology || {
    stage: 'Stage',
    task: 'Task',
    subtask: 'Subtask',
    milestone: 'Milestone',
    owner: 'Owner',
    approver: 'Approver',
  };

  const industryIcon = () => {
    const ind = metrics?.industry || project?.settings?.industry || 'general';
    switch (ind) {
      case 'construction_real_estate':
        return <Building2 className="w-4 h-4 text-amber-500" />;
      case 'education_academics':
        return <GraduationCap className="w-4 h-4 text-emerald-500" />;
      case 'healthcare_hospital':
        return <Stethoscope className="w-4 h-4 text-rose-500" />;
      default:
        return <Briefcase className="w-4 h-4 text-blue-500" />;
    }
  };

  const fin = metrics?.financials;

  const content = (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {industryIcon()}
              <span className="capitalize">
                {(metrics?.industry || project?.settings?.industry || 'General').replace(/_/g, ' ')}
              </span>
            </span>
            <span className="text-xs text-slate-400">
              Live Synchronized • Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white break-words-safe">
            {project?.name || 'Project'} Dashboard & Intelligence
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words-safe">
            Universal adaptive reporting with physical progress and financial variance separation
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* CSV Export Dropdown */}
          <div className="relative group">
            <button
              id="report-export-csv-btn"
              disabled={isExporting || loading}
              className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-200 dark:border-slate-700"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1.5 z-50 hidden group-hover:block animate-in fade-in duration-100">
              <button
                onClick={() => handleExportCsv('tasks')}
                className="w-full px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
              >
                <span>{terminology.task} Tasks Dossier</span>
              </button>
              <button
                onClick={() => handleExportCsv('milestones')}
                className="w-full px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
              >
                <span>{terminology.milestone} Milestones</span>
              </button>
              {fin?.isConfigured && (
                <button
                  onClick={() => handleExportCsv('financials')}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>Financial Variance & Budget</span>
                </button>
              )}
              <button
                onClick={() => handleExportCsv('workload')}
                className="w-full px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
              >
                <span>Team Workload Allocation</span>
              </button>
            </div>
          </div>

          {/* Print Button */}
          <button
            id="report-print-btn"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-200 dark:border-slate-700"
            title="Print-friendly view / save as PDF"
          >
            <Printer className="w-3.5 h-3.5 text-blue-500" />
            <span>Print Dossier</span>
          </button>

          {isModal && onClose && (
            <button
              onClick={onClose}
              className="px-3.5 py-2.5 min-h-[44px] bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold rounded-xl transition-all"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs & Filter Bar */}
      <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {[
            { id: 'overview', label: 'Executive Overview', icon: BarChart3 },
            { id: 'milestones', label: `${terminology.milestone || 'Milestone'} Roadmap`, icon: TrendingUp },
            { id: 'financials', label: 'Budget & Financials', icon: DollarSign, badge: fin?.isConfigured ? 'Active' : 'Optional' },
            { id: 'workload', label: 'Team Workload', icon: Users },
            { id: 'blockers', label: 'Overdue & Blocked', icon: AlertTriangle, count: (metrics?.overview.overdueTasks || 0) + (metrics?.overview.waitingBlockedTasks || 0) },
            { id: 'approvals', label: 'Pending Approvals', icon: CheckCircle2, count: metrics?.overview.pendingApprovalsCount || 0 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isSelected
                        ? 'bg-white text-blue-600'
                        : 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.badge && !isSelected && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden xs:inline" />
          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            aria-label="Filter report by date range"
            className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer flex-1 xs:flex-none"
          >
            <option value="all">All Dates</option>
            <option value="7d">Next 7 Days</option>
            <option value="14d">Next 14 Days</option>
            <option value="30d">Next 30 Days</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter report by status category"
            className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer flex-1 xs:flex-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">In Progress / Active</option>
            <option value="blocked">Waiting / Blocked</option>
            <option value="done">Completed</option>
          </select>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm font-medium">Aggregating project intelligence...</p>
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300">
            <h3 className="font-bold text-sm mb-1">Failed to load report</h3>
            <p className="text-xs">{error}</p>
          </div>
        ) : !metrics ? null : (
          <>
            {/* TAB 1: EXECUTIVE OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* KPI Summary Cards */}
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3.5">
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Total {terminology.task}s
                    </span>
                    <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                      {metrics.overview.totalTasks}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Across {metrics.stages.length} {terminology.stage}s
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                      Completed
                    </span>
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                      {metrics.overview.completedTasks}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {metrics.overview.totalTasks > 0
                        ? `${Math.round((metrics.overview.completedTasks / metrics.overview.totalTasks) * 100)}% of items closed`
                        : 'No tasks'}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                      In Progress
                    </span>
                    <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                      {metrics.overview.inProgressTasks}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Active execution</div>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                      Blocked / Waiting
                    </span>
                    <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                      {metrics.overview.waitingBlockedTasks}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Needs attention</div>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                    <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                      Overdue
                    </span>
                    <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                      {metrics.overview.overdueTasks}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Past deadline</div>
                  </div>
                </div>

                {/* Progress & Milestone Health Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Physical Progress Card */}
                  <div className="md:col-span-2 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Physical Completion Index
                        </div>
                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                          {metrics.overview.physicalProgressPct}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-3.5 rounded-full overflow-hidden p-0.5">
                        <div
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${metrics.overview.physicalProgressPct}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        Derived strictly from task completion weights and node progress. Strictly separated from financial expenditure.
                      </p>
                    </div>

                    {/* Quick stage cards */}
                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">
                        {terminology.stage} Completion Breakdown
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {metrics.stages.map((st) => (
                          <div
                            key={st.id}
                            className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50"
                          >
                            <div className="flex items-center justify-between text-xs font-bold mb-1">
                              <span className="truncate max-w-[140px] text-slate-800 dark:text-slate-200">{st.name}</span>
                              <span className="text-blue-600">{st.progressPct}%</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-blue-500 h-full rounded-full"
                                style={{ width: `${st.progressPct}%` }}
                              ></div>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                              <span>{st.completedTasks}/{st.totalTasks} Done</span>
                              {st.isOverdue && <span className="text-rose-500 font-bold">Overdue</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Milestones Card */}
                  <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          {terminology.milestone} Health
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                          {metrics.overview.milestonesCompleted}/{metrics.overview.milestonesTotal} Reached
                        </span>
                      </div>

                      {metrics.milestones.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No milestones defined for this project.</p>
                      ) : (
                        <div className="space-y-3">
                          {metrics.milestones.slice(0, 4).map((m) => (
                            <div
                              key={m.id}
                              className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                  {m.title}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" />
                                  <span>{m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'No date'}</span>
                                  {m.deliverableCount > 0 && (
                                    <span>• {m.deliverableCount} evidence doc(s)</span>
                                  )}
                                </div>
                              </div>
                              <span
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                                  m.statusCategory === 'done'
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : m.isOverdue
                                    ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                    : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                }`}
                              >
                                {m.statusCategory === 'done' ? 'Met' : m.isOverdue ? 'Overdue' : `${m.daysRemaining}d left`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setActiveTab('milestones')}
                      className="mt-4 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline text-left"
                    >
                      View all {metrics.overview.milestonesTotal} {terminology.milestone}s →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: MILESTONES & DEADLINES */}
            {activeTab === 'milestones' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">
                    {terminology.milestone} Delivery Roadmap
                  </h2>
                  <p className="text-xs text-slate-500 mb-6">
                    Key compliance checkpoints, handover gates, and accreditation targets
                  </p>

                  {metrics.milestones.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      No milestones created yet in this project.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {metrics.milestones.map((m) => (
                        <div
                          key={m.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            m.statusCategory === 'done'
                              ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10'
                              : m.isOverdue
                              ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/10'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                    m.statusCategory === 'done'
                                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                      : m.isOverdue
                                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                      : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                  }`}
                                >
                                  {m.statusCategory === 'done' ? 'Achieved' : m.isOverdue ? 'Overdue' : 'Active Gate'}
                                </span>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                  {m.title}
                                </h3>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                                <span>Target: {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'None'}</span>
                                <span>Owner: {m.ownerName || 'Unassigned'}</span>
                                {m.approvalStatus && (
                                  <span className="capitalize">Approval: {m.approvalStatus}</span>
                                )}
                                <span>Evidence: {m.deliverableCount} files</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {m.progressPct}% Complete
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {m.statusCategory === 'done' ? 'Verified' : `${m.daysRemaining} days remaining`}
                                </div>
                              </div>
                              <div className="w-20 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    m.statusCategory === 'done' ? 'bg-emerald-500' : 'bg-blue-600'
                                  }`}
                                  style={{ width: `${m.progressPct}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Upcoming Deadlines */}
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-4">
                    Upcoming Deadlines (Next 30 Days)
                  </h2>
                  {metrics.upcomingDeadlines.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No upcoming deadlines within the next 30 days.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {metrics.upcomingDeadlines.slice(0, 10).map((t) => (
                        <div key={t.id} className="py-3 flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">{t.title}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {t.parentTitle || 'General'} • Assigned to {t.ownerName || 'Unassigned'}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                              Due {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : ''}
                            </span>
                            <div className="text-[10px] text-slate-400">in {t.daysRemaining} days</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: BUDGET & FINANCIAL VARIANCE */}
            {activeTab === 'financials' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {!fin?.isConfigured ? (
                  <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center max-w-xl mx-auto my-12">
                    <Info className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Financial Tracking Not Configured
                    </h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      This project currently operates with task & progress tracking only. Financial tracking is optional and has not been enabled or configured with a budget baseline. Missing financial amounts are never assumed to be zero.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Financial Metric Cards */}
                    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3.5">
                      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Approved Budget
                        </span>
                        <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                          {formatCurrency(fin.approvedBudget, fin.currencySymbol, fin.currencyCode)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">Baseline allocation</div>
                      </div>

                      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                          Actual Spend
                        </span>
                        <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">
                          {formatCurrency(fin.actualExpenditure, fin.currencySymbol, fin.currencyCode)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {fin.financialSpentPct !== null ? `${fin.financialSpentPct}% of budget` : 'Untracked'}
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                            Forecast Cost
                          </span>
                          <span className="text-[9px] px-1 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-extrabold">
                            Estimate
                          </span>
                        </div>
                        <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                          {formatCurrency(fin.forecastFinalCost, fin.currencySymbol, fin.currencyCode)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">Estimate at Completion (EAC)</div>
                      </div>

                      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            fin.varianceStatus === 'favorable'
                              ? 'text-emerald-600'
                              : fin.varianceStatus === 'unfavorable'
                              ? 'text-rose-600'
                              : 'text-slate-400'
                          }`}
                        >
                          Budget Variance
                        </span>
                        <div
                          className={`text-xl font-black mt-1 flex items-center gap-1 ${
                            fin.varianceStatus === 'favorable'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : fin.varianceStatus === 'unfavorable'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {fin.budgetVariance !== null && fin.budgetVariance > 0 && <ArrowUpRight className="w-4 h-4" />}
                          {fin.budgetVariance !== null && fin.budgetVariance < 0 && <ArrowDownRight className="w-4 h-4" />}
                          {formatCurrency(fin.budgetVariance, fin.currencySymbol, fin.currencyCode)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 capitalize">
                          {fin.varianceStatus}
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                          Contingency Reserve
                        </span>
                        <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
                          {formatCurrency(fin.remainingContingency, fin.currencySymbol, fin.currencyCode)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">Buffer remaining</div>
                      </div>
                    </div>

                    {/* Physical Completion vs Financial Spend Gauge */}
                    <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-1">
                        Physical Task Progress vs. Financial Expenditure
                      </h3>
                      <p className="text-xs text-slate-500 mb-6">
                        Strictly independent tracking: money spent does not automatically imply completed work.
                      </p>

                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                            <span className="text-blue-600 dark:text-blue-400">Physical Work Progress</span>
                            <span>{fin.physicalProgressPct}%</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                            <div
                              className="bg-blue-600 h-full rounded-full transition-all duration-500"
                              style={{ width: `${fin.physicalProgressPct}%` }}
                            ></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                            <span className="text-indigo-600 dark:text-indigo-400">Budget Spent Ratio</span>
                            <span>{fin.financialSpentPct !== null ? `${fin.financialSpentPct}%` : 'Not tracked'}</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                              style={{ width: `${fin.financialSpentPct || 0}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stage Cost Breakdown Table */}
                    <div className="p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-4">
                        {terminology.stage} Financial Breakdown
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[460px] text-xs text-left">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                              <th className="pb-3">{terminology.stage} / Work Package</th>
                              <th className="pb-3">Estimated Budget</th>
                              <th className="pb-3">Actual Spent</th>
                              <th className="pb-3">Variance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                            {fin.costByStage.map((s) => (
                              <tr key={s.stageId}>
                                <td className="py-3 font-bold text-slate-800 dark:text-slate-200">{s.stageName}</td>
                                <td className="py-3">{formatCurrency(s.estimated, fin.currencySymbol, fin.currencyCode)}</td>
                                <td className="py-3">{formatCurrency(s.actual, fin.currencySymbol, fin.currencyCode)}</td>
                                <td
                                  className={`py-3 font-bold ${
                                    s.variance !== null && s.variance >= 0
                                      ? 'text-emerald-600'
                                      : s.variance !== null
                                      ? 'text-rose-600'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {formatCurrency(s.variance, fin.currencySymbol, fin.currencyCode)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 4: TEAM WORKLOAD */}
            {activeTab === 'workload' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">
                    Team Member Allocation & Capacity
                  </h2>
                  <p className="text-xs text-slate-500 mb-6">
                    Distribution of active {terminology.task}s, overdue items, and logged hours
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {metrics.teamWorkload.map((w) => (
                      <div
                        key={w.userId}
                        className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">{w.userName}</span>
                          {w.overdueTasks > 0 && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-300">
                              {w.overdueTasks} Overdue
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                          <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div className="text-[10px] text-slate-400">Total</div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">{w.totalTasks}</div>
                          </div>
                          <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div className="text-[10px] text-slate-400">Open</div>
                            <div className="font-bold text-blue-600">{w.openTasks}</div>
                          </div>
                          <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div className="text-[10px] text-slate-400">Done</div>
                            <div className="font-bold text-emerald-600">{w.completedTasks}</div>
                          </div>
                        </div>

                        {w.allocatedHours > 0 && (
                          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
                            <span>Hours: {w.actualHours} / {w.allocatedHours} hrs</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {w.utilizationPct !== null ? `${w.utilizationPct}%` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: OVERDUE & BLOCKED WORK */}
            {activeTab === 'blockers' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Blocked Items */}
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>Waiting & Blocked Work ({metrics.blockedList.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Items paused due to dependency bottlenecks, supply issues, or required approvals
                  </p>

                  {metrics.blockedList.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No blocked items! All workstreams are moving freely.</p>
                  ) : (
                    <div className="space-y-3">
                      {metrics.blockedList.map((item) => (
                        <div
                          key={item.id}
                          className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/20"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-xs text-slate-900 dark:text-white">{item.title}</h3>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 uppercase">
                              Blocked
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            {item.approvalFeedback || 'Awaiting resolution of external prerequisite.'}
                          </p>
                          <div className="text-[10px] text-slate-400 mt-2 flex items-center gap-4">
                            <span>Assignee: {item.ownerName || 'Unassigned'}</span>
                            <span>Stage: {item.parentTitle || 'General'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Overdue Items */}
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-rose-500" />
                    <span>Past-Due Overdue Tasks ({metrics.overdueList.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Tasks that have exceeded their target completion date
                  </p>

                  {metrics.overdueList.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Zero overdue tasks! Project is currently on schedule.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {metrics.overdueList.map((item) => (
                        <div key={item.id} className="py-3 flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.parentTitle || 'General'} • Owner: {item.ownerName || 'Unassigned'}
                            </div>
                          </div>
                          <span className="text-xs font-extrabold text-rose-600 dark:text-rose-400">
                            {item.daysOverdue} days past due
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 6: PENDING APPROVALS */}
            {activeTab === 'approvals' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">
                    Pending Sign-offs & Approvals ({metrics.pendingApprovals.length})
                  </h2>
                  <p className="text-xs text-slate-500 mb-6">
                    Deliverables, work packages, or deadline extension requests awaiting managerial authorization
                  </p>

                  {metrics.pendingApprovals.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No tasks currently pending review or approval.</p>
                  ) : (
                    <div className="space-y-3">
                      {metrics.pendingApprovals.map((item) => (
                        <div
                          key={item.id}
                          className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <h3 className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</h3>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Submitted by {item.ownerName || 'Assignee'} • Reviewer: {item.reviewerName || 'Project Manager'}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                            Awaiting Decision
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[90] flex items-center justify-center p-2 sm:p-4 md:p-8 animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl max-w-6xl w-full max-h-[calc(100dvh-1.5rem)] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 h-full flex-1 flex flex-col">{content}</div>;
};
