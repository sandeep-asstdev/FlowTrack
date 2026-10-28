/**
 * Critical Path Method (CPM) Scheduling — @flowtrack/shared
 *
 * DURATION CONVENTION: Calendar days (inclusive).
 *   A task starting on day-offset 0 with duration 5 finishes at offset 4.
 *   EF = ES + duration - 1 (offset-based), or addDays(startDate, duration - 1) in date form.
 *   Total float = LS - ES  (or equivalently LF - EF).
 *
 * DEPENDENCY KIND: Finish-to-Start (FS) only.
 *   Successor ES = max(EF of all predecessors) + 1.
 *
 * DATE CONVENTION: All dates stored as ISO strings. Calculations use day offsets
 * from project start (day 0 = first day of project). Date results are attached
 * as ISO strings on the output so consumers can display them without re-running math.
 */

export interface CpmTask {
  id: string;
  /** Human-readable label (used in path descriptions). */
  title: string;
  /**
   * Duration in calendar days (must be >= 1).
   * If undefined or < 1, treated as 1 day.
   */
  durationDays: number;
  /**
   * Optional manually-pinned start date (ISO string).
   * If provided, ES cannot be earlier than this date (converted to offset from project start).
   * The unconstrained CPM result is still calculated and stored separately.
   */
  fixedStartDate?: string;
  /** ISO string – task's actual/planned start date (stored for display). */
  startDate?: string;
  /** ISO string – task's actual/planned finish date (stored for display). */
  dueDate?: string;
  /** Status category – used only for 'overdue' flagging. */
  statusCategory?: string;
}

export interface CpmEdge {
  sourceNodeId: string;
  targetNodeId: string;
  /** Only FS edges contribute to CPM. Non-'dependency'/'sequence' edges are accepted too. */
  kind?: string;
}

export interface CpmTaskResult extends CpmTask {
  /** Earliest Start – day offset from project start (0-indexed). */
  earlyStart: number;
  /** Earliest Finish – day offset from project start. EF = ES + duration - 1. */
  earlyFinish: number;
  /** Latest Start – day offset. LS = LF - duration + 1. */
  lateStart: number;
  /** Latest Finish – day offset. LF = project duration - 1 for sinks; backwards for others. */
  lateFinish: number;
  /** Total float (slack). TF = LS - ES. Zero means on the critical path. */
  totalFloat: number;
  /** True when totalFloat === 0 (within FLOAT_TOLERANCE). */
  isCritical: boolean;
  /** Computed ES as an ISO date string (offset applied to projectStartDate). */
  earlyStartDate: string;
  /** Computed EF as an ISO date string. */
  earlyFinishDate: string;
  /** Computed LS as an ISO date string. */
  lateStartDate: string;
  /** Computed LF as an ISO date string. */
  lateFinishDate: string;
  /** Whether this task was constrained by a fixedStartDate. */
  isConstrained: boolean;
}

export interface CpmEdgeResult extends CpmEdge {
  /** True when both source and target are critical AND this edge is on the critical path. */
  isCriticalEdge: boolean;
}

export interface CpmResult {
  /** ISO string – used as day-0 anchor for all date calculations. */
  projectStartDate: string;
  /** Total planned calendar duration (days). Equal to max(EF) + 1. */
  totalDurationDays: number;
  /** Projected finish date as ISO string (projectStart + totalDurationDays - 1). */
  projectedFinishDate: string;
  /** Primary critical path: task IDs in FS order. */
  criticalPathIds: string[];
  /** All critical paths (when multiple parallel paths have equal duration). */
  criticalPaths: string[][];
  /** Human-readable primary critical path sequence (titles). */
  criticalPathTitles: string[];
  /** Full results per task. */
  tasks: CpmTaskResult[];
  /** Edges annotated with criticality. */
  edges: CpmEdgeResult[];
  /** Number of critical tasks. */
  criticalTaskCount: number;
  /** Number of tasks with float > 0. */
  slackTaskCount: number;
  /**
   * If projectDeadline is provided, this is the difference in days:
   * positive = on time, negative = overdue.
   */
  deadlineSlackDays?: number;
}

export interface CpmInput {
  tasks: CpmTask[];
  edges: CpmEdge[];
  /**
   * Anchor date for CPM calculations. Defaults to today (UTC midnight).
   * ISO string.
   */
  projectStartDate?: string;
  /**
   * Optional project deadline. If provided, deadline slack is calculated.
   * ISO string.
   */
  projectDeadline?: string;
}

export interface CpmValidationError {
  code: 'CYCLE' | 'EMPTY' | 'INVALID_DURATION' | 'MISSING_NODE';
  message: string;
  details?: string[];
}

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

/** Numeric tolerance: tasks with totalFloat <= FLOAT_TOLERANCE are critical. */
const FLOAT_TOLERANCE = 0;

/** Add `days` calendar days to a Date, return new Date (UTC). */
function addDaysUTC(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Parse an ISO string to a Date at UTC midnight (strips time component). */
function parseUTCDate(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Difference in whole calendar days: Math.round((b - a) / MS_PER_DAY). */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** Clamp duration to at least 1 day. */
function clampDuration(d: number | undefined): number {
  if (typeof d !== 'number' || !Number.isFinite(d) || d < 1) return 1;
  return Math.round(d);
}

// --------------------------------------------------------------------------
// Topological sort (Kahn's algorithm)
// --------------------------------------------------------------------------

function topoSort(nodeIds: string[], edges: CpmEdge[]): string[] | null {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDeg.set(id, 0);
    adj.set(id, []);
  }

  for (const e of edges) {
    if (!inDeg.has(e.sourceNodeId) || !inDeg.has(e.targetNodeId)) continue;
    adj.get(e.sourceNodeId)!.push(e.targetNodeId);
    inDeg.set(e.targetNodeId, (inDeg.get(e.targetNodeId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) if (deg === 0) queue.push(id);

  const order: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);
    for (const v of adj.get(u)!) {
      const newDeg = inDeg.get(v)! - 1;
      inDeg.set(v, newDeg);
      if (newDeg === 0) queue.push(v);
    }
  }

  return order.length === nodeIds.length ? order : null;
}

// --------------------------------------------------------------------------
// Critical-path reconstruction
// --------------------------------------------------------------------------

/**
 * Find all critical paths (each path is an ordered array of task IDs from source to sink).
 * Correctly identifies multiple equal-length critical paths.
 */
function findAllCriticalPaths(
  tasks: CpmTaskResult[],
  edges: CpmEdge[]
): string[][] {
  const criticalTasks = tasks.filter((t) => t.isCritical);
  const criticalSet = new Set(criticalTasks.map((t) => t.id));
  if (criticalSet.size === 0) return [];

  // Single-task project edge case
  if (tasks.length === 1 && criticalTasks.length === 1) {
    return [[criticalTasks[0].id]];
  }

  // Build adjacency for critical edges (only where tgt.earlyStart === src.earlyFinish + 1)
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of criticalSet) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const e of edges) {
    if (criticalSet.has(e.sourceNodeId) && criticalSet.has(e.targetNodeId)) {
      const src = taskMap.get(e.sourceNodeId)!;
      const tgt = taskMap.get(e.targetNodeId)!;
      if (tgt.earlyStart === src.earlyFinish + 1) {
        adj.get(e.sourceNodeId)!.push(e.targetNodeId);
        inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) || 0) + 1);
      }
    }
  }

  // Critical sources: tasks in criticalSet with in-degree 0 in the critical subgraph
  const sources = Array.from(criticalSet).filter((id) => inDegree.get(id) === 0);
  // Critical sinks: tasks in criticalSet with out-degree 0 in the critical subgraph
  const sinks = new Set(
    Array.from(criticalSet).filter((id) => (adj.get(id) || []).length === 0)
  );

  const paths: string[][] = [];

  function dfs(curr: string, currentPath: string[], visited: Set<string>) {
    if (visited.has(curr)) return;
    visited.add(curr);
    const newPath = [...currentPath, curr];
    const neighbors = adj.get(curr) || [];
    if (neighbors.length === 0) {
      if (sinks.has(curr)) {
        paths.push(newPath);
      }
      return;
    }
    for (const next of neighbors) {
      dfs(next, newPath, new Set(visited));
    }
  }

  for (const src of sources) {
    dfs(src, [], new Set());
  }

  // If DFS produced distinct paths, return them; otherwise fallback to criticalSet topological slice
  if (paths.length > 0) {
    return paths;
  }
  return criticalTasks.length > 0 ? [criticalTasks.map((t) => t.id)] : [];
}

// --------------------------------------------------------------------------
// Main CPM calculation
// --------------------------------------------------------------------------

/**
 * Calculate Critical Path Method analysis for a project.
 *
 * Returns either a `CpmResult` (success) or a `CpmValidationError`.
 */
export function calculateCriticalPath(
  input: CpmInput
): CpmResult | CpmValidationError {
  const { tasks, edges, projectStartDate, projectDeadline } = input;

  // ---- Basic validation ----
  if (!tasks || tasks.length === 0) {
    return { code: 'EMPTY', message: 'No tasks provided for CPM analysis.' };
  }

  // ---- Resolve project start date ----
  const projectStart = parseUTCDate(projectStartDate || new Date().toISOString());

  // ---- Build node ID set ----
  const nodeIds = tasks.map((t) => t.id);
  const nodeIdSet = new Set(nodeIds);

  // ---- Filter and deduplicate edges ----
  // 1. Both source and target must exist in tasks
  // 2. Reject self-dependencies (source !== target)
  // 3. Exclude non-blocking informational links (kind === 'related')
  // 4. Deduplicate multiple edges between same source and target
  const seenEdgePairs = new Set<string>();
  const validEdges: CpmEdge[] = [];
  for (const e of edges || []) {
    if (!nodeIdSet.has(e.sourceNodeId) || !nodeIdSet.has(e.targetNodeId)) continue;
    if (e.sourceNodeId === e.targetNodeId) continue;
    if (e.kind === 'related') continue;
    const pairKey = `${e.sourceNodeId}->${e.targetNodeId}`;
    if (seenEdgePairs.has(pairKey)) continue;
    seenEdgePairs.add(pairKey);
    validEdges.push(e);
  }

  // ---- Topological sort / cycle detection ----
  const order = topoSort(nodeIds, validEdges);
  if (order === null) {
    return {
      code: 'CYCLE',
      message: 'The dependency graph contains a circular dependency. CPM cannot be calculated.',
      details: ['Remove or reverse one of the cycle edges and try again.'],
    };
  }

  // ---- Build adjacency maps ----
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const id of nodeIds) {
    successors.set(id, []);
    predecessors.set(id, []);
  }
  for (const e of validEdges) {
    successors.get(e.sourceNodeId)!.push(e.targetNodeId);
    predecessors.get(e.targetNodeId)!.push(e.sourceNodeId);
  }

  // ---- Build task map for fast lookup ----
  const taskMap = new Map<string, CpmTask>();
  for (const t of tasks) taskMap.set(t.id, t);

  // ---- ES / EF (forward pass) ----
  const es = new Map<string, number>(); // earlyStart offset
  const ef = new Map<string, number>(); // earlyFinish offset

  for (const id of order) {
    const task = taskMap.get(id)!;
    const dur = clampDuration(task.durationDays);
    const preds = predecessors.get(id) || [];

    let rawES = 0;
    if (preds.length > 0) {
      rawES = Math.max(...preds.map((p) => ef.get(p)! + 1));
    }

    // Apply fixed-start constraint
    let constrainedES = rawES;
    if (task.fixedStartDate) {
      const fixedOffset = daysDiff(projectStart, parseUTCDate(task.fixedStartDate));
      constrainedES = Math.max(rawES, fixedOffset);
    }

    es.set(id, constrainedES);
    ef.set(id, constrainedES + dur - 1);
  }

  // ---- Project duration = max(EF) + 1 ----
  const maxEF = Math.max(...Array.from(ef.values()));
  const totalDurationDays = maxEF + 1; // +1 because offsets are 0-indexed inclusive

  // ---- LF / LS (backward pass) ----
  // Terminal sink tasks are evaluated against the common project completion horizon (maxEF),
  // ensuring shorter independent branches receive positive slack rather than zero slack.
  const lf = new Map<string, number>(); // lateFinish offset
  const ls = new Map<string, number>(); // lateStart offset

  // Reverse topological order
  for (const id of [...order].reverse()) {
    const task = taskMap.get(id)!;
    const dur = clampDuration(task.durationDays);
    const succs = successors.get(id) || [];

    let lfVal: number;
    if (succs.length === 0) {
      lfVal = maxEF;
    } else {
      lfVal = Math.min(...succs.map((s) => ls.get(s)! - 1));
    }

    lf.set(id, lfVal);
    ls.set(id, lfVal - dur + 1);
  }

  // ---- Connectedness in dependency network ----
  const hasEdges = validEdges.length > 0;
  const isConnected = (id: string) =>
    (predecessors.get(id) || []).length > 0 || (successors.get(id) || []).length > 0;

  // ---- Build results ----
  const taskResults: CpmTaskResult[] = tasks.map((t) => {
    const id = t.id;
    const esVal = es.get(id)!;
    const efVal = ef.get(id)!;
    const lsVal = ls.get(id)!;
    const lfVal = lf.get(id)!;
    const float = lsVal - esVal;

    // A task is critical when it has zero total float under the common project completion horizon.
    const isCritical = float <= FLOAT_TOLERANCE;

    const isConstrained =
      !!t.fixedStartDate &&
      daysDiff(projectStart, parseUTCDate(t.fixedStartDate)) > (esVal - (float > 0 ? float : 0));

    return {
      ...t,
      durationDays: clampDuration(t.durationDays),
      earlyStart: esVal,
      earlyFinish: efVal,
      lateStart: lsVal,
      lateFinish: lfVal,
      totalFloat: float,
      isCritical,
      isConstrained,
      earlyStartDate: addDaysUTC(projectStart, esVal).toISOString().slice(0, 10),
      earlyFinishDate: addDaysUTC(projectStart, efVal).toISOString().slice(0, 10),
      lateStartDate: addDaysUTC(projectStart, lsVal).toISOString().slice(0, 10),
      lateFinishDate: addDaysUTC(projectStart, lfVal).toISOString().slice(0, 10),
    };
  });

  const taskResultMap = new Map(taskResults.map((t) => [t.id, t]));

  // ---- Annotate edges ----
  const edgeResults: CpmEdgeResult[] = validEdges.map((e) => {
    const src = taskResultMap.get(e.sourceNodeId);
    const tgt = taskResultMap.get(e.targetNodeId);
    const isCriticalEdge =
      !!src &&
      !!tgt &&
      src.isCritical &&
      tgt.isCritical &&
      tgt.earlyStart === src.earlyFinish + 1;
    return { ...e, isCriticalEdge };
  });

  // ---- Critical paths (handles multiple equal-length critical paths) ----
  const allCriticalPaths = findAllCriticalPaths(taskResults, validEdges);
  const primaryPath = allCriticalPaths.length > 0 ? allCriticalPaths[0] : (tasks.length === 1 && taskResults[0].isCritical ? [taskResults[0].id] : []);
  const primaryPathTitles = primaryPath.map(
    (id) => taskResultMap.get(id)?.title || id
  );

  // ---- Projected finish date ----
  const projectedFinishDate = addDaysUTC(projectStart, maxEF).toISOString().slice(0, 10);

  // ---- Deadline slack ----
  let deadlineSlackDays: number | undefined;
  if (projectDeadline) {
    const deadlineDate = parseUTCDate(projectDeadline);
    const projFinish = addDaysUTC(projectStart, maxEF);
    deadlineSlackDays = daysDiff(projFinish, deadlineDate);
  }

  return {
    projectStartDate: projectStart.toISOString().slice(0, 10),
    totalDurationDays,
    projectedFinishDate,
    criticalPathIds: primaryPath,
    criticalPaths: allCriticalPaths,
    criticalPathTitles: primaryPathTitles,
    tasks: taskResults,
    edges: edgeResults,
    criticalTaskCount: taskResults.filter((t) => t.isCritical).length,
    slackTaskCount: taskResults.filter((t) => t.totalFloat > 0).length,
    deadlineSlackDays,
  };
}

// --------------------------------------------------------------------------
// Re-export utility used by consumers
// --------------------------------------------------------------------------

export type { CpmTask as CpmTaskInput };
