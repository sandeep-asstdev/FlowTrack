import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from '@xyflow/react';
import { Plus, Trash2 } from 'lucide-react';

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

  const onEdgeDelete = (data as any)?.onDelete;
  const onInsertNode = (data as any)?.onInsert;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: '#3b82f6',
          strokeWidth: 2.5,
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
          className="nodrag nopan flex items-center gap-1 group"
        >
          {/* Midpoint '+' insert button (n8n signature UX) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onInsertNode) onInsertNode(id);
            }}
            className="w-5 h-5 rounded-full bg-white dark:bg-slate-800 border-2 border-blue-500 text-blue-600 dark:text-blue-400 hover:scale-125 hover:bg-blue-600 hover:text-white flex items-center justify-center shadow-md transition-all text-xs font-bold"
            title="Insert node between these two steps"
          >
            <Plus className="w-3 h-3" />
          </button>

          {/* Quick edge delete button on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onEdgeDelete) onEdgeDelete(id);
            }}
            className="w-5 h-5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-400 opacity-0 group-hover:opacity-100 flex items-center justify-center shadow-sm transition-all"
            title="Delete this connection"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
