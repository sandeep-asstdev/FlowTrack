import { getTaskStateMetadata } from '@flowtrack/shared';
import { ApiClient } from '../../services/api';
import React, { useState, useMemo } from 'react';
import {
  List,
  Kanban,
  FolderTree,
  Calendar as CalendarIcon,
  Clock,
  ChevronRight,
  ChevronDown,
  User,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Lock,
  Shield,
  Layers,
  ArrowRight,
  Plus,
} from 'lucide-react';

export type ProjectViewMode = 'canvas' | 'list' | 'board' | 'tree' | 'timeline' | 'calendar';

export interface WorkspaceViewsProps {
  viewMode: ProjectViewMode;
  nodes: any[];
  edges: any[];
  project: any;
  onSelectNode: (nodeId: string) => void;
  onAddNode?: (parentId?: string) => void;
}

export const WorkspaceViews: React.FC<WorkspaceViewsProps> = ({
  viewMode,
  nodes,
  edges,
  project,
  onSelectNode,
  onAddNode,
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggingTaskId(taskId);
  };

  const handleColumnDrop = async (e: React.DragEvent, colTargetState: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    if (!taskId) return;
    setDraggingTaskId(null);

    let targetState = colTargetState;
    if (colTargetState === 'Draft') targetState = 'Draft';
    else if (colTargetState === 'In Progress') targetState = 'In Progress';
    else if (colTargetState === 'Blocked') targetState = 'Blocked';
    else if (colTargetState === 'In Review') targetState = 'Ready for Review';
    else if (colTargetState === 'Approved') targetState = 'Approved';
    else if (colTargetState === 'Completed') targetState = 'Completed';

    try {
      setToastMessage(null);
      await ApiClient.transitionNode(taskId, targetState);
      if (onSelectNode) {
        onSelectNode(taskId);
      }
    } catch (err: any) {
      const msg = err.message || `Cannot transition task to ${targetState}`;
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 6000);
    }
  };

  // Helper to extract clean data from nodes
  const parsedNodes = useMemo(() => {
    return nodes.map((n) => {
      const d = n.data || n;
      const taskState = d.state || n.state || 'Draft';
      const meta = getTaskStateMetadata(taskState);
      return {
        id: n.id,
        title: d.title || d.label || 'Untitled Task',
        description: d.description || '',
        state: taskState,
        statusKey: meta.category,
        statusName: meta.label,
        statusCategory: meta.category,
        statusColour: meta.colour,
        priority: d.priority || 'MEDIUM',
        progressPct: d.progressPct || 0,
        dueDate: d.dueDate || null,
        startDate: d.startDate || null,
        owner: d.owner || null,
        ownerId: d.ownerId || null,
        assignedBy: d.assignedBy || null,
        reviewer: d.reviewer || null,
        parentNodeId: d.parentNodeId || null,
        isMilestone: d.isMilestone || false,
        classification: d.classification || project?.classification || 'INTERNAL',
        approvalStatus: d.approvalStatus || 'not_required',
      };
    });
  }, [nodes, project]);

  // =========================================================================
  // 1. LIST VIEW
  // =========================================================================
  if (viewMode === 'list') {
    return (
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-900/50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <List className="w-4 h-4 text-blue-600" />
                <span>Task List ({parsedNodes.length})</span>
              </h2>
              <p className="text-xs text-slate-500">All tasks and deliverables for {project.name}</p>
            </div>
            {onAddNode && (
              <button
                onClick={() => onAddNode()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Task</span>
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3 px-4">Task Name</th>
                    <th className="py-3 px-3">State / Approval</th>
                    <th className="py-3 px-3">Priority</th>
                    <th className="py-3 px-3">Assignee</th>
                    <th className="py-3 px-3">Due Date</th>
                    <th className="py-3 px-3">Progress</th>
                    <th className="py-3 px-3">Confidentiality</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-slate-800 dark:text-slate-200">
                  {parsedNodes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No tasks found in this project. Click "+ Add Task" to create one.
                      </td>
                    </tr>
                  ) : (
                    parsedNodes.map((task) => {
                      const isOverdue =
                        task.dueDate &&
                        new Date(task.dueDate) < new Date() &&
                        task.statusCategory !== 'done' &&
                        task.state !== 'Completed';

                      return (
                        <tr
                          key={task.id}
                          onClick={() => onSelectNode(task.id)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            {task.parentNodeId && (
                              <span className="text-slate-400 text-[10px] pl-3 border-l-2 border-slate-200 dark:border-slate-700">
                                ↳
                              </span>
                            )}
                            <span className="truncate max-w-xs">{task.title}</span>
                            {task.isMilestone && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold">
                                Milestone
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold inline-block"
                              style={{
                                backgroundColor: `${task.statusColour}20`,
                                color: task.statusColour,
                              }}
                            >
                              {task.state || task.statusName}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                task.priority === 'CRITICAL' || task.priority === 'HIGH'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                  : task.priority === 'MEDIUM'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {task.priority}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              {task.owner?.avatarUrl ? (
                                <img
                                  src={task.owner.avatarUrl}
                                  alt=""
                                  className="w-5 h-5 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold">
                                  {task.owner?.fullName?.[0] || 'U'}
                                </div>
                              )}
                              <span className="truncate max-w-[100px] text-xs">
                                {task.owner?.fullName || 'Unassigned'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {task.dueDate ? (
                              <span
                                className={`text-[11px] font-medium ${
                                  isOverdue
                                    ? 'text-rose-600 dark:text-rose-400 font-bold'
                                    : 'text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {new Date(task.dueDate).toLocaleDateString()}
                                {isOverdue && ' ⚠️'}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                <div
                                  className="h-full bg-blue-600 rounded-full"
                                  style={{ width: `${task.progressPct}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-slate-500">
                                {task.progressPct}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {task.classification}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(task.id);
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-300 text-xs font-semibold"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. KANBAN BOARD VIEW
  // =========================================================================
  if (viewMode === 'board') {
    const columns = [
      { key: 'Draft', title: 'Draft / Backlog', states: ['Draft', 'todo'] },
      { key: 'In Progress', title: 'In Progress', states: ['Assigned', 'Accepted', 'In Progress', 'active'] },
      { key: 'Blocked', title: 'Blocked', states: ['Blocked', 'blocked'] },
      { key: 'In Review', title: 'In Review / Changes', states: ['Ready for Review', 'In Review', 'Changes Requested', 'Resubmitted'] },
      { key: 'Approved', title: 'Approved', states: ['Approved'] },
      { key: 'Completed', title: 'Completed', states: ['Completed', 'done'] },
    ];

    return (
      <div className="flex-1 overflow-x-auto bg-slate-50/50 dark:bg-slate-900/50 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Kanban className="w-4 h-4 text-indigo-600" />
              <span>Project Board</span>
            </h2>
            <p className="text-xs text-slate-500">Drag and drop cards between columns to progress task lifecycle</p>
          </div>
        </div>

        {toastMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 font-semibold flex items-center justify-between">
            <span>⚠️ {toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="text-rose-600 hover:text-rose-800 font-bold ml-2">✕</button>
          </div>
        )}

        <div className="flex gap-4 min-h-[500px] items-start">
          {columns.map((col) => {
            const colTasks = parsedNodes.filter(
              (n) => col.states.includes(n.state) || col.states.includes(n.statusCategory)
            );

            return (
              <div
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDrop={(e) => handleColumnDrop(e, col.key)}
                className="w-72 shrink-0 bg-slate-100/70 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-200 dark:border-slate-700 flex flex-col max-h-[calc(100vh-200px)] transition-colors hover:border-blue-400"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>{col.title}</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white dark:bg-slate-700 font-extrabold text-slate-600 dark:text-slate-300">
                      {colTasks.length}
                    </span>
                  </h3>
                </div>

                <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
                  {colTasks.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                      No tasks
                    </div>
                  ) : (
                    colTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={() => onSelectNode(task.id)}
                        className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs hover:border-blue-500 cursor-grab active:cursor-grabbing transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              task.priority === 'CRITICAL' || task.priority === 'HIGH'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {task.priority}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold">
                            {task.classification}
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                          {task.title}
                        </h4>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}</span>
                          </div>
                          <span className="font-bold">{task.progressPct}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 3. TREE VIEW (EXPANDABLE HIERARCHY)
  // =========================================================================
  if (viewMode === 'tree') {
    return (
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-900/50 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-600" />
                <span>Task Breakdown Structure (Tree)</span>
              </h2>
              <p className="text-xs text-slate-500">Materialized parent-child hierarchy with progress rollups</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-xs space-y-2">
            {parsedNodes.filter((n) => !n.parentNodeId).length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">No root tasks defined.</div>
            ) : (
              parsedNodes
                .filter((n) => !n.parentNodeId)
                .map((rootNode) => (
                  <TreeNodeItem
                    key={rootNode.id}
                    node={rootNode}
                    allNodes={parsedNodes}
                    onSelectNode={onSelectNode}
                    depth={0}
                  />
                ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 4. TIMELINE / GANTT VIEW
  // =========================================================================
  if (viewMode === 'timeline') {
    return (
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-900/50 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600" />
                <span>Project Timeline (Gantt)</span>
              </h2>
              <p className="text-xs text-slate-500">Chronological schedule and milestone schedule</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-xs space-y-3">
            {parsedNodes.map((task) => (
              <div
                key={task.id}
                onClick={() => onSelectNode(task.id)}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-purple-400 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                    {task.isMilestone ? '◆ ' : '▪ '} {task.title}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Owner: {task.owner?.fullName || 'Unassigned'} • Status: {task.state}
                  </span>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="w-40 sm:w-60 h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden relative">
                    <div
                      className="h-full bg-purple-600 rounded-full"
                      style={{ width: `${task.progressPct}%` }}
                    />
                  </div>
                  <div className="text-right text-[11px] font-semibold text-slate-600 dark:text-slate-400 min-w-[90px]">
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No Due Date'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 5. CALENDAR VIEW
  // =========================================================================
  if (viewMode === 'calendar') {
    return (
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-900/50 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-amber-600" />
                <span>Project Due Date Calendar</span>
              </h2>
              <p className="text-xs text-slate-500">Task deadlines organized by schedule date</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {parsedNodes.map((task) => (
              <div
                key={task.id}
                onClick={() => onSelectNode(task.id)}
                className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs hover:border-amber-500 cursor-pointer space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-md">
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Due Date'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">{task.priority}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {task.title}
                </h4>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>{task.owner?.fullName || 'Unassigned'}</span>
                  <span className="font-semibold">{task.state}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// Recursive Tree Node Item
const TreeNodeItem: React.FC<{
  node: any;
  allNodes: any[];
  onSelectNode: (nodeId: string) => void;
  depth: number;
}> = ({ node, allNodes, onSelectNode, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const children = allNodes.filter((n) => n.parentNodeId === node.id);

  return (
    <div className="space-y-1">
      <div
        onClick={() => onSelectNode(node.id)}
        className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
        style={{ paddingLeft: `${depth * 20 + 10}px` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {children.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-3.5 h-3.5 inline-block" />
          )}

          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
            {node.title}
          </span>

          {children.length > 0 && (
            <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.2 bg-slate-100 dark:bg-slate-700 rounded-full">
              {children.length} subtasks
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
            {node.state}
          </span>
          <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 w-10 text-right">
            {node.progressPct}%
          </span>
        </div>
      </div>

      {expanded && children.length > 0 && (
        <div className="space-y-1">
          {children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              allNodes={allNodes}
              onSelectNode={onSelectNode}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

