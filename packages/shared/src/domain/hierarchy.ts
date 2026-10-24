export interface MinimalHierarchyNode {
  id: string;
  parentNodeId?: string | null;
  nodeTypeKey?: string;
  isGroup?: boolean;
}

export interface HierarchyValidationResult {
  isValid: boolean;
  error?: string;
  depth?: number;
}

export const MAX_HIERARCHY_DEPTH = 5;

/**
 * Validates a proposed parent-child assignment in the hierarchy.
 * Prevents self-nesting, cyclic nesting, depth limit violations, and invalid type parentage.
 */
export function validateParentAssignment(
  nodeId: string,
  newParentId: string | null | undefined,
  allNodes: MinimalHierarchyNode[]
): HierarchyValidationResult {
  // If moving to root, always valid
  if (!newParentId) {
    return { isValid: true, depth: 0 };
  }

  // Rule 1: A node cannot be its own parent
  if (nodeId === newParentId) {
    return {
      isValid: false,
      error: 'Self-nesting invalid: A node cannot be its own parent.',
    };
  }

  const nodeMap = new Map<string, MinimalHierarchyNode>(
    allNodes.map((n) => [n.id, n])
  );

  const parent = nodeMap.get(newParentId);
  if (!parent) {
    return {
      isValid: false,
      error: `Parent node with ID "${newParentId}" does not exist.`,
    };
  }

  // Rule 2: Prevent cyclic ancestry (new parent cannot be a descendant of node)
  const descendants = getDescendantIds(nodeId, allNodes);
  if (descendants.has(newParentId)) {
    return {
      isValid: false,
      error: 'Cyclic hierarchy detected: A node cannot be nested inside one of its descendants.',
    };
  }

  // Rule 3: Depth check
  let depth = 1;
  let current: MinimalHierarchyNode | undefined = parent;
  while (current && current.parentNodeId) {
    depth++;
    if (depth > MAX_HIERARCHY_DEPTH) {
      return {
        isValid: false,
        error: `Hierarchy depth exceeded: Maximum allowed depth is ${MAX_HIERARCHY_DEPTH} levels.`,
      };
    }
    current = nodeMap.get(current.parentNodeId);
  }

  return { isValid: true, depth };
}

/**
 * Returns all descendant IDs for a given node.
 */
export function getDescendantIds(
  rootId: string,
  allNodes: MinimalHierarchyNode[]
): Set<string> {
  const descendants = new Set<string>();
  const childrenMap = new Map<string, string[]>();

  for (const node of allNodes) {
    if (node.parentNodeId) {
      const list = childrenMap.get(node.parentNodeId) || [];
      list.push(node.id);
      childrenMap.set(node.parentNodeId, list);
    }
  }

  const queue = [...(childrenMap.get(rootId) || [])];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (!descendants.has(currentId)) {
      descendants.add(currentId);
      const nextChildren = childrenMap.get(currentId) || [];
      queue.push(...nextChildren);
    }
  }

  return descendants;
}

/**
 * Returns the breadcrumb ancestry path from root down to the target node.
 */
export function getBreadcrumbPath(
  targetId: string,
  allNodes: MinimalHierarchyNode[]
): string[] {
  const nodeMap = new Map<string, MinimalHierarchyNode>(
    allNodes.map((n) => [n.id, n])
  );
  const path: string[] = [];

  let current = nodeMap.get(targetId);
  while (current) {
    path.unshift(current.id);
    current = current.parentNodeId ? nodeMap.get(current.parentNodeId) : undefined;
  }

  return path;
}
