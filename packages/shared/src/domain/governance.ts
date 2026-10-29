import { z } from 'zod';

/**
 * Standard Granular Permission Vocabulary (Phase 1 Foundation)
 */
export const GRANULAR_PERMISSIONS = {
  PROJECT_CREATE: 'project.create',
  PROJECT_VIEW: 'project.view',
  PROJECT_EDIT: 'project.edit',
  PROJECT_ARCHIVE: 'project.archive',
  PROJECT_DELETE: 'project.delete',
  PROJECT_RESTORE: 'project.restore',
  TASK_CREATE: 'task.create',
  TASK_ASSIGN: 'task.assign',
  TASK_UPDATE: 'task.update',
  WORK_SUBMIT: 'work.submit',
  REVIEW_PERFORM: 'review.perform',
  APPROVE_TASK: 'approve.task',
  APPROVE_PRIVILEGED: 'approve.privileged',
  CONFIDENTIALITY_CHANGE: 'confidentiality.change',
  MEMBERS_MANAGE: 'members.manage',
  PERMISSIONS_GRANT: 'permissions.grant',
  AUDIT_VIEW: 'audit.view',
  TASK_COMPLETE: 'task.complete',
  POLICY_MANAGE: 'policy.manage',
  AUDIT_EXPORT: 'audit.export',
  OPERATION_APPROVE: 'operation.approve',
  PROJECT_PURGE: 'project.purge',
} as const;

export type GranularPermission = (typeof GRANULAR_PERMISSIONS)[keyof typeof GRANULAR_PERMISSIONS];

export const granularPermissionSchema = z.enum([
  GRANULAR_PERMISSIONS.PROJECT_CREATE,
  GRANULAR_PERMISSIONS.PROJECT_VIEW,
  GRANULAR_PERMISSIONS.PROJECT_EDIT,
  GRANULAR_PERMISSIONS.PROJECT_ARCHIVE,
  GRANULAR_PERMISSIONS.PROJECT_DELETE,
  GRANULAR_PERMISSIONS.PROJECT_RESTORE,
  GRANULAR_PERMISSIONS.TASK_CREATE,
  GRANULAR_PERMISSIONS.TASK_ASSIGN,
  GRANULAR_PERMISSIONS.TASK_UPDATE,
  GRANULAR_PERMISSIONS.WORK_SUBMIT,
  GRANULAR_PERMISSIONS.REVIEW_PERFORM,
  GRANULAR_PERMISSIONS.APPROVE_TASK,
  GRANULAR_PERMISSIONS.APPROVE_PRIVILEGED,
  GRANULAR_PERMISSIONS.CONFIDENTIALITY_CHANGE,
  GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
  GRANULAR_PERMISSIONS.PERMISSIONS_GRANT,
  GRANULAR_PERMISSIONS.AUDIT_VIEW,
  GRANULAR_PERMISSIONS.TASK_COMPLETE,
  GRANULAR_PERMISSIONS.POLICY_MANAGE,
  GRANULAR_PERMISSIONS.AUDIT_EXPORT,
  GRANULAR_PERMISSIONS.OPERATION_APPROVE,
  GRANULAR_PERMISSIONS.PROJECT_PURGE,
]);

/**
 * Scoped Role Types (Organization / Department / Team / Project / Task)
 */
export const ROLE_SCOPES = {
  ORGANIZATION: 'organization',
  DEPARTMENT: 'department',
  TEAM: 'team',
  PROJECT: 'project',
  TASK: 'task',
} as const;

export type RoleScope = (typeof ROLE_SCOPES)[keyof typeof ROLE_SCOPES];

/**
 * Configurable Confidentiality Classification Levels
 */
export const CONFIDENTIALITY_LEVELS = {
  PUBLIC_INTERNAL: 'PUBLIC_INTERNAL',
  INTERNAL: 'INTERNAL',
  RESTRICTED: 'RESTRICTED',
  CONFIDENTIAL: 'CONFIDENTIAL',
  HIGHLY_CONFIDENTIAL: 'HIGHLY_CONFIDENTIAL',
} as const;

export type ConfidentialityLevel = (typeof CONFIDENTIALITY_LEVELS)[keyof typeof CONFIDENTIALITY_LEVELS];

export const confidentialityLevelSchema = z.enum([
  'PUBLIC_INTERNAL',
  'INTERNAL',
  'RESTRICTED',
  'CONFIDENTIAL',
  'HIGHLY_CONFIDENTIAL',
]);

export const CONFIDENTIALITY_RANK: Record<ConfidentialityLevel, number> = {
  PUBLIC_INTERNAL: 1,
  INTERNAL: 2,
  RESTRICTED: 3,
  CONFIDENTIAL: 4,
  HIGHLY_CONFIDENTIAL: 5,
};

/**
 * Verifies that a child confidentiality level is at least as strict as its parent.
 * Most restrictive wins: child may only become stricter (higher rank).
 */
export function isConfidentialityStricterOrEqual(
  childLevel: ConfidentialityLevel,
  parentLevel: ConfidentialityLevel
): boolean {
  const childRank = CONFIDENTIALITY_RANK[childLevel] || 0;
  const parentRank = CONFIDENTIALITY_RANK[parentLevel] || 0;
  return childRank >= parentRank;
}

export interface HierarchyNode {
  id: string;
  parentId: string | null;
}

export interface OrgHierarchyValidationResult {
  isValid: boolean;
  error?: string;
  cyclePath?: string[];
}

/**
 * Rejects circular reporting chains and parent loops in organizational hierarchies (departments, positions, tasks).
 */
export function validateHierarchyCycle(
  existingNodes: HierarchyNode[],
  arg2: { id: string; parentId: string | null } | string,
  arg3?: string | null
): OrgHierarchyValidationResult {
  const proposed = typeof arg2 === 'string' ? { id: arg2, parentId: arg3 ?? null } : arg2;

  // Self-parenting is immediately invalid
  if (proposed.parentId && proposed.id === proposed.parentId) {
    return {
      isValid: false,
      error: `Circular reference: Entity "${proposed.id}" cannot be its own parent.`,
      cyclePath: [proposed.id, proposed.id],
    };
  }

  if (!proposed.parentId) {
    return { isValid: true };
  }

  // Build parent lookup map with the proposed relationship injected
  const parentMap = new Map<string, string | null>();
  for (const node of existingNodes) {
    parentMap.set(node.id, node.parentId);
  }
  parentMap.set(proposed.id, proposed.parentId);

  // Traverse upward from proposed.parentId to ensure we never encounter proposed.id
  const visited = new Set<string>();
  const path: string[] = [proposed.id];
  let current: string | null = proposed.parentId;

  while (current) {
    path.push(current);
    if (current === proposed.id) {
      return {
        isValid: false,
        error: `Circular chain detected: Linking "${proposed.id}" to parent "${proposed.parentId}" creates a cycle [${path.join(' → ')}].`,
        cyclePath: path,
      };
    }
    if (visited.has(current)) {
      break; // Pre-existing cycle elsewhere in graph, stop loop
    }
    visited.add(current);
    current = parentMap.get(current) || null;
  }

  return { isValid: true };
}

/**
 * Task Depth and Materialized Path Validator
 * Enforces maximum tree depth limit (default 10) and avoids N+1 queries by maintaining materialized path.
 */
export const DEFAULT_MAX_TASK_DEPTH = 10;

export interface TaskDepthValidationResult {
  isValid: boolean;
  depth: number;
  path: string;
  error?: string;
}

export function validateTaskDepth(
  arg1: string | any[],
  arg2: any,
  arg3?: any,
  arg4?: number
): TaskDepthValidationResult {
  let taskId: string;
  let parentObj: { id: string; depth?: number; path?: string } | null = null;
  let maxDepth: number = DEFAULT_MAX_TASK_DEPTH;

  if (Array.isArray(arg1)) {
    // Called as: validateTaskDepth(allNodes, taskId, parentId, maxDepth)
    const allNodes = arg1;
    taskId = arg2 as string;
    const parentId = (arg3 as string | null) || null;
    maxDepth = typeof arg4 === 'number' ? arg4 : DEFAULT_MAX_TASK_DEPTH;

    if (parentId) {
      const p = allNodes.find((n: any) => n.id === parentId);
      if (p) {
        parentObj = {
          id: p.id,
          depth: typeof p.depth === 'number' ? p.depth : 0,
          path: p.path || `/${p.id}`,
        };
      }
    }
  } else {
    // Called as: validateTaskDepth(taskId, parentObj, maxDepth)
    taskId = arg1;
    parentObj = arg2;
    maxDepth = typeof arg3 === 'number' ? arg3 : DEFAULT_MAX_TASK_DEPTH;
  }

  if (!parentObj) {
    return {
      isValid: true,
      depth: 1,
      path: `/${taskId}`,
    };
  }

  const parentDepth = typeof parentObj.depth === 'number' ? parentObj.depth : 0;
  const newDepth = parentDepth + 1;
  const parentPath = parentObj.path || `/${parentObj.id}`;
  const computedPath = `${parentPath}/${taskId}`;

  if (newDepth > maxDepth) {
    return {
      isValid: false,
      depth: newDepth,
      path: computedPath,
      error: `Maximum task nesting depth exceeded. Current depth: ${newDepth}, allowed limit: ${maxDepth}.`,
    };
  }

  return {
    isValid: true,
    depth: newDepth,
    path: computedPath,
  };
}

/**
 * Progress Rollup Engine respecting optional vs required children.
 * Optional tasks (isRequired = false) do not drag down or block progress.
 */
export interface RollupTaskItem {
  progressPct: number;
  weight?: number;
  isRequired?: boolean;
}

export function calculateGovernanceProgressRollup(children: RollupTaskItem[]): number {
  if (!children || children.length === 0) return 0;

  // Filter required vs optional
  const requiredChildren = children.filter((c) => c.isRequired !== false);

  // If there are required children, rollup is calculated across required children
  const targetItems = requiredChildren.length > 0 ? requiredChildren : children;

  let totalWeight = 0;
  let weightedProgressSum = 0;

  for (const item of targetItems) {
    const weight = typeof item.weight === 'number' && item.weight > 0 ? item.weight : 1;
    const progress = Math.min(100, Math.max(0, item.progressPct || 0));

    totalWeight += weight;
    weightedProgressSum += progress * weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedProgressSum / totalWeight) * 10) / 10;
}

/**
 * Phase 3 — Lifecycle Safety Data Transfer Objects & Types
 */
export interface ProjectDeletionImpact {
  projectId: string;
  projectName: string;
  taskCount: number;
  subtaskCount: number;
  totalNodesCount: number;
  documentCount: number;
  evidenceCount: number;
  crossProjectDependenciesCount: number;
  dependentProjects: Array<{ id: string; name: string; taskCount: number }>;
  requiresApproval: boolean;
  approvalPolicyName?: string | null;
  isProtected: boolean;
}

export interface ProjectDeleteDto {
  reason: string;
  force?: boolean;
}

export interface ProjectRestoreDto {
  reason?: string;
}

export interface ProjectPurgeDto {
  confirmationKey: string;
  justification: string;
  forceRetentionWaiver?: boolean;
}

