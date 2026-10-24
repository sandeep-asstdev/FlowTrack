export interface MinimalEdge {
  sourceNodeId: string;
  targetNodeId: string;
  kind?: string;
}

export interface DependencyValidationResult {
  isValid: boolean;
  error?: string;
  cyclePath?: string[];
}

/**
 * Validates adding a dependency edge between two nodes.
 * Prevents self-loops and directed cycles.
 */
export function validateDependencyEdge(
  existingEdges: MinimalEdge[],
  newEdge: { sourceNodeId: string; targetNodeId: string; kind?: string }
): DependencyValidationResult {
  // Rule 1: A node cannot depend on itself
  if (newEdge.sourceNodeId === newEdge.targetNodeId) {
    return {
      isValid: false,
      error: 'Self-dependency invalid: A task cannot depend on itself.',
      cyclePath: [newEdge.sourceNodeId, newEdge.targetNodeId],
    };
  }

  // Rule 2: Check for existing duplicate edge
  const isDuplicate = existingEdges.some(
    (e) =>
      e.sourceNodeId === newEdge.sourceNodeId &&
      e.targetNodeId === newEdge.targetNodeId
  );
  if (isDuplicate) {
    return {
      isValid: false,
      error: 'Duplicate connection: This dependency already exists.',
    };
  }

  // Rule 3: Only sequence and dependency edges form blocking cycles
  const relevantEdges = existingEdges.filter(
    (e) => e.kind !== 'related'
  );
  if (newEdge.kind === 'related') {
    return { isValid: true };
  }

  // Build adjacency list including the proposed edge
  const adj = new Map<string, string[]>();
  for (const edge of [...relevantEdges, newEdge]) {
    const list = adj.get(edge.sourceNodeId) || [];
    list.push(edge.targetNodeId);
    adj.set(edge.sourceNodeId, list);
  }

  // Detect cycle using DFS with path tracking
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      } else if (recursionStack.has(neighbor)) {
        // Cycle found!
        const cycleStartIndex = path.indexOf(neighbor);
        return [...path.slice(cycleStartIndex), neighbor];
      }
    }

    recursionStack.delete(node);
    path.pop();
    return null;
  }

  // Test starting from newEdge.sourceNodeId first (most likely path)
  const cycle = dfs(newEdge.sourceNodeId);
  if (cycle) {
    return {
      isValid: false,
      error: `Circular dependency detected: Adding this connection creates an invalid cycle [${cycle.join(' → ')}].`,
      cyclePath: cycle,
    };
  }

  return { isValid: true };
}

/**
 * Performs a topological sort on a DAG of nodes and edges.
 * Returns nodes in executable dependency order, or null if a cycle exists.
 */
export function topologicalSort(
  nodeIds: string[],
  edges: MinimalEdge[]
): string[] | null {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const edge of edges) {
    if (inDegree.has(edge.sourceNodeId) && inDegree.has(edge.targetNodeId)) {
      adj.get(edge.sourceNodeId)!.push(edge.targetNodeId);
      inDegree.set(
        edge.targetNodeId,
        (inDegree.get(edge.targetNodeId) || 0) + 1
      );
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);

    for (const v of adj.get(u) || []) {
      const newDeg = inDegree.get(v)! - 1;
      inDegree.set(v, newDeg);
      if (newDeg === 0) queue.push(v);
    }
  }

  return order.length === nodeIds.length ? order : null;
}
