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
} from 'lucide-react';
import { calculateTimeCountdown } from '../../utils/timeTracker';
import { useAuthStore } from '../../stores/authStore';
import { getRolePermissions } from '../../utils/permissions';

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

  // Node card border & background styling
  const borderColourClass = selected
    ? 'border-blue-500 ring-4 ring-blue-500/20 shadow-xl'
    : isMilestoneNode
    ? 'border-amber-300 dark:border-amber-700/80 hover:border-amber-400'
    : isApprovalNode
    ? 'border-purple-300 dark:border-purple-700/80 hover:border-purple-400'
    : isStageNode
    ? 'border-indigo-300 dark:border-indigo-800 hover:border-indigo-400'
    : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-slate-700';

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => {
        if (isConfidentialHidden) return;
        if (onSelectNode) onSelectNode(id);
      }}
      className={`w-72 bg-white dark:bg-slate-900 rounded-2xl border-2 transition-all shadow-md relative ${
        isConfidentialHidden ? 'cursor-not-allowed opacity-95' : 'cursor-pointer'
      } ${borderColourClass}`}
    >
      {/* n8n-Style Workflow Connection Handles */}
      {/* Left Input Handle (Prerequisite/Target) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-4 !h-4 !-left-2 !bg-white dark:!bg-slate-800 !border-2 !border-blue-500 dark:!border-blue-400 hover:!scale-130 active:!scale-130 hover:!bg-blue-500 hover:!border-white transition-all shadow-md cursor-crosshair z-20 group/handle after:content-[''] after:absolute after:-inset-3 after:rounded-full after:z-30"
        title="Input: Prerequisite step"
      />

      {/* Right Output Handle (Next Step/Source) */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-4 !h-4 !-right-2 !bg-blue-600 hover:!bg-blue-500 active:!scale-130 !border-2 !border-white dark:!border-slate-900 hover:!scale-130 transition-all shadow-md shadow-blue-500/30 cursor-crosshair z-20 group/handle after:content-[''] after:absolute after:-inset-3 after:rounded-full after:z-30"
        title="Output: Drag to connect next step"
      />

      {/* Top Handle (Parent / Hierarchical Input) */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-3 !h-3 !-top-1.5 !bg-slate-300 dark:!bg-slate-700 !border-2 !border-white dark:!border-slate-900 opacity-40 hover:opacity-100 hover:!bg-blue-500 hover:!scale-125 active:!scale-125 transition-all cursor-crosshair z-10 after:content-[''] after:absolute after:-inset-2.5 after:rounded-full after:z-30"
        title="Top: Parent step input"
      />

      {/* Bottom Handle (Child / Subtask Output) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-3 !h-3 !-bottom-1.5 !bg-slate-300 dark:!bg-slate-700 !border-2 !border-white dark:!border-slate-900 opacity-40 hover:opacity-100 hover:!bg-blue-500 hover:!scale-125 active:!scale-125 transition-all cursor-crosshair z-10 after:content-[''] after:absolute after:-inset-2.5 after:rounded-full after:z-30"
        title="Bottom: Subtask output"
      />

      {/* Floating Action Bar on hover/selection (Authorized users only) */}
      {(selected || isHovered) && !isConfidentialHidden && (
        <div
          className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl px-1.5 py-1 flex items-center gap-1 z-30 animate-in fade-in zoom-in-95 duration-150 touch-manipulation max-w-[95vw]"
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

      {/* Blocker vs Overdue vs Progress Alerts */}
      {(data.isBlocked || statusCategory === 'blocked' || waitingCount > 0) && !countdown.isDone ? (
        <div className="bg-rose-600 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-t-xl flex items-center justify-between uppercase tracking-wider shadow-sm">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs">🚫</span>
            <span className="truncate">
              {Array.isArray((data as any)?.blockingTaskNames) && (data as any).blockingTaskNames.length > 0
                ? `Blocked by: ${(data as any).blockingTaskNames[0]}`
                : 'Blocked by Prerequisite'}
            </span>
          </span>
          <span className="px-1.5 py-0.2 bg-white/20 text-white rounded text-[8px] font-black uppercase shrink-0">
            Blocked
          </span>
        </div>
      ) : countdown.isOverdue ? (
        <div className="bg-amber-600 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-t-xl flex items-center justify-between uppercase tracking-wider animate-pulse">
          <span className="flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">⚠️ DELAYED: {countdown.formattedText}</span>
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onExtendDeadline) onExtendDeadline(id);
                else if (onViewDetails) onViewDetails(id);
              }}
              className="px-2 py-0.5 bg-white text-amber-900 hover:bg-amber-50 rounded text-[9px] font-extrabold shadow-sm flex items-center gap-1 transition-colors shrink-0 ml-1.5"
            >
              <span>Extend</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      ) : countdown.isTwoDaysAlert ? (
        <div className="bg-amber-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-t-xl flex items-center gap-1.5 uppercase tracking-wider shadow-sm">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{countdown.formattedText}</span>
        </div>
      ) : countdown.isDone ? (
        <div className="bg-emerald-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-t-xl flex items-center gap-1.5 uppercase tracking-wider">
          <CheckCircle2 className="w-3 h-3" />
          <span>✓ Completed</span>
        </div>
      ) : null}

      {/* Top Header: Assignee & Type Tag */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/60 rounded-t-2xl">
        {assignedName ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative shrink-0">
              {assignedAvatar ? (
                <img
                  src={assignedAvatar}
                  alt={assignedName}
                  className="w-6 h-6 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shadow-xs"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-black uppercase ring-2 ring-white dark:ring-slate-800 shadow-xs">
                  {assignedName[0]}
                </div>
              )}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                  isLivePresence ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
                title={isLivePresence ? 'Working Live right now' : 'Offline'}
              />
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate max-w-[110px]"
                title={assignedName}
              >
                {assignedName}
              </span>
              {isLivePresence ? (
                <span className="px-1.5 py-0.2 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-0.5 shrink-0">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
                  Live
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-medium">
            <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center">
              <Users className="w-3 h-3 text-slate-400" />
            </div>
            <span className="italic">Unassigned</span>
          </div>
        )}

        {/* Node Type Pill */}
        <span
          className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
            isMilestoneNode
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              : isApprovalNode
              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
              : isStageNode
              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          }`}
        >
          {typeLabel}
        </span>
      </div>

      {/* Card Content Body */}
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              {renderIcon()}
            </div>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider truncate"
              style={{
                backgroundColor: `${statusColour}15`,
                color: statusColour,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: statusColour }}
              />
              {statusName}
            </span>
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-1">
            {isStageNode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDrillDown) onDrillDown({ id, title });
                }}
                className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 text-purple-700 dark:text-purple-300 rounded-md flex items-center gap-1 shadow-sm transition-colors"
                title="Drill down into sub-canvas"
              >
                <Layers className="w-3 h-3" />
                <span>{childCount} items</span>
                <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
              </button>
            )}

            {/* Direct Delete Button */}
            {canEdit && onDelete && !isConfidentialHidden && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(id);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors"
                title="Delete this task"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sub-task indicator */}
        {isChild && (
          <div className="mb-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md w-fit">
            <CornerDownRight className="w-3 h-3 shrink-0" />
            <span className="truncate">Sub-task {parentTitle ? `of ${parentTitle}` : ''}</span>
          </div>
        )}

        {/* Title */}
        <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-snug line-clamp-2">
          {title}
        </h4>

        {description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
            {description}
          </p>
        )}

        {/* Approval Gate Status Banner if approval node */}
        {isApprovalNode && (
          <div className="mt-2 p-2 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 flex items-center justify-between text-[10px]">
            <span className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {approvalStatus === 'approved'
                ? 'Sign-Off Granted'
                : approvalStatus === 'rejected'
                ? 'Rework Required'
                : 'Gate Approval Pending'}
            </span>
            <span className="text-slate-400 uppercase font-mono text-[9px]">
              {approvalStatus}
            </span>
          </div>
        )}

        {/* Progress Bar (Stages & Tasks) */}
        <div className="mt-2.5">
          <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
            <span>{isStageNode ? 'Phase Rollup' : 'Progress'}</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{progressPct}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isMilestoneNode
                  ? 'bg-amber-500'
                  : isApprovalNode
                  ? 'bg-purple-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Latest Remark snippet */}
        {lastRemark && (
          <div className="mt-2 p-1.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 text-[10px] text-slate-600 dark:text-slate-300 line-clamp-1 flex items-center gap-1">
            <MessageSquare className="w-2.5 h-2.5 text-blue-500 shrink-0" />
            <span className="truncate italic">"{lastRemark}"</span>
          </div>
        )}

        {/* Badges footer */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            {/* Kudos Button */}
            {isManager && canEdit ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onLike) onLike(id);
                }}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-600 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Manager recognition"
              >
                <ThumbsUp
                  className={`w-3 h-3 ${likes?.count > 0 ? 'text-blue-600 fill-blue-600' : 'text-slate-400'}`}
                />
                <span className="font-bold">{likes?.count || 0}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 text-[10px] text-slate-400 p-1">
                <ThumbsUp
                  className={`w-3 h-3 ${likes?.count > 0 ? 'text-blue-600 fill-blue-600' : 'text-slate-400'}`}
                />
                <span className="font-bold">{likes?.count || 0}</span>
              </div>
            )}

            {docCount > 0 && (
              <span className="flex items-center gap-0.5 text-slate-600 dark:text-slate-300 text-[10px]">
                <Paperclip className="w-3 h-3" />
                {docCount}
              </span>
            )}

            {msgCount > 0 && (
              <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-semibold text-[10px]">
                <MessageSquare className="w-3 h-3" />
                {msgCount}
              </span>
            )}

            {dueDate && (
              <span
                className="flex items-center gap-0.5 text-slate-500 text-[10px]"
                title="Target Handover Date"
              >
                <Calendar className="w-3 h-3" />
                {new Date(dueDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onViewDetails) onViewDetails(id);
              else if (onSelectNode) onSelectNode(id);
            }}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer p-1.5 -mr-1.5 min-h-[36px] flex items-center"
          >
            Details &rarr;
          </button>
        </div>
      </div>
    </div>
  );
});

FlowTrackNode.displayName = 'FlowTrackNode';
