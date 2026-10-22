import React, { memo, useState, useRef } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  MessageSquare,
  FileText,
  Layers,
  CheckSquare,
  ArrowRight,
  Trash2,
  Copy,
  Plus,
  Sliders,
  MoreVertical,
  CornerDownRight,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  Eye,
  Lock,
  Unlock,
  Shield,
  Users,
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
    isGroup = false,
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

  const { user, workspaces, activeWorkspaceId, getActiveRole } = useAuthStore();
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
    }, 250);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovered(false);
  };

  const renderIcon = () => {
    if (isGroup) return <Layers className="w-4 h-4 text-purple-600" />;
    if (statusCategory === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    if (statusCategory === 'blocked' || waitingCount > 0)
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <CheckSquare className="w-4 h-4 text-blue-600" />;
  };

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
      } ${
        selected
          ? 'border-blue-500 ring-4 ring-blue-500/20 shadow-xl'
          : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-slate-700'
      }`}
    >
      {/* 4-Direction Connection Handles so users can connect any node to any other node! */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-3.5 !h-3.5 !bg-blue-600 !border-2 !border-white dark:!border-slate-900 hover:!scale-125 transition-transform"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-3.5 !h-3.5 !bg-blue-600 !border-2 !border-white dark:!border-slate-900 hover:!scale-125 transition-transform"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 opacity-60 hover:opacity-100 hover:!scale-125 transition-transform"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white dark:!border-slate-900 opacity-60 hover:opacity-100 hover:!scale-125 transition-transform"
      />

      {/* n8n / Automa Signature Floating Action Bar (Pill on hover or selected) - Hidden when Confidential */}
      {(selected || isHovered) && !isConfidentialHidden && (
        <div
          className="absolute -top-11 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl px-2 py-1 flex items-center gap-1 z-30 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Quick Remarks Drawer */}
          <button
            onClick={() => onSelectNode && onSelectNode(id)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
            title="Remarks & Quick Messaging"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>

          {/* Full View Details Modal */}
          {onViewDetails && (
            <button
              onClick={() => onViewDetails(id)}
              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
              title="View Complete Task Details & Dossier"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Add Connected Sequence Step (+) */}
          {onAddNext && (
            <button
              onClick={() => onAddNext(id)}
              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
              title="Add connected task (+)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Add Interconnected Child Task Below (+) */}
          {onAddChild && (
            <button
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
              onClick={() => onDuplicate(id)}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
              title="Duplicate Task (Copy)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Sub-canvas drilldown if group */}
          {isGroup && onDrillDown && (
            <button
              onClick={() => onDrillDown({ id, title })}
              className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors"
              title="Drill down into sub-canvas"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Lock / Unlock Toggle Button (Managers & Super Admins) */}
          {permissions.canToggleLock && onToggleLock && (
            <button
              onClick={() => onToggleLock(id, !isLocked)}
              className={`p-1.5 rounded-lg transition-colors ${
                isLocked
                  ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100'
                  : 'text-slate-600 dark:text-slate-300 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50'
              }`}
              title={isLocked ? 'Unlock node (Confidential lock active)' : 'Lock node as confidential'}
            >
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          )}

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Delete Task Button */}
          {onDelete && (
            <button
              onClick={() => onDelete(id)}
              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors group/del"
              title="Delete task (Del)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500 group-hover/del:scale-110 transition-transform" />
            </button>
          )}
        </div>
      )}

      {/* Live Deadline / Overdue Alerts on Canvas Card */}
      {countdown.isOverdue ? (
        <div className="bg-rose-500 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-t-xl flex items-center justify-between uppercase tracking-wider animate-pulse">
          <span className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">🚨 {countdown.formattedText}</span>
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onExtendDeadline) onExtendDeadline(id);
              else if (onViewDetails) onViewDetails(id);
              else if (onSelectNode) onSelectNode(id);
            }}
            className="px-2 py-0.5 bg-white text-rose-700 hover:bg-rose-50 rounded text-[9px] font-extrabold shadow-sm flex items-center gap-1 transition-colors shrink-0 cursor-pointer ml-1.5"
            title="Extend Deadline with Reason & Doc"
          >
            <span>Extend</span>
            <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>
      ) : countdown.isTwoDaysAlert ? (
        <div className="bg-amber-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-t-xl flex items-center gap-1.5 uppercase tracking-wider animate-pulse shadow-sm">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{countdown.formattedText}</span>
        </div>
      ) : countdown.isDone ? (
        <div className="bg-emerald-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-t-xl flex items-center gap-1.5 uppercase tracking-wider">
          <CheckCircle2 className="w-3 h-3" />
          <span>✓ Completed & Approved</span>
        </div>
      ) : null}

      {/* Top Assignee & Live/Offline Presence Header */}
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
              {/* Presence Indicator Dot (Live / Offline) */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                  isLivePresence ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
                title={isLivePresence ? 'Working Live right now' : 'Offline'}
              />
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate max-w-[110px]" title={assignedName}>
                {assignedName}
              </span>
              {isLivePresence ? (
                <span className="px-1.5 py-0.2 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-0.5 shrink-0">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
                  Live
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded-full text-[8px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                  Offline
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-medium">
            <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center">
              <Users className="w-3 h-3 text-slate-400" />
            </div>
            <span className="italic">Unassigned Task</span>
          </div>
        )}

        {/* Assigning option for Manager & Team Lead */}
        {permissions.canAssignTasks && !isConfidentialHidden && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onAssignNode) {
                onAssignNode(id);
              } else if (onSelectNode) {
                onSelectNode(id);
              }
            }}
            className="px-2 py-0.5 rounded-md text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors flex items-center gap-0.5 cursor-pointer"
            title="Assign or reassign task"
          >
            <span>{assignedName ? 'Reassign' : '+ Assign'}</span>
          </button>
        )}
      </div>

      {/* Confidential Lock Indicator Strip */}
      {isLocked && (
        <div className="bg-amber-500/15 dark:bg-amber-500/25 text-amber-800 dark:text-amber-200 border-b border-amber-200 dark:border-amber-800/60 px-3 py-1.5 flex flex-col gap-0.5 text-[10px]">
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>Confidential Node (Locked)</span>
            </span>
            {permissions.canToggleLock && onToggleLock ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock(id, false);
                }}
                className="text-[9px] text-amber-800 dark:text-amber-200 underline font-semibold hover:opacity-80"
              >
                Unlock
              </button>
            ) : (
              <span className="text-[9px] text-amber-700 dark:text-amber-300 font-semibold bg-amber-200/60 dark:bg-amber-900/60 px-1.5 py-0.2 rounded">
                Locked
              </span>
            )}
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <span>Locked by: <strong className="text-slate-700 dark:text-slate-300">{customData?.lockedBy || 'Manager'}</strong></span>
            {customData?.lockedAt && <span>• {new Date(customData.lockedAt).toLocaleDateString()}</span>}
          </div>
        </div>
      )}

      {/* Card Header with Status Badge & Fast Action Buttons */}
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
              ></span>
              {statusName}
            </span>
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-1">
            {isGroup && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDrillDown) onDrillDown({ id, title });
                }}
                className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 text-purple-700 dark:text-purple-300 rounded-md flex items-center gap-1 shadow-sm transition-colors"
                title="Drill down into child canvas"
              >
                <Layers className="w-3 h-3" />
                <span>{childCount} items</span>
                <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
              </button>
            )}

            {/* Prominent Direct Delete Button on Node Header (Automa / n8n style) */}
            {onDelete && !isConfidentialHidden && (
              <button
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

        {/* Sub-task indicator if child node */}
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

        {isConfidentialHidden ? (
          <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 space-y-1 text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold text-[11px]">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>Confidential Task (Locked)</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
              Locked by: <strong className="text-slate-800 dark:text-slate-200">{customData?.lockedBy || 'Manager'}</strong>
            </p>
            <div className="text-[9px] text-amber-800 dark:text-amber-300 italic font-medium">
              🔒 Task cannot be opened or edited. Details are restricted.
            </div>
          </div>
        ) : (
          <>
            {description && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                {description}
              </p>
            )}

            {/* Latest Remark snippet if available */}
            {lastRemark && (
              <div className="mt-2 p-1.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 text-[10px] text-slate-600 dark:text-slate-300 line-clamp-1 flex items-center gap-1">
                <MessageSquare className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                <span className="truncate italic">"{lastRemark}"</span>
              </div>
            )}
          </>
        )}

        {/* Manager Review & Approval Badge */}
        {managerReview?.reaction && (
          <div className="mt-2 p-1.5 rounded-lg border flex items-center justify-between text-[10px] bg-slate-50 dark:bg-slate-800/80">
            <div className="flex items-center gap-1.5 font-bold">
              {managerReview.reaction === 'thumbs_up' ? (
                <>
                  <ThumbsUp className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                  <span className="text-emerald-700 dark:text-emerald-400">Manager Approved</span>
                </>
              ) : (
                <>
                  <ThumbsDown className="w-3 h-3 text-rose-600 fill-rose-600" />
                  <span className="text-rose-700 dark:text-rose-400">Rework Requested</span>
                </>
              )}
            </div>
            {managerReview.reviewer && (
              <span className="text-[9px] text-slate-400 truncate max-w-[90px]">
                {managerReview.reviewer}
              </span>
            )}
          </div>
        )}

        {/* Badges footer */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            {/* Like Kudos Button - Only interactive for Managers */}
            {isManager ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onLike) onLike(id);
                }}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-600 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Manager Like / Review Reaction"
              >
                <ThumbsUp
                  className={`w-3 h-3 ${likes?.count > 0 ? 'text-blue-600 fill-blue-600' : 'text-slate-400'}`}
                />
                <span className="font-bold">{likes?.count || 0}</span>
              </button>
            ) : (
              <div
                className="flex items-center gap-1 text-[10px] text-slate-400 p-1"
                title="Manager Review Reactions & Likes"
              >
                <ThumbsUp
                  className={`w-3 h-3 ${likes?.count > 0 ? 'text-blue-600 fill-blue-600' : 'text-slate-400'}`}
                />
                <span className="font-bold">{likes?.count || 0}</span>
              </div>
            )}

            {docCount > 0 && (
              <span className="flex items-center gap-0.5 text-slate-600 dark:text-slate-300">
                <Paperclip className="w-3 h-3" />
                {docCount}
              </span>
            )}
            {msgCount > 0 && (
              <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-semibold">
                <MessageSquare className="w-3 h-3" />
                {msgCount}
              </span>
            )}
            {dueDate && (
              <span className="flex items-center gap-0.5 text-slate-500 text-[10px]" title="Deadline (Date & Time)">
                <Clock className="w-3 h-3" />
                {new Date(dueDate).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Multi-user avatars / lead owner */}
            <div className="flex -space-x-1.5 overflow-hidden">
              {ownerName ? (
                <div
                  className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white dark:ring-slate-900"
                  title={`Owner: ${ownerName}`}
                >
                  {ownerName[0]}
                </div>
              ) : (
                <span className="text-[10px] text-slate-400">Unassigned</span>
              )}
              {collaborators?.length > 0 && (
                <div
                  className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-[9px] font-bold ring-2 ring-white dark:ring-slate-900"
                  title={`${collaborators.length} collaborators`}
                >
                  +{collaborators.length}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onViewDetails) onViewDetails(id);
                else if (onSelectNode) onSelectNode(id);
              }}
              className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ml-1"
            >
              Details &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Floating Hover Card (300ms debounce, non-blocking summary) */}
      {isHovered && !selected && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-80 p-3.5 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700/80 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1"
              style={{
                backgroundColor: `${statusColour}25`,
                color: statusColour,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColour }} />
              {statusName}
            </span>

            {dueDate && (
              <span className="text-[10px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-400" />
                {new Date(dueDate) < new Date() ? (
                  <span className="text-rose-400 font-bold">Overdue</span>
                ) : (
                  new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                )}
              </span>
            )}
          </div>

          <div className="font-bold text-xs leading-snug mb-1.5 text-slate-100">
            {title}
          </div>

          {description && (
            <div className="text-[11px] text-slate-400 mb-2 line-clamp-2">
              {description}
            </div>
          )}



          {/* Last Remark snippet */}
          {lastRemark && (
            <div className="text-[11px] text-slate-300 italic mb-2.5 bg-slate-800/80 p-2 rounded-lg border-l-2 border-blue-400 line-clamp-2">
              "{lastRemark}"
            </div>
          )}

          {/* Footer with Document & Message counts, Owner, and Hint */}
          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2.5">
              {docCount > 0 && (
                <span className="flex items-center gap-1 text-slate-300">
                  <Paperclip className="w-3 h-3 text-slate-400" />
                  {docCount}
                </span>
              )}
              {msgCount > 0 && (
                <span className="flex items-center gap-1 text-blue-300 font-semibold">
                  <MessageSquare className="w-3 h-3 text-blue-400" />
                  {msgCount}
                </span>
              )}
              {ownerName && (
                <span className="flex items-center gap-1 text-slate-300">
                  <span className="w-3.5 h-3.5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[8px] font-bold">
                    {ownerName[0]}
                  </span>
                  <span>{ownerName.split(' ')[0]}</span>
                </span>
              )}
            </div>
            <span className="text-blue-400 font-bold hover:underline">Click to open &rarr;</span>
          </div>
        </div>
      )}
    </div>
  );
});

FlowTrackNode.displayName = 'FlowTrackNode';
