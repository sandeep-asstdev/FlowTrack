import React from 'react';
import {
  Zap,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  X,
  RefreshCw,
  Eye,
  EyeOff,
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
  isHighlightActive?: boolean;
  onToggleHighlight?: () => void;
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
  isHighlightActive = false,
  onToggleHighlight,
}) => {
  if (!isOpen) return null;

  const isIncompleteSchedule =
    !cpmResult ||
    cpmResult.tasks.length === 0 ||
    cpmResult.totalDurationDays === 0 ||
    !cpmResult.projectedFinishDate;

  // Identify tasks needing immediate manager attention
  const now = new Date();
  const needsAttentionTasks =
    cpmResult?.tasks.filter((t) => {
      // Overdue
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        if (!isNaN(d.getTime()) && d < now) return true;
      }
      // Critical task in a project with negative deadline slack
      if (
        t.isCritical &&
        cpmResult.deadlineSlackDays !== undefined &&
        cpmResult.deadlineSlackDays < 0
      ) {
        return true;
      }
      return false;
    }) || [];

  return (
    <div
      className="fixed bottom-6 right-6 z-40 w-96 max-w-[calc(100vw-2rem)] max-h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
      role="region"
      aria-label="Critical Path Analysis Summary"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <Zap className="w-4 h-4 fill-rose-500/30 text-rose-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Critical Path Analysis
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              CPM Schedule & Slack Model
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onToggleHighlight && (
            <button
              type="button"
              onClick={onToggleHighlight}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                isHighlightActive
                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={isHighlightActive ? 'Turn off canvas focus (keep calm)' : 'Focus critical path on canvas'}
            >
              {isHighlightActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="text-[10px] hidden sm:inline">
                {isHighlightActive ? 'Focused' : 'Focus'}
              </span>
            </button>
          )}

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

      {/* Body Content */}
      <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
        {loading && !cpmResult ? (
          <div className="py-8 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-rose-500" />
            <p className="text-xs font-medium">Calculating critical path schedule...</p>
          </div>
        ) : error ? (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>CPM Validation Error</span>
            </div>
            <p className="text-[11px] leading-relaxed">{error}</p>
          </div>
        ) : isIncompleteSchedule ? (
          <div className="py-6 px-3 text-center space-y-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
            <Clock className="w-6 h-6 mx-auto text-slate-400" />
            <h4 className="font-semibold text-slate-700 dark:text-slate-300">
              Incomplete Schedule
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
              Add task durations and finish-to-start dependencies between nodes to establish a
              critical path schedule.
            </p>
          </div>
        ) : (
          <>
            {/* 1. Core Summary Metrics (Executive View) */}
            <div className="grid grid-cols-3 gap-2">
              {/* Projected Completion */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1 mb-0.5">
                  <Calendar className="w-2.5 h-2.5 text-blue-500" />
                  <span>Completion</span>
                </div>
                <div className="font-bold text-xs text-slate-900 dark:text-white truncate" title={cpmResult.projectedFinishDate}>
                  {cpmResult.projectedFinishDate}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {cpmResult.totalDurationDays}d total
                </div>
              </div>

              {/* Critical Tasks Count */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1 mb-0.5">
                  <Zap className="w-2.5 h-2.5 text-rose-500" />
                  <span>Critical Tasks</span>
                </div>
                <div className="font-bold text-xs text-rose-600 dark:text-rose-400">
                  {cpmResult.criticalTaskCount}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  of {cpmResult.tasks.length} tasks
                </div>
              </div>

              {/* Schedule Buffer */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1 mb-0.5">
                  <Clock className="w-2.5 h-2.5 text-emerald-500" />
                  <span>Buffer</span>
                </div>
                {cpmResult.deadlineSlackDays !== undefined ? (
                  <>
                    <div
                      className={`font-bold text-xs truncate ${
                        cpmResult.deadlineSlackDays >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {cpmResult.deadlineSlackDays >= 0
                        ? `+${cpmResult.deadlineSlackDays}d`
                        : `${cpmResult.deadlineSlackDays}d`}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {cpmResult.deadlineSlackDays >= 0 ? 'On schedule' : 'Behind target'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-xs text-slate-400 italic">None</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">No target date</div>
                  </>
                )}
              </div>
            </div>

            {/* 2. Needs Attention Section */}
            {needsAttentionTasks.length > 0 ? (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>Needs Attention ({needsAttentionTasks.length})</span>
                </div>
                <div className="space-y-1">
                  {needsAttentionTasks.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onFocusNode?.(task.id)}
                      className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-white/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-colors"
                      title="Click to view on canvas"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                        {task.title}
                      </span>
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                        {task.isCritical ? 'Critical Risk' : 'Overdue'}
                      </span>
                    </div>
                  ))}
                  {needsAttentionTasks.length > 3 && (
                    <div className="text-[10px] text-amber-700 dark:text-amber-400 text-center pt-0.5">
                      +{needsAttentionTasks.length - 3} more schedule risks
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>All tasks currently on track</span>
              </div>
            )}

            {/* 3. Critical Path Sequence */}
            <div>
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Critical Path Sequence</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  Zero Float Chain ({cpmResult.criticalPathIds.length} steps)
                </span>
              </div>

              {cpmResult.criticalPathIds.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-slate-400 text-xs">
                  No critical dependency chain established yet.
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {cpmResult.criticalPathIds.map((taskId, idx) => {
                    const task = cpmResult.tasks.find((t) => t.id === taskId);
                    const title = task?.title || taskId;
                    const duration = task?.durationDays || 1;
                    return (
                      <div
                        key={taskId}
                        onClick={() => onFocusNode?.(taskId)}
                        className="group flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-rose-400 dark:hover:border-rose-500 hover:shadow-xs transition-all cursor-pointer"
                        title="Click to center on canvas"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-4 h-4 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-bold text-[9px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate text-[11px]">
                            {title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            {duration}d
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-rose-500 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Schedule Flexibility Summary */}
            <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span>Flexible Tasks:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {cpmResult.slackTaskCount} {cpmResult.slackTaskCount === 1 ? 'task' : 'tasks'} with available float
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
