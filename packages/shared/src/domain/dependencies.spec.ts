import { describe, it, expect } from 'vitest';
import {
  validateDependencyEdge,
  topologicalSort,
} from './dependencies.js';

describe('Dependency & Graph Cycle Prevention Engine', () => {
  it('allows valid sequential dependencies in a DAG', () => {
    const edges = [
      { sourceNodeId: 'A', targetNodeId: 'B', kind: 'sequence' },
      { sourceNodeId: 'B', targetNodeId: 'C', kind: 'sequence' },
    ];

    const res = validateDependencyEdge(edges, {
      sourceNodeId: 'C',
      targetNodeId: 'D',
      kind: 'sequence',
    });

    expect(res.isValid).toBe(true);
  });

  it('rejects self-loops (node depending on itself)', () => {
    const res = validateDependencyEdge([], {
      sourceNodeId: 'A',
      targetNodeId: 'A',
    });

    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Self-dependency invalid');
  });

  it('rejects duplicate connections', () => {
    const edges = [{ sourceNodeId: 'A', targetNodeId: 'B' }];
    const res = validateDependencyEdge(edges, { sourceNodeId: 'A', targetNodeId: 'B' });

    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Duplicate connection');
  });

  it('detects and rejects direct 2-node cycle (A -> B -> A)', () => {
    const edges = [{ sourceNodeId: 'A', targetNodeId: 'B', kind: 'sequence' }];
    const res = validateDependencyEdge(edges, {
      sourceNodeId: 'B',
      targetNodeId: 'A',
      kind: 'sequence',
    });

    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Circular dependency detected');
    expect(res.cyclePath).toEqual(['B', 'A', 'B']);
  });

  it('detects and rejects indirect multi-node cycle (A -> B -> C -> D -> A)', () => {
    const edges = [
      { sourceNodeId: 'A', targetNodeId: 'B', kind: 'sequence' },
      { sourceNodeId: 'B', targetNodeId: 'C', kind: 'sequence' },
      { sourceNodeId: 'C', targetNodeId: 'D', kind: 'sequence' },
    ];

    const res = validateDependencyEdge(edges, {
      sourceNodeId: 'D',
      targetNodeId: 'A',
      kind: 'sequence',
    });

    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Circular dependency detected');
    expect(res.cyclePath).toContain('A');
    expect(res.cyclePath).toContain('D');
  });

  it('allows non-blocking related edges even if forming apparent cycle', () => {
    const edges = [{ sourceNodeId: 'A', targetNodeId: 'B', kind: 'sequence' }];
    const res = validateDependencyEdge(edges, {
      sourceNodeId: 'B',
      targetNodeId: 'A',
      kind: 'related', // Non-blocking informational link
    });

    expect(res.isValid).toBe(true);
  });

  it('computes topological sort order accurately', () => {
    const nodeIds = ['D', 'A', 'C', 'B'];
    const edges = [
      { sourceNodeId: 'A', targetNodeId: 'B' },
      { sourceNodeId: 'B', targetNodeId: 'C' },
      { sourceNodeId: 'C', targetNodeId: 'D' },
    ];

    const order = topologicalSort(nodeIds, edges);
    expect(order).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns null on topological sort when graph contains a cycle', () => {
    const nodeIds = ['A', 'B', 'C'];
    const cyclicEdges = [
      { sourceNodeId: 'A', targetNodeId: 'B' },
      { sourceNodeId: 'B', targetNodeId: 'C' },
      { sourceNodeId: 'C', targetNodeId: 'A' },
    ];

    const order = topologicalSort(nodeIds, cyclicEdges);
    expect(order).toBeNull();
  });
});
