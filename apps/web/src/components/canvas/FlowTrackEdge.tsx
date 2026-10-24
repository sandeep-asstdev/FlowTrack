import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from '@xyflow/react';
import { Plus, Trash2, Lock, ArrowRight, Link2 } from 'lucide-react';

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

  // Distinct visual styling based on workflow relationship type:
  // - 'dependency': Enforced blocking relationship (amber-orange, dashed/solid with lock badge)
  // - 'sequence': Standard operational progression (blue, solid)
  // - 'related': Non-blocking informational association (slate, dotted)
  const isDependency = kind === 'dependency';
  const isRelated = kind === 'related';

  const strokeColor = isDependency
    ? '#f59e0b'
    : isRelated
    ? '#94a3b8'
    : '#3b82f6';

  const strokeDasharray = isDependency
    ? '6 4'
    : isRelated
    ? '3 3'
    : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: isDependency ? 3 : 2.5,
          strokeDasharray,
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
          {/* Edge Badge / Type Indicator */}
          {isDependency && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1 shadow-sm"
              title="Enforced Workflow Dependency: Source must complete before target can begin"
            >
              <Lock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
              {label || 'Blocking Dependency'}
            </span>
          )}

          {!isDependency && label && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm">
              {label}
            </span>
          )}

          {/* Interactive controls (hidden if user is unauthorized/view-only) */}
          {canEdit && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Midpoint '+' insert button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onInsertNode) onInsertNode(id);
                }}
                className="w-5 h-5 rounded-full bg-white dark:bg-slate-800 border-2 border-blue-500 text-blue-600 dark:text-blue-400 hover:scale-125 hover:bg-blue-600 hover:text-white flex items-center justify-center shadow-md transition-all text-xs font-bold"
                title="Insert task between these steps"
              >
                <Plus className="w-3 h-3" />
              </button>

              {/* Quick edge delete button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onEdgeDelete) onEdgeDelete(id);
                }}
                className="w-5 h-5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-400 flex items-center justify-center shadow-sm transition-all"
                title="Remove connection"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
