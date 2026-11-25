import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  FolderKanban,
  ExternalLink,
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  FileText,
  Calendar,
  AlertCircle,
  Users,
  Check,
  TrendingUp,
} from 'lucide-react';
import { ApiClient } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { RoleScopedDashboardResponse } from '@flowtrack/shared';

interface MyWorkViewProps {
  onSelectProject?: (projectId: string) => void;
}

export const MyWorkView: React.FC<MyWorkViewProps> = ({ onSelectProject }) => {
  const { user, activeWorkspaceId } = useAuthStore();
  const [data, setData] = useState<RoleScopedDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tasks' | 'approvals-for-me' | 'my-requests' | 'reviews' | 'team'>('tasks');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'overdue' | 'done'>('all');
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      setError(null);
      const res = await ApiClient.getRoleDashboard(activeWorkspaceId);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load task dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const assigneeWork = data?.assigneeWork;
  const managerWorkload = data?.managerWorkload;
  const hasManagerAccess = Boolean(managerWorkload && (data?.role === 'ADMIN' || data?.role === 'MANAGER' || data?.role === 'TEAM_LEAD'));

  const handleQuickComplete = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setUpdatingTaskId(taskId);
    try {
      await ApiClient.updateNode(taskId, { progressPct: 100 });
      await loadDashboard();
    } catch (err: any) {
      console.error('Failed to mark task as completed:', err);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const filteredTasks = (assigneeWork?.myTasks || []).filter((task) => {
    const matchesSearch =
      !searchQuery ||
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.projectName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;

    let matchesStatus = true;
    if (filterStatus === 'active') {
      matchesStatus = task.statusCategory !== 'done';
    } else if (filterStatus === 'overdue') {
      matchesStatus = Boolean(task.isOverdue);
    } else if (filterStatus === 'done') {
      matchesStatus = task.statusCategory === 'done';
    }

    return matchesSearch && matchesPriority && matchesStatus;
  });

  const reviewItems = assigneeWork?.reviewStatus?.items || [];
  const pendingReviewsForMe = managerWorkload?.pendingReviews || [];
  const pendingMyRequests = reviewItems.filter((r) => r.approvalStatus === 'pending');
  const pendingReviewsForMeCount = managerWorkload?.pendingReviewCount ?? 0;
  const pendingMyRequestsCount = assigneeWork?.reviewStatus?.pendingCount ?? 0;
  const decidedMyRequests = reviewItems.filter(
    (r) => r.approvalStatus === 'approved' || r.approvalStatus === 'rejected' || r.approvalStatus === 'changes_requested'
  );

  const changesRequested = reviewItems.filter(
    (r) => r.approvalStatus === 'rejected' || r.approvalStatus === 'changes_requested'
  );
  const approvedTasks = reviewItems.filter((r) => r.approvalStatus === 'approved');

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-semibold">Loading your tasks & review status...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-6 pb-28 sm:pb-36 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>My Tasks & Reviews</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {data?.role || 'MEMBER'}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track your assigned deliverables, review milestones, and approval sign-offs
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshing(true);
            fetchDashboard();
          }}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-400'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <button
          onClick={() => {
            setActiveTab('tasks');
            setFilterStatus('active');
          }}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all ${
            activeTab === 'tasks' && filterStatus === 'active'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Tasks</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {assigneeWork?.assignedCount || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">Assigned to you</div>
        </button>

        <button
          onClick={() => setActiveTab('approvals-for-me')}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all ${
            activeTab === 'approvals-for-me'
              ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20 dark:bg-amber-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm'
          }`}
        >
          <div className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">Approvals for Me</div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {pendingReviewsForMeCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">Awaiting your decision</div>
        </button>

        <button
          onClick={() => setActiveTab('my-requests')}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all ${
            activeTab === 'my-requests'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm'
          }`}
        >
          <div className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">My Requests</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {pendingMyRequestsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">Waiting on others</div>
        </button>

        <button
          onClick={() => {
            setActiveTab('tasks');
            setFilterStatus('overdue');
          }}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all ${
            activeTab === 'tasks' && filterStatus === 'overdue'
              ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm'
          }`}
        >
          <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Overdue Tasks</div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
            {assigneeWork?.overdueCount || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">Needs immediate action</div>
        </button>
      </div>

      {/* Changes Requested High-Priority Banner */}
      {changesRequested.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 shadow-sm">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold text-sm mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Attention: Rework Requested on {changesRequested.length} Task(s)</span>
          </div>
          <div className="space-y-2 mt-2">
            {changesRequested.map((task) => (
              <div
                key={task.id}
                className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200/80 dark:border-amber-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{task.title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {task.projectName}
                    </span>
                  </div>
                  {task.approvalFeedback && (
                    <p className="text-slate-600 dark:text-slate-300 mt-1 italic">
                      &quot;{task.approvalFeedback}&quot;
                      {task.reviewerName && <span className="font-semibold text-slate-400"> — {task.reviewerName}</span>}
                    </p>
                  )}
                </div>

                {onSelectProject && (
                  <button
                    onClick={() => onSelectProject(task.projectId)}
                    className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <span>Revise Task</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decisions on my requests Dashboard Section */}
      {decidedMyRequests.length > 0 && activeTab === 'tasks' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Decisions on my requests</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                {decidedMyRequests.length}
              </span>
            </h3>
            <button
              onClick={() => setActiveTab('my-requests')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              View all
            </button>
          </div>
          <div className="space-y-2">
            {decidedMyRequests.slice(0, 3).map((item) => {
              const isApproved = item.approvalStatus === 'approved';
              const isRejected = item.approvalStatus === 'rejected';
              return (
                <div
                  key={item.id}
                  className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200/80 dark:border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{item.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        {item.projectName}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                      <span>Decided by: <strong className="text-slate-700 dark:text-slate-200">{item.reviewerName || 'Approver'}</strong></span>
                      {item.approvalFeedback && (
                        <span>— &quot;{item.approvalFeedback}&quot;</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isApproved
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : isRejected
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Changes Requested'}
                    </span>
                    {onSelectProject && item.projectId && (
                      <button
                        onClick={() => onSelectProject(item.projectId)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${
            activeTab === 'tasks'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          My Tasks ({assigneeWork?.assignedCount || 0})
        </button>

        <button
          onClick={() => setActiveTab('approvals-for-me')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'approvals-for-me'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>Approvals for Me</span>
          {pendingReviewsForMe.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeTab === 'approvals-for-me' ? 'bg-white text-blue-700' : 'bg-amber-500 text-white'
              }`}
            >
              {pendingReviewsForMeCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('my-requests')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'my-requests'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>My Requests Waiting on Others</span>
          {pendingMyRequests.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeTab === 'my-requests' ? 'bg-white text-blue-700' : 'bg-blue-500 text-white'
              }`}
            >
              {pendingMyRequestsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reviews')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${
            activeTab === 'reviews'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Review History ({reviewItems.length})
        </button>

        {hasManagerAccess && (
          <button
            onClick={() => setActiveTab('team')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'team'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Workload ({managerWorkload?.teamWorkload?.length || 0})</span>
          </button>
        )}
      </div>

      {/* Tab 1: My Tasks */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 sm:max-w-xs w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search my tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {(['all', 'active', 'overdue', 'done'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                      filterStatus === st
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {st === 'done' ? 'Completed' : st}
                  </button>
                ))}
              </div>

              {/* Priority Select */}
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                aria-label="Filter tasks by priority"
                className="px-3 py-2 min-h-[44px] text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {searchQuery || filterStatus !== 'all' || filterPriority !== 'all'
                  ? 'No tasks match your search or filter'
                  : 'No active tasks assigned to you'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {searchQuery || filterStatus !== 'all' || filterPriority !== 'all'
                  ? 'Try clearing your search query or switching filters.'
                  : 'When an Admin or Manager assigns a task to you, or when you create a deliverable, it will appear here.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTasks.map((task) => {
                const isTaskDone = task.statusCategory === 'done' || task.progressPct === 100;
                return (
                  <div
                    key={task.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-600 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate max-w-[150px]">
                          {task.projectName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                              task.priority === 'URGENT'
                                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                                : task.priority === 'HIGH'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {task.priority}
                          </span>
                          {isTaskDone && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              DONE
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 break-words-safe">
                        {task.title}
                      </h3>

                      {/* Assigned By & State Indicators */}
                      <div className="mt-2.5 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            Assigned by:{' '}
                            <strong className="text-slate-700 dark:text-slate-200 font-semibold">
                              {task.assignedByName || (task.assignedById ? 'Manager' : 'Self-assigned')}
                            </strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-400">State:</span>
                          <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {task.approvalStatus === 'approved' || task.state === 'Approved'
                              ? 'Approved'
                              : task.approvalStatus === 'changes_requested' || task.state === 'Changes Requested'
                              ? 'Changes Requested'
                              : task.approvalStatus === 'rejected' || task.state === 'Rejected'
                              ? 'Rejected'
                              : task.approvalStatus === 'pending' || task.state === 'In Review'
                              ? 'In Review'
                              : task.state || task.statusKey || 'Draft'}
                          </span>
                        </div>
                      </div>

                      {/* Factual Status Indicator */}
                      <div className="mt-3 flex items-center justify-between text-[11px] font-semibold">
                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            task.approvalStatus === 'approved' || task.state === 'Approved'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : task.approvalStatus === 'changes_requested' || task.state === 'Changes Requested'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : task.approvalStatus === 'rejected' || task.state === 'Rejected'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : task.approvalStatus === 'pending' || task.state === 'In Review'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : isTaskDone
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          }`}
                        >
                          {task.approvalStatus === 'approved' || task.state === 'Approved'
                            ? 'Approved'
                            : task.approvalStatus === 'changes_requested' || task.state === 'Changes Requested'
                            ? 'Changes Requested'
                            : task.approvalStatus === 'rejected' || task.state === 'Rejected'
                            ? 'Rejected'
                            : task.approvalStatus === 'pending' || task.state === 'In Review'
                            ? 'In Review'
                            : task.statusKey || (isTaskDone ? 'Done' : 'Active')}
                        </span>
                        {task.isOverdue && !isTaskDone && (
                          <span className="text-[10px] text-rose-500 font-bold">Overdue</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span
                          className={`font-medium ${
                            task.isOverdue
                              ? 'text-red-600 font-bold dark:text-red-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isTaskDone && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickComplete(task.id, e)}
                            disabled={updatingTaskId === task.id}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center gap-1"
                            title="Mark as 100% complete"
                          >
                            <Check className="w-3 h-3" />
                            <span>Done</span>
                          </button>
                        )}

                        {onSelectProject && (
                          <button
                            onClick={() => onSelectProject(task.projectId)}
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold flex items-center gap-1 text-[11px] min-h-[36px] sm:min-h-[44px]"
                          >
                            <span>Open Canvas</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Approvals Waiting for My Decision */}
      {activeTab === 'approvals-for-me' && (
        <div className="space-y-4">
          {pendingReviewsForMe.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                No approvals waiting for your decision
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                When team members request your sign-off or approval on a deliverable, requests will appear here for your review.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingReviewsForMe.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between hover:border-amber-400 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate max-w-[150px]">
                        {item.projectName}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Waiting for Your Decision
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 break-words-safe">
                      {item.title}
                    </h3>

                    <div className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                      <p>
                        Requested by:{' '}
                        <strong className="text-slate-700 dark:text-slate-200 font-semibold">
                          {item.submitterName}
                        </strong>
                      </p>
                      {item.submittedAt && (
                        <p className="text-[11px] text-slate-400">
                          Submitted {new Date(item.submittedAt).toLocaleDateString()} ({item.daysPending}d ago)
                        </p>
                      )}
                    </div>

                    {item.reason && (
                      <div className="mt-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Reason:</span>
                        <p className="text-slate-700 dark:text-slate-300 line-clamp-3 whitespace-pre-wrap">{item.reason}</p>
                      </div>
                    )}

                    <div className="mt-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Attached Files:</span>
                      {Array.isArray(item.documents) && item.documents.length > 0 ? (
                        <div className="space-y-1">
                          {item.documents.map((doc: any) => (
                            <div key={doc.id} className="flex items-center justify-between gap-1 text-[11px]">
                              <span className="text-slate-700 dark:text-slate-300 truncate" title={doc.name}>{doc.name}</span>
                              <a
                                href={ApiClient.getDocumentDownloadUrl(item.id, doc.id)}
                                download={doc.name}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:text-blue-700 font-semibold shrink-0"
                              >
                                Download
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic">No files attached</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Pending Sign-off</span>
                    </span>
                    {onSelectProject && item.projectId && (
                      <button
                        onClick={() => onSelectProject(item.projectId)}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold flex items-center gap-1 text-xs"
                      >
                        <span>Open Canvas</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: My Requests Waiting on Others & Decisions */}
      {activeTab === 'my-requests' && (
        <div className="space-y-6">
          {/* Section: Pending Requests */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>Pending Requests Waiting on Others ({pendingMyRequests.length})</span>
            </h3>

            {pendingMyRequests.length === 0 ? (
              <div className="text-center py-8 px-4 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  No requests waiting on others
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  When you submit a deliverable for approval or sign-off, you can track the approver&apos;s progress and decision here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingMyRequests.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {item.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {item.projectName}
                        </span>
                      </div>

                      <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Waiting for {item.reviewerName || 'Approver'}</span>
                      </div>

                      {item.submittedAt && (
                        <p className="text-[11px] text-slate-400">
                          Submitted: {new Date(item.submittedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Pending Decision</span>
                      </span>

                      {onSelectProject && item.projectId && (
                        <button
                          onClick={() => onSelectProject(item.projectId)}
                          className="px-3 py-1 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1"
                        >
                          <span>Open Canvas</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Decisions on my requests */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Decisions on my requests ({decidedMyRequests.length})</span>
            </h3>

            {decidedMyRequests.length === 0 ? (
              <div className="text-center py-8 px-4 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
                <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                <p className="font-bold text-slate-700 dark:text-slate-300">No decisions on your requests yet</p>
                <p className="text-slate-400 mt-1">Once an approver reviews your request, their decision and comments will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {decidedMyRequests.map((item) => {
                  const isApproved = item.approvalStatus === 'approved';
                  const isRejected = item.approvalStatus === 'rejected';
                  const isChanges = item.approvalStatus === 'changes_requested';

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {item.title}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {item.projectName}
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Decided by: <strong>{item.reviewerName || 'Approver'}</strong>
                        </div>

                        {item.approvalFeedback && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 italic">
                            Reason: &quot;{item.approvalFeedback}&quot;
                          </p>
                        )}

                        <div className="text-[11px] text-slate-400 flex items-center gap-3">
                          {item.submittedAt && (
                            <span>Submitted: {new Date(item.submittedAt).toLocaleDateString()}</span>
                          )}
                          {item.approvedAt && (
                            <span>Decided: {new Date(item.approvedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isApproved && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Approved</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Rejected</span>
                          </span>
                        )}
                        {isChanges && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Changes Requested</span>
                          </span>
                        )}

                        {onSelectProject && item.projectId && (
                          <button
                            onClick={() => onSelectProject(item.projectId)}
                            className="px-3 py-1 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1"
                          >
                            <span>Open Canvas</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Review Cycles */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {reviewItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <FileText className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No review records</p>
              <p className="text-xs text-slate-400 mt-1">When tasks are submitted for review, their status will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviewItems.map((item) => {
                const isApproved = item.approvalStatus === 'approved';
                const isRejected = item.approvalStatus === 'rejected';
                const isChanges = item.approvalStatus === 'changes_requested';
                const isPending = item.approvalStatus === 'pending';

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {item.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {item.projectName}
                        </span>
                      </div>

                      {item.approvalFeedback && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 italic">
                          Feedback: &quot;{item.approvalFeedback}&quot;
                        </p>
                      )}

                      <div className="text-[11px] text-slate-400 flex items-center gap-3">
                        {item.submittedAt && (
                          <span>Submitted: {new Date(item.submittedAt).toLocaleDateString()}</span>
                        )}
                        {item.reviewerName && (
                          <span>Reviewer: {item.reviewerName}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {isApproved && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approved</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending Review</span>
                        </span>
                      )}
                      {(isChanges || isRejected) && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{isChanges ? 'Changes Requested' : 'Rejected'}</span>
                        </span>
                      )}

                      {onSelectProject && (
                        <button
                          onClick={() => onSelectProject(item.projectId)}
                          className="px-3 py-1 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        >
                          View Task
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Team Workload (Manager & Admin View) */}
      {activeTab === 'team' && hasManagerAccess && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              Team Member Workload & Capacity
            </h3>
            {managerWorkload?.blockedTasksCount ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>{managerWorkload.blockedTasksCount} Blocked Tasks Across Team</span>
              </span>
            ) : null}
          </div>

          {!managerWorkload?.teamWorkload || managerWorkload.teamWorkload.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Users className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No team workload records</p>
              <p className="text-xs text-slate-400 mt-1">Assign tasks to team members to track team workload and progress.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {managerWorkload.teamWorkload.map((member) => (
                <div
                  key={member.userId}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {member.fullName}
                      </h4>
                      <p className="text-xs text-slate-400">{member.email}</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                      {member.role || 'Member'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <div className="text-[10px] font-semibold text-slate-400">Active</div>
                      <div className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">
                        {member.assignedTasksCount}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <div className="text-[10px] font-semibold text-emerald-500">Done</div>
                      <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {member.completedTasksCount}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <div className="text-[10px] font-semibold text-rose-500">Overdue</div>
                      <div className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5">
                        {member.overdueTasksCount}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                    <span>Allocated: {member.allocatedHours}h</span>
                    <span>Actual: {member.actualHours}h</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
