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
  const [activeTab, setActiveTab] = useState<'tasks' | 'reviews'>('tasks');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');

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

  const filteredTasks = (assigneeWork?.myTasks || []).filter((task) => {
    const matchesSearch =
      !searchQuery ||
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.projectName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
    return matchesSearch && matchesPriority;
  });

  const reviewItems = assigneeWork?.reviewStatus?.items || [];

  const changesRequested = reviewItems.filter(
    (r) => r.approvalStatus === 'rejected' || r.approvalStatus === 'changes_requested'
  );
  const pendingApprovals = reviewItems.filter((r) => r.approvalStatus === 'pending');
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
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
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
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Tasks</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {assigneeWork?.assignedCount || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Assigned to you</div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">Overdue Tasks</div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {assigneeWork?.overdueCount || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Requires immediate attention</div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">In Review</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {assigneeWork?.reviewStatus?.pendingCount || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Awaiting sign-off</div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Changes Requested</div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
            {assigneeWork?.reviewStatus?.changesRequestedCount || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Needs rework / feedback</div>
        </div>
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

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'tasks'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          My Tasks ({assigneeWork?.assignedCount || 0})
        </button>
        <button
          onClick={() => setActiveTab('reviews')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'reviews'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Review Cycles ({reviewItems.length})
        </button>
      </div>

      {/* Tab 1: My Tasks */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search my tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto text-xs font-medium">
              <span className="text-slate-400">Priority:</span>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
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
            <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No active tasks assigned to you</p>
              <p className="text-xs text-slate-400 mt-1">You are all caught up on deliverables!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-600 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {task.projectName}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          task.priority === 'URGENT'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                            : task.priority === 'HIGH'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2">
                      {task.title}
                    </h3>

                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                        <span>{task.statusKey}</span>
                        <span>{Math.round(task.progressPct)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, task.progressPct))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
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

                    {onSelectProject && (
                      <button
                        onClick={() => onSelectProject(task.projectId)}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold flex items-center gap-1 text-[11px]"
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
    </div>
  );
};
