import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from '@xyflow/react';
import { Plus, Trash2, Lock, ArrowRight, Link2, Zap } from 'lucide-react';

export const FlowTrackEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  data,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const kind = (data as any)?.kind || 'sequence';
  const label = (data as any)?.label;
  const canEdit = (data as any)?.canEdit !== false;
  const onEdgeDelete = (data as any)?.onDelete;
  const onInsertNode = (data as any)?.onInsert;
  const isCriticalEdge = Boolean((data as any)?.isCriticalEdge);

  // Distinct visual styling:
  // - Default dependency edges: thin (1.5px), neutral (#94a3b8 / #64748b) and easy to follow
  // - Critical path: restrained accent (#e11d48), slightly greater stroke width (2.5px)
  // - Selection: bright blue (#2563eb, 3px)
  const isDependency = kind === 'dependency';
  const isRelated = kind === 'related';

  const defaultStroke = isCriticalEdge
    ? '#e11d48'
    : isDependency
    ? '#64748b'
    : isRelated
    ? '#cbd5e1'
    : '#94a3b8';

  const strokeColor = selected
    ? '#2563eb'
    : defaultStroke;

  const strokeDasharray = isRelated
    ? '3 3'
    : undefined;

  const strokeWidth = selected
    ? 3
    : isCriticalEdge
    ? 2.5
    : 1.5;

  return (
    <>
      {/* Invisible wider hit-area path for easy edge clicking & selection on touchscreens */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={32}
        className="cursor-pointer react-flow__edge-interaction"
      />
      {/* Selection Glow Outline */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#93c5fd"
          strokeWidth={6}
          strokeOpacity={0.6}
          className="pointer-events-none transition-all duration-150 animate-pulse"
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
          ...style,
        }}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan flex items-center gap-1 group z-10"
        >
          {/* Custom Edge Label (when specified) */}
          {label && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-xs">
              {label}
            </span>
          )}

          {/* Interactive controls (visible on hover or when edge is selected) */}
          {canEdit && (
            <div
              className={`flex items-center gap-1.5 transition-opacity ${
                selected ? 'opacity-100 scale-105' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              {/* Midpoint '+' insert button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onInsertNode) onInsertNode(id);
                }}
                className="w-7 h-7 sm:w-5 sm:h-5 rounded-full bg-white dark:bg-slate-800 border-2 border-blue-500 text-blue-600 dark:text-blue-400 hover:scale-125 active:scale-125 hover:bg-blue-600 hover:text-white flex items-center justify-center shadow-md transition-all text-xs font-bold after:content-[''] after:absolute after:-inset-2 after:rounded-full relative"
                title="Insert task between these steps"
              >
                <Plus className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
              </button>

              {/* Quick edge delete button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEdgeDelete) onEdgeDelete(id);
                }}
                className="w-7 h-7 sm:w-5 sm:h-5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-400 flex items-center justify-center shadow-sm transition-all after:content-[''] after:absolute after:-inset-2 after:rounded-full relative"
                title="Remove connection"
              >
                <Trash2 className="w-3 h-3 sm:w-2.5 sm:h-2.5" />
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
