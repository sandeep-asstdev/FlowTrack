import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { ApiClient } from '../../services/api';
import {
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Shield,
  AlertTriangle,
  FolderKanban,
  Users,
  Search,
  MessageSquare,
  FileText,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PendingTask {
  id: string;
  title: string;
  description?: string;
  projectId: string;
  workspaceId: string;
  approvalStatus: string;
  submittedAt?: string;
  submitterId?: string;
  submitter?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string;
  };
  ownerId?: string;
  owner?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string;
  };
  teamId?: string;
  team?: {
    id: string;
    name: string;
    color?: string;
  };
  project?: {
    id: string;
    name: string;
  };
  approvals?: Array<{
    id: string;
    decision: 'approved' | 'rejected';
    feedback?: string;
    decidedAt: string;
    reviewer?: {
      id: string;
      fullName: string;
      email: string;
    };
  }>;
  remarks?: Array<{
    id: string;
    body: string;
    createdAt: string;
    author?: {
      id: string;
      fullName: string;
    };
  }>;
}

export const ReviewQueueView: React.FC = () => {
  const { user, activeWorkspaceId, getActiveRole } = useAuthStore();
  const currentRole = getActiveRole();
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedHistories, setExpandedHistories] = useState<Record<string, boolean>>({});

  // View Tab: Queue vs Team Workload
  const [viewTab, setViewTab] = useState<'queue' | 'workload'>('queue');
  const [workloadData, setWorkloadData] = useState<any>(null);
  const [loadingWorkload, setLoadingWorkload] = useState(false);

  // Decision Modal State
  const [activeModal, setActiveModal] = useState<{
    task: PendingTask;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ApiClient.getReviewQueue({
        workspaceId: activeWorkspaceId || undefined,
      });
      setTasks(data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkload = async () => {
    if (!activeWorkspaceId) return;
    try {
      setLoadingWorkload(true);
      const res = await ApiClient.getRoleDashboard(activeWorkspaceId);
      setWorkloadData(res?.managerWorkload || null);
    } catch (err: any) {
      console.error('Failed to load team workload:', err);
    } finally {
      setLoadingWorkload(false);
    }
  };

  useEffect(() => {
    if (activeWorkspaceId) {
      fetchQueue();
      if (viewTab === 'workload') {
        fetchWorkload();
      }
    }
  }, [activeWorkspaceId, viewTab]);

  const toggleHistory = (taskId: string) => {
    setExpandedHistories((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const handleOpenDecision = (task: PendingTask, decision: 'approved' | 'rejected') => {
    setActiveModal({ task, decision });
    setFeedback(decision === 'approved' ? 'Deliverables inspected and verified.' : '');
    setActionError(null);
  };

  const handleSubmitDecision = async () => {
    if (!activeModal) return;
    if (activeModal.decision === 'rejected' && !feedback.trim()) {
      setActionError('A reason or comment is required when requesting changes or rejecting.');
      return;
    }

    try {
      setSubmitting(true);
      setActionError(null);
      await ApiClient.approveTask(activeModal.task.id, {
        decision: activeModal.decision,
        feedback: feedback.trim() || undefined,
      });

      setActionSuccess(
        activeModal.decision === 'approved'
          ? `Task "${activeModal.task.title}" has been approved!`
          : `Changes requested on task "${activeModal.task.title}".`
      );

      // Remove approved/rejected task from pending list
      setTasks((prev) => prev.filter((t) => t.id !== activeModal.task.id));
      setActiveModal(null);
      setFeedback('');

      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to submit review decision');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.project?.name?.toLowerCase().includes(q) ||
      t.submitter?.fullName?.toLowerCase().includes(q) ||
      t.owner?.fullName?.toLowerCase().includes(q) ||
      t.team?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  Review & Approval Queue
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                    {filteredTasks.length} Pending
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Tasks and deliverables awaiting review gate sign-off from authorized Managers and Team Leads.
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={fetchQueue}
            disabled={loading}
            className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Queue
          </button>
        </div>

        {/* Platform Admin Notification Banner */}
        {currentRole === 'ADMIN' && (
          <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-xs flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Platform Admin Policy Note:</span> Platform Admins oversee user
              accounts and platform policies, but are strictly prohibited from approving or rejecting tasks.
              Only designated Managers and Team Leads within their assigned scope may approve work.
            </div>
          </div>
        )}

        {/* Success Alert */}
        {actionSuccess && (
          <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 font-bold animate-fadeIn">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {actionSuccess}
          </div>
        )}

        {/* Global Error Alert */}
        {error && (
          <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            {error}
          </div>
        )}

        {/* Navigation Tabs (Review Queue vs Team Workload & Capacity) */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            onClick={() => setViewTab('queue')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              viewTab === 'queue'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            Review Queue ({filteredTasks.length})
          </button>
          <button
            onClick={() => {
              setViewTab('workload');
              fetchWorkload();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              viewTab === 'workload'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Team Workload & Capacity
          </button>
        </div>

        {viewTab === 'workload' ? (
          <div className="space-y-6">
            {loadingWorkload ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
                  ))}
                </div>
                <div className="h-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
              </div>
            ) : !workloadData ? (
              <div className="text-center py-12 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No workload data available for this workspace or managed scope.
                </p>
              </div>
            ) : (
              <>
                {/* Workload Summary KPI Cards */}
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Scoped Members</span>
                    <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">
                      {workloadData.teamMembers?.length || 0}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[11px] font-bold text-blue-500 uppercase tracking-wider block">Active Tasks</span>
                    <span className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 block">
                      {workloadData.totalActiveTasks ?? 0}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wider block">Overdue Tasks</span>
                    <span className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 block">
                      {workloadData.totalOverdueTasks ?? 0}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wider block">Active Blockers</span>
                    <span className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">
                      {workloadData.totalBlockedTasks ?? 0}
                    </span>
                  </div>
                </div>

                {/* Team Members Workload Breakdown */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Member Workload & Resource Capacity
                  </h3>

                  {(!workloadData.teamMembers || workloadData.teamMembers.length === 0) ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                      No team members found in your managed scope.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {workloadData.teamMembers.map((member: any) => {
                        const allocated = member.allocatedHours || 0;
                        const actual = member.actualHours || 0;
                        const utilizationPct = allocated > 0 ? Math.min(Math.round((actual / allocated) * 100), 100) : 0;

                        return (
                          <div
                            key={member.userId}
                            className="p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/20 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-xs">
                                  {member.fullName?.charAt(0) || 'U'}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                                      {member.fullName}
                                    </h4>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                      {member.role}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{member.email}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-xs font-bold">
                                <div className="text-center px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Active</span>
                                  <span className="text-blue-600 dark:text-blue-400">{member.activeTasks}</span>
                                </div>
                                <div className="text-center px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Completed</span>
                                  <span className="text-emerald-600 dark:text-emerald-400">{member.completedTasks}</span>
                                </div>
                                <div className="text-center px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Overdue</span>
                                  <span className={member.overdueTasks > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-400"}>
                                    {member.overdueTasks}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Hours and Capacity Bar */}
                            <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                              <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                                Hours Logged: <span className="font-bold text-slate-800 dark:text-slate-200">{actual} hrs</span> / Allocated: <span className="font-bold text-slate-800 dark:text-slate-200">{allocated} hrs</span>
                              </div>
                              <div className="w-full sm:w-48 bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    utilizationPct > 90 ? 'bg-rose-500' : utilizationPct > 70 ? 'bg-amber-500' : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${utilizationPct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter pending reviews by task title, project, submitter, or team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

        {/* Queue List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-32 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
              />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              No tasks currently pending review
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              All tasks submitted in your authorized scope have been reviewed. When team members submit work for review, it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => {
              const hasApprovals = task.approvals && task.approvals.length > 0;
              const isExpanded = expandedHistories[task.id];
              const latestRemark = task.remarks?.[0];

              return (
                <div
                  key={task.id}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow space-y-4"
                >
                  {/* Top Row: Meta badges & Project info */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        <Clock className="w-3.5 h-3.5" />
                        Pending Approval
                      </span>
                      {task.project && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                          <FolderKanban className="w-3.5 h-3.5" />
                          {task.project.name}
                        </span>
                      )}
                      {task.team && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-900">
                          <Users className="w-3.5 h-3.5" />
                          {task.team.name}
                        </span>
                      )}
                    </div>
                    {task.submittedAt && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Submitted on {new Date(task.submittedAt).toLocaleDateString()} at{' '}
                        {new Date(task.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {/* Task Title & Description */}
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                      {task.title}
                    </h2>
                    {task.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {/* People: Submitter and Assignee */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold text-xs">
                        {task.submitter?.avatarUrl ? (
                          <img
                            src={task.submitter.avatarUrl}
                            alt=""
                            className="w-full h-full rounded-lg object-cover"
                          />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Submitter</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {task.submitter?.fullName || 'Unknown Submitter'}
                        </div>
                        <div className="text-[10px] text-slate-400">{task.submitter?.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-600/10 text-purple-600 flex items-center justify-center font-bold text-xs">
                        {task.owner?.avatarUrl ? (
                          <img
                            src={task.owner.avatarUrl}
                            alt=""
                            className="w-full h-full rounded-lg object-cover"
                          />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Assigned To</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {task.owner?.fullName || 'Unassigned'}
                        </div>
                        <div className="text-[10px] text-slate-400">{task.owner?.email}</div>
                      </div>
                    </div>
                  </div>

                  {/* Submitter Note / Evidence */}
                  {latestRemark && (
                    <div className="p-3 rounded-xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 text-xs space-y-1">
                      <div className="font-bold text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Submission Evidence / Notes:
                      </div>
                      <div className="text-slate-700 dark:text-slate-300 text-xs whitespace-pre-wrap">
                        {latestRemark.body}
                      </div>
                    </div>
                  )}

                  {/* Previous Review Cycles Accordion */}
                  {hasApprovals && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                      <button
                        onClick={() => toggleHistory(task.id)}
                        className="flex items-center justify-between w-full text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                          Previous Review Decisions ({task.approvals?.length})
                        </span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-2 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                          {task.approvals?.map((app) => (
                            <div
                              key={app.id}
                              className="text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    app.decision === 'approved'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  }`}
                                >
                                  {app.decision === 'approved' ? 'Approved' : 'Changes Requested'}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(app.decidedAt).toLocaleDateString()} by{' '}
                                  {app.reviewer?.fullName || 'Reviewer'}
                                </span>
                              </div>
                              {app.feedback && (
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 italic">
                                  "{app.feedback}"
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review Action Buttons */}
                  <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 sm:gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => handleOpenDecision(task, 'rejected')}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors shadow-sm w-full xs:w-auto"
                    >
                      <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      Request Changes / Reject
                    </button>
                    <button
                      onClick={() => handleOpenDecision(task, 'approved')}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20 w-full xs:w-auto"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve Deliverables
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    )}
  </div>

      {/* Decision Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  activeModal.decision === 'approved'
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                    : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                }`}
              >
                {activeModal.decision === 'approved' ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <XCircle className="w-6 h-6" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {activeModal.decision === 'approved' ? 'Approve Task Deliverables' : 'Request Changes on Task'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 break-words-safe">{activeModal.task.title}</p>
              </div>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-bold">
                {actionError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {activeModal.decision === 'approved'
                  ? 'Approval Notes & Feedback (Optional)'
                  : 'Reason / Changes Requested (Required)'}
                {activeModal.decision === 'rejected' && <span className="text-rose-500 ml-1">*</span>}
              </label>
              <textarea
                rows={4}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={
                  activeModal.decision === 'approved'
                    ? 'E.g. Verified test reports and staging deployment. Approved.'
                    : 'Please detail specific issues or acceptance criteria that must be satisfied before resubmitting...'
                }
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {activeModal.decision === 'rejected' && (
                <p className="text-[11px] text-slate-400 mt-1">
                  A specific explanation is mandatory so the assignee understands required modifications.
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={submitting}
                className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors w-full xs:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitDecision}
                disabled={submitting || (activeModal.decision === 'rejected' && !feedback.trim())}
                className={`px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-white transition-colors shadow-sm ${
                  activeModal.decision === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                } disabled:opacity-50 disabled:cursor-not-allowed w-full xs:w-auto flex items-center justify-center`}
              >
                {submitting
                  ? 'Recording Decision...'
                  : activeModal.decision === 'approved'
                  ? 'Confirm Approval'
                  : 'Submit Changes Requested'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
