import { describe, it, expect } from 'vitest';
import {
  validateParentAssignment,
  getDescendantIds,
  getBreadcrumbPath,
  MAX_HIERARCHY_DEPTH,
} from './hierarchy.js';

describe('Hierarchy Validation Engine', () => {
  const nodes = [
    { id: 'stage-1', parentNodeId: null, isGroup: true },
    { id: 'task-1-1', parentNodeId: 'stage-1', isGroup: false },
    { id: 'subtask-1-1-1', parentNodeId: 'task-1-1', isGroup: false },
    { id: 'stage-2', parentNodeId: null, isGroup: true },
  ];

  it('allows valid nesting under an existing stage', () => {
    const res = validateParentAssignment('stage-2', 'stage-1', nodes);
    expect(res.isValid).toBe(true);
    expect(res.depth).toBe(1);
  });

  it('allows moving a node to root level', () => {
    const res = validateParentAssignment('task-1-1', null, nodes);
    expect(res.isValid).toBe(true);
    expect(res.depth).toBe(0);
  });

  it('rejects self-nesting', () => {
    const res = validateParentAssignment('stage-1', 'stage-1', nodes);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Self-nesting invalid');
  });

  it('rejects cyclic nesting (parenting under a descendant)', () => {
    // stage-1 cannot be nested under task-1-1 or subtask-1-1-1
    const res = validateParentAssignment('stage-1', 'subtask-1-1-1', nodes);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Cyclic hierarchy detected');
  });

  it('rejects non-existent parent ID', () => {
    const res = validateParentAssignment('stage-1', 'non-existent-id', nodes);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('does not exist');
  });

  it('enforces maximum hierarchy depth limit', () => {
    // Construct a chain of 5 levels
    const deepChain = [
      { id: 'L0', parentNodeId: null },
      { id: 'L1', parentNodeId: 'L0' },
      { id: 'L2', parentNodeId: 'L1' },
      { id: 'L3', parentNodeId: 'L2' },
      { id: 'L4', parentNodeId: 'L3' },
      { id: 'L5', parentNodeId: 'L4' },
      { id: 'L6', parentNodeId: null },
    ];

    const res = validateParentAssignment('L6', 'L5', deepChain);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain(`Maximum allowed depth is ${MAX_HIERARCHY_DEPTH}`);
  });

  it('computes breadcrumb path correctly', () => {
    const path = getBreadcrumbPath('subtask-1-1-1', nodes);
    expect(path).toEqual(['stage-1', 'task-1-1', 'subtask-1-1-1']);
  });

  it('identifies all descendants accurately', () => {
    const descendants = getDescendantIds('stage-1', nodes);
    expect(descendants.has('task-1-1')).toBe(true);
    expect(descendants.has('subtask-1-1-1')).toBe(true);
    expect(descendants.has('stage-2')).toBe(false);
  });
});
