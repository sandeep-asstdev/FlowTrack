import React from 'react';
import {
  Zap,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Layers,
  X,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { CpmResult } from '@flowtrack/shared';

interface CriticalPathPanelProps {
  isOpen: boolean;
  onClose: () => void;
  cpmResult: CpmResult | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onFocusNode?: (nodeId: string) => void;
  projectDeadline?: string;
}

export const CriticalPathPanel: React.FC<CriticalPathPanelProps> = ({
  isOpen,
  onClose,
  cpmResult,
  loading,
  error,
  onRefresh,
  onFocusNode,
  projectDeadline,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 w-96 max-w-[calc(100vw-2rem)] max-h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
      role="region"
      aria-label="Critical Path Analysis Summary"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              Critical Path Analysis
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                CPM
              </span>
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Calendar days (inclusive convention)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Recalculate CPM"
            aria-label="Recalculate critical path"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close summary"
            aria-label="Close critical path panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
        {loading && !cpmResult ? (
          <div className="py-8 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-rose-500" />
            <p className="text-xs font-medium">Calculating critical path schedule...</p>
          </div>
        ) : error ? (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>CPM Validation Error</span>
            </div>
            <p className="text-[11px] leading-relaxed">{error}</p>
          </div>
        ) : cpmResult ? (
          <>
            {/* Project Schedule Overview Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
                  <Calendar className="w-3 h-3 text-blue-500" />
                  Planned Start
                </div>
                <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {cpmResult.projectStartDate || '—'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3 text-purple-500" />
                  Projected Finish
                </div>
                <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {cpmResult.projectedFinishDate || '—'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
                  <TrendingUp className="w-3 h-3 text-emerald-500" />
                  Duration
                </div>
                <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {cpmResult.totalDurationDays} {cpmResult.totalDurationDays === 1 ? 'day' : 'days'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40">
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1 mb-1">
                  <Zap className="w-3 h-3 fill-rose-500" />
                  Critical Tasks
                </div>
                <div className="font-extrabold text-sm text-rose-700 dark:text-rose-300">
                  {cpmResult.criticalTaskCount} / {cpmResult.tasks.length}
                </div>
              </div>
            </div>

            {/* Deadline Comparison / Risk Banner */}
            {cpmResult.deadlineSlackDays !== undefined && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                  cpmResult.deadlineSlackDays >= 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {cpmResult.deadlineSlackDays >= 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-[11px]">
                      {cpmResult.deadlineSlackDays >= 0
                        ? `On Track (${cpmResult.deadlineSlackDays}d buffer)`
                        : `Projected Overdue by ${Math.abs(cpmResult.deadlineSlackDays)}d`}
                    </div>
                    {projectDeadline && (
                      <div className="text-[10px] opacity-75">
                        Target deadline: {projectDeadline.slice(0, 10)}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/60 dark:bg-black/20">
                  {cpmResult.deadlineSlackDays >= 0 ? 'Safe' : 'At Risk'}
                </span>
              </div>
            )}

            {/* Task Slack Breakdown */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Schedule Flexibility
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {cpmResult.slackTaskCount} {cpmResult.slackTaskCount === 1 ? 'task' : 'tasks'} with float &gt; 0
              </span>
            </div>

            {/* Critical Path Sequence */}
            <div>
              <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                <span>Critical Path Sequence</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  Zero Float Chain
                </span>
              </div>

              {cpmResult.criticalPathTitles.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-slate-400 text-xs">
                  No dependency path established yet
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {cpmResult.criticalPathIds.map((taskId, idx) => {
                    const task = cpmResult.tasks.find((t) => t.id === taskId);
                    const title = task?.title || taskId;
                    const duration = task?.durationDays || 1;
                    return (
                      <div
                        key={taskId}
                        onClick={() => onFocusNode && onFocusNode(taskId)}
                        className="group flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-rose-400 dark:hover:border-rose-500 hover:shadow-xs transition-all cursor-pointer"
                        title="Click to locate on canvas"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-extrabold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate text-[11px]">
                            {title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                          <span className="font-extrabold text-rose-600 dark:text-rose-400">
                            {duration}d
                          </span>
                          {task?.earlyStartDate && (
                            <span className="text-slate-400 text-[9px]">
                              {task.earlyStartDate.slice(5)} &rarr; {task.earlyFinishDate.slice(5)}
                            </span>
                          )}
                          <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-rose-500 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-slate-400 text-xs">
            Add tasks and sequence edges to view Critical Path Method analysis.
          </div>
        )}
      </div>
    </div>
  );
};
