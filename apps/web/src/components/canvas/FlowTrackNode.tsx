import React, { memo, useState, useRef } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  MessageSquare,
  Layers,
  CheckSquare,
  ArrowRight,
  Trash2,
  Copy,
  Plus,
  CornerDownRight,
  ThumbsUp,
  ThumbsDown,
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Flag,
  Users,
  Eye,
  Calendar,
  Zap,
} from 'lucide-react';
import { calculateTimeCountdown } from '../../utils/timeTracker';
import { useAuthStore } from '../../stores/authStore';
import { getRolePermissions } from '../../utils/permissions';

const formatShortDate = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

export const FlowTrackNode = memo(({ id, data, selected }: NodeProps) => {
  const {
    title,
    description,
    statusName = 'In Progress',
    statusCategory = 'active',
    statusColour = '#3b82f6',
    progressPct = 0,
    priority = 'MEDIUM',
    nodeTypeKey = 'task',
    isGroup = false,
    isMilestone = false,
    isApprovalGate = false,
    approvalStatus = 'not_required',
    childCount = 0,
    waitingCount = 0,
    isOverdue = false,
    ownerName,
    owner,
    ownerAvatar,
    isLive,
    docCount = 0,
    msgCount = 0,
    dueDate,
    lastRemark,
    likes,
    collaborators = [],
    parentTitle,
    isChild = false,
    customData,
    terminology,
    currency,
    canEdit = true,
    onDrillDown,
    onSelectNode,
    onViewDetails,
    onExtendDeadline,
    onDelete,
    onDuplicate,
    onAddNext,
    onAddChild,
    onLike,
    onToggleLock,
    onAssignNode,
  } = data as any;

  const cpm = (data as any)?.cpm;
  const isCritical = Boolean(cpm?.isCritical);
  const totalFloat = cpm?.totalFloat;
  const cpmDuration = cpm?.durationDays || customData?.durationDays;
  const earlyStartDate = cpm?.earlyStartDate;
  const earlyFinishDate = cpm?.earlyFinishDate;

  const { getActiveRole } = useAuthStore();
  const currentRole = getActiveRole();
  const permissions = getRolePermissions(currentRole);
  const isManager = permissions.canApproveTasks;
  const isLocked = Boolean(customData?.isLocked || (data as any).isLocked);
  const isConfidentialHidden = isLocked && !permissions.canViewConfidential;
  const managerReview = customData?.managerReview;

  const assignedName = owner?.fullName || ownerName || customData?.assigneeName;
  const assignedAvatar = owner?.avatarUrl || ownerAvatar || customData?.assigneeAvatar;
  const isLivePresence =
    customData?.isLive !== undefined
      ? Boolean(customData.isLive)
      : isLive !== undefined
      ? Boolean(isLive)
      : Boolean(assignedName && statusCategory === 'active');

  const countdown = calculateTimeCountdown(dueDate, statusCategory);

  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<any>(null);

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovered(false);
  };

  // Determine node type classification
  const isStageNode = isGroup || nodeTypeKey === 'stage';
  const isMilestoneNode = isMilestone || nodeTypeKey === 'milestone';
  const isApprovalNode = isApprovalGate || nodeTypeKey === 'approval' || approvalStatus !== 'not_required';

  // Configurable terminology label
  const typeLabel = isStageNode
    ? terminology?.stage || 'Stage'
    : isMilestoneNode
    ? terminology?.milestone || 'Milestone'
    : isApprovalNode
    ? terminology?.approver || 'Approval Gate'
    : terminology?.task || 'Task';

  // Render appropriate type icon
  const renderIcon = () => {
    if (isMilestoneNode) return <Flag className="w-4 h-4 text-amber-500" />;
    if (isApprovalNode) {
      if (approvalStatus === 'approved') return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
      if (approvalStatus === 'rejected') return <ShieldX className="w-4 h-4 text-rose-500" />;
      return <ShieldAlert className="w-4 h-4 text-purple-500" />;
    }
    if (isStageNode) return <Layers className="w-4 h-4 text-purple-600" />;
    if (statusCategory === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    if (statusCategory === 'blocked' || waitingCount > 0)
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <CheckSquare className="w-4 h-4 text-blue-600" />;
  };

  // Node card border & background styling - clean, professional business card styling
  const borderColourClass = selected
    ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg'
    : isOverdue && !countdown.isDone
    ? 'border-amber-400 dark:border-amber-600/70 shadow-xs'
    : (data.isBlocked || statusCategory === 'blocked') && !countdown.isDone
    ? 'border-rose-400 dark:border-rose-600/70 shadow-xs'
    : isCritical && !countdown.isDone
    ? 'border-rose-300 dark:border-rose-600/60 shadow-xs'
    : isMilestoneNode
    ? 'border-amber-200 dark:border-amber-800/80'
    : isApprovalNode
    ? 'border-purple-200 dark:border-purple-800/80'
    : isStageNode
    ? 'border-indigo-200 dark:border-indigo-800'
    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs';

  return (
    <div
      onClick={() => {
        if (isConfidentialHidden) return;
        if (onSelectNode) onSelectNode(id);
      }}
      className={`w-72 bg-white dark:bg-slate-900 rounded-xl border transition-colors relative ${
        isConfidentialHidden ? 'cursor-not-allowed opacity-95' : 'cursor-pointer'
      } ${borderColourClass}`}
    >
      {/* n8n-Style Workflow Connection Handles */}
      {/* Left Input Handle (Prerequisite/Target) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-3.5 !h-3.5 !-left-1.5 !bg-white dark:!bg-slate-800 !border-2 !border-blue-500 dark:!border-blue-400 hover:!bg-blue-500 hover:!border-white transition-colors shadow-xs cursor-crosshair z-20"
        title="Input: Prerequisite step"
      />

      {/* Right Output Handle (Next Step/Source) */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-3.5 !h-3.5 !-right-1.5 !bg-blue-600 hover:!bg-blue-500 !border-2 !border-white dark:!border-slate-900 transition-colors shadow-xs cursor-crosshair z-20"
        title="Output: Drag to connect next step"
      />

      {/* Top Handle (Parent / Hierarchical Input) */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-2.5 !h-2.5 !-top-1 !bg-slate-300 dark:!bg-slate-700 !border-2 !border-white dark:!border-slate-900 opacity-40 hover:opacity-100 hover:!bg-blue-500 transition-colors cursor-crosshair z-10"
        title="Top: Parent step input"
      />

      {/* Bottom Handle (Child / Subtask Output) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-2.5 !h-2.5 !-bottom-1 !bg-slate-300 dark:!bg-slate-700 !border-2 !border-white dark:!border-slate-900 opacity-40 hover:opacity-100 hover:!bg-blue-500 transition-colors cursor-crosshair z-10"
        title="Bottom: Subtask output"
      />

      {/* Floating Action Bar on selection (Authorized users only) */}
      {selected && !isConfidentialHidden && (
        <div
          className="absolute -top-11 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg rounded-xl px-1.5 py-1 flex items-center gap-1 z-30 transition-opacity max-w-[95vw]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Quick Remarks Drawer */}
          <button
            type="button"
            onClick={() => onSelectNode && onSelectNode(id)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
            title="Remarks & Remarks Drawer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>

          {/* Full Dossier Modal */}
          {onViewDetails && (
            <button
              type="button"
              onClick={() => onViewDetails(id)}
              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
              title="View Complete Task Details & Dossier"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Authorized Actions */}
          {canEdit && (
            <>
              {/* Add Connected Step (+) */}
              {onAddNext && (
                <button
                  type="button"
                  onClick={() => onAddNext(id)}
                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                  title="Add connected sequence task (+)"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Add Child Task Below */}
              {onAddChild && (
                <button
                  type="button"
                  onClick={() => onAddChild(id)}
                  className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors"
                  title="Add child task below (+)"
                >
                  <CornerDownRight className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Duplicate Task */}
              {onDuplicate && (
                <button
                  type="button"
                  onClick={() => onDuplicate(id)}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                  title="Duplicate Task (Copy)"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Sub-canvas drilldown */}
              {isStageNode && onDrillDown && (
                <button
                  type="button"
                  onClick={() => onDrillDown({ id, title })}
                  className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors"
                  title="Drill down into sub-canvas"
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Lock Toggle */}
              {permissions.canToggleLock && onToggleLock && (
                <button
                  type="button"
                  onClick={() => onToggleLock(id, !isLocked)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isLocked
                      ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/60'
                      : 'text-slate-600 dark:text-slate-300 hover:text-amber-600 hover:bg-amber-50'
                  }`}
                  title={isLocked ? 'Unlock node' : 'Lock as confidential'}
                >
                  {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
              )}

              <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

              {/* Delete Task */}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(id)}
                  className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors group/del"
                  title="Delete task with confirmation"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500 group-hover/del:scale-110 transition-transform" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* 1. Subtle Header: Task ID & Compact Status Indicator (left), State Badge / Float (right) */}
      <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase shrink-0">
            {customData?.code || `#${id.slice(-4).toUpperCase()}`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: statusColour }}
            />
            <span className="truncate">{statusName}</span>
          </span>
        </div>

        {/* State Badge on the right */}
        <div className="flex items-center gap-1 shrink-0">
          {countdown.isDone ? (
            <span className="inline-flex items-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
              Done
            </span>
          ) : data.isBlocked || statusCategory === 'blocked' ? (
            <span className="inline-flex items-center text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">
              Blocked
            </span>
          ) : countdown.isOverdue ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
              <Clock className="w-2.5 h-2.5" />
              Overdue
            </span>
          ) : isCritical ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200/60 dark:border-rose-900/40"
              title="Critical path task (0d float)"
            >
              <Zap className="w-2.5 h-2.5 fill-rose-500 text-rose-500" />
              Critical
            </span>
          ) : totalFloat !== undefined && totalFloat > 0 ? (
            <span
              className="inline-flex items-center text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded"
              title={`Schedule flexibility: ${totalFloat} days available float`}
            >
              {totalFloat}d float
            </span>
          ) : isMilestoneNode ? (
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
              Milestone
            </span>
          ) : isStageNode ? (
            <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
              Phase
            </span>
          ) : null}
        </div>
      </div>

      {/* 2. Task Title as the Most Prominent Text */}
      <div className="px-3.5 py-1">
        {isChild && (
          <div className="text-[10px] font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1 mb-0.5">
            <CornerDownRight className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">Subtask {parentTitle ? `of ${parentTitle}` : ''}</span>
          </div>
        )}
        <h4
          className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug line-clamp-2"
          title={title}
        >
          {title}
        </h4>
        {description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
            {description}
          </p>
        )}
      </div>

      {/* 3. Approval state only when relevant */}
      {isApprovalNode && (
        <div className="mx-3.5 my-1.5 px-2 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 flex items-center justify-between text-[10px]">
          <span className="font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
            {approvalStatus === 'approved' ? (
              <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
            ) : approvalStatus === 'rejected' ? (
              <ShieldX className="w-3 h-3 text-rose-500 shrink-0" />
            ) : (
              <ShieldAlert className="w-3 h-3 text-purple-500 shrink-0" />
            )}
            {approvalStatus === 'approved'
              ? 'Sign-Off Granted'
              : approvalStatus === 'rejected'
              ? 'Rework Required'
              : 'Awaiting Approval'}
          </span>
          <span className="text-slate-400 dark:text-slate-500 font-mono text-[9px] uppercase">
            {approvalStatus}
          </span>
        </div>
      )}

      {/* 4. Assignee Displayed Simply with an Avatar and Short Name */}
      <div className="px-3.5 py-1.5 flex items-center justify-between">
        {assignedName ? (
          <div className="flex items-center gap-1.5 min-w-0">
            {assignedAvatar ? (
              <img
                src={assignedAvatar}
                alt={assignedName}
                className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-[9px] font-bold uppercase shrink-0">
                {assignedName[0]}
              </div>
            )}
            <span
              className="text-xs text-slate-700 dark:text-slate-300 truncate max-w-[130px]"
              title={assignedName}
            >
              {assignedName}
            </span>
            {isLivePresence && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                title="Active now"
              />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs italic">
            <Users className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
            <span>Unassigned</span>
          </div>
        )}

        {/* Indicators on right of assignee row */}
        <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
          {isStageNode && onDrillDown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDrillDown({ id, title });
              }}
              className="font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5"
              title="Drill down into sub-canvas"
            >
              <span>{childCount} steps</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </button>
          )}
          {msgCount > 0 && (
            <span className="flex items-center gap-0.5" title={`${msgCount} comments`}>
              <MessageSquare className="w-2.5 h-2.5" />
              {msgCount}
            </span>
          )}
          {docCount > 0 && (
            <span className="flex items-center gap-0.5" title={`${docCount} attachments`}>
              <Paperclip className="w-2.5 h-2.5" />
              {docCount}
            </span>
          )}
          {likes?.count > 0 && (
            <span className="flex items-center gap-0.5 text-blue-500" title={`${likes.count} likes`}>
              <ThumbsUp className="w-2.5 h-2.5 fill-blue-500/20" />
              {likes.count}
            </span>
          )}
        </div>
      </div>

      {/* 5. One Clear Progress Indicator */}
      <div className="px-3.5 py-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isMilestoneNode
                  ? 'bg-amber-500'
                  : isApprovalNode
                  ? 'bg-purple-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
            />
          </div>
          <span className="text-[10px] font-mono font-medium text-slate-400 dark:text-slate-500 shrink-0">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* 6. Compact Footer Showing Duration and Planned Finish Date */}
      <div className="px-3.5 py-2 mt-1 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5 min-w-0">
          {cpmDuration ? (
            <span className="font-semibold text-slate-700 dark:text-slate-300 shrink-0">
              {cpmDuration}d
            </span>
          ) : null}
          {cpmDuration && (earlyFinishDate || dueDate) && (
            <span className="text-slate-300 dark:text-slate-600">&bull;</span>
          )}
          {earlyFinishDate ? (
            <span className="truncate" title={`Planned Finish: ${earlyFinishDate}`}>
              Fin: {formatShortDate(earlyFinishDate)}
            </span>
          ) : dueDate ? (
            <span className="truncate" title={`Due Date: ${dueDate}`}>
              Due: {formatShortDate(dueDate)}
            </span>
          ) : (
            <span className="text-slate-400 italic">No target date</span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onViewDetails) onViewDetails(id);
            else if (onSelectNode) onSelectNode(id);
          }}
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ml-2 shrink-0"
        >
          Details &rarr;
        </button>
      </div>
    </div>
  );
});

FlowTrackNode.displayName = 'FlowTrackNode';
