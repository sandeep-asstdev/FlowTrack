import { describe, it, expect } from 'vitest';
import {
  GRANULAR_PERMISSIONS,
  granularPermissionSchema,
  CONFIDENTIALITY_LEVELS,
  isConfidentialityStricterOrEqual,
  validateHierarchyCycle,
  validateTaskDepth,
  calculateGovernanceProgressRollup,
} from './governance.js';

describe('Phase 1 Foundation: Governance & Hierarchy Domain Rules', () => {
  describe('1. Granular Permission Vocabulary', () => {
    it('contains all required foundation permissions', () => {
      const required = [
        'project.create',
        'project.view',
        'project.edit',
        'task.create',
        'task.assign',
        'task.update',
        'work.submit',
        'review.perform',
        'approve.task',
        'approve.privileged',
        'confidentiality.change',
        'members.manage',
        'permissions.grant',
        'project.archive',
        'project.delete',
        'project.restore',
        'audit.view',
      ];

      const declared = Object.values(GRANULAR_PERMISSIONS);
      for (const perm of required) {
        expect(declared).toContain(perm);
        expect(granularPermissionSchema.safeParse(perm).success).toBe(true);
      }
    });
  });

  describe('2. Confidentiality Classification Hierarchy & Inheritance', () => {
    it('ranks levels strictly from Public-Internal to Highly Confidential', () => {
      expect(
        isConfidentialityStricterOrEqual(
          CONFIDENTIALITY_LEVELS.CONFIDENTIAL,
          CONFIDENTIALITY_LEVELS.INTERNAL
        )
      ).toBe(true);

      expect(
        isConfidentialityStricterOrEqual(
          CONFIDENTIALITY_LEVELS.HIGHLY_CONFIDENTIAL,
          CONFIDENTIALITY_LEVELS.CONFIDENTIAL
        )
      ).toBe(true);

      // Child cannot become more relaxed than parent
      expect(
        isConfidentialityStricterOrEqual(
          CONFIDENTIALITY_LEVELS.PUBLIC_INTERNAL,
          CONFIDENTIALITY_LEVELS.RESTRICTED
        )
      ).toBe(false);

      expect(
        isConfidentialityStricterOrEqual(
          CONFIDENTIALITY_LEVELS.INTERNAL,
          CONFIDENTIALITY_LEVELS.CONFIDENTIAL
        )
      ).toBe(false);
    });
  });

  describe('3. Organizational Hierarchy & Cycle Rejection', () => {
    it('detects and rejects self-parenting', () => {
      const res = validateHierarchyCycle([], { id: 'dept-1', parentId: 'dept-1' });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('cannot be its own parent');
    });

    it('detects direct 2-node cycle (A -> B -> A)', () => {
      const existing = [{ id: 'dept-2', parentId: 'dept-1' }];
      // Proposing to set dept-1's parent to dept-2
      const res = validateHierarchyCycle(existing, { id: 'dept-1', parentId: 'dept-2' });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Circular chain detected');
    });

    it('detects deep multi-level cycle (A -> B -> C -> D -> A)', () => {
      const existing = [
        { id: 'dept-b', parentId: 'dept-a' },
        { id: 'dept-c', parentId: 'dept-b' },
        { id: 'dept-d', parentId: 'dept-c' },
      ];
      const res = validateHierarchyCycle(existing, { id: 'dept-a', parentId: 'dept-d' });
      expect(res.isValid).toBe(false);
      expect(res.cyclePath).toEqual(['dept-a', 'dept-d', 'dept-c', 'dept-b', 'dept-a']);
    });

    it('permits valid tree branching without cycles', () => {
      const existing = [
        { id: 'dept-hr', parentId: 'dept-corp' },
        { id: 'dept-eng', parentId: 'dept-corp' },
      ];
      const res = validateHierarchyCycle(existing, { id: 'dept-devops', parentId: 'dept-eng' });
      expect(res.isValid).toBe(true);
    });
  });

  describe('4. Task Hierarchy, Materialized Path & Depth Limit', () => {
    it('generates root level path for task without parent', () => {
      const res = validateTaskDepth('task-1', null);
      expect(res.isValid).toBe(true);
      expect(res.depth).toBe(1);
      expect(res.path).toBe('/task-1');
    });

    it('generates materialized path avoiding N+1 queries', () => {
      const parent = { id: 'task-1', depth: 1, path: '/task-1' };
      const res = validateTaskDepth('task-2', parent);
      expect(res.isValid).toBe(true);
      expect(res.depth).toBe(2);
      expect(res.path).toBe('/task-1/task-2');
    });

    it('permits tasks up to max depth 10', () => {
      let current = { id: 't-1', depth: 1, path: '/t-1' };
      for (let i = 2; i <= 10; i++) {
        const next = validateTaskDepth(`t-${i}`, current, 10);
        expect(next.isValid).toBe(true);
        expect(next.depth).toBe(i);
        current = { id: `t-${i}`, depth: next.depth, path: next.path };
      }

      // 11th level must fail
      const overflow = validateTaskDepth('t-11', current, 10);
      expect(overflow.isValid).toBe(false);
      expect(overflow.error).toContain('Maximum task nesting depth exceeded');
    });
  });

  describe('5. Progress Rollup Respecting Optional Children', () => {
    it('calculates weighted progress across mandatory children', () => {
      const children = [
        { progressPct: 100, weight: 1, isRequired: true },
        { progressPct: 50, weight: 1, isRequired: true },
      ];
      expect(calculateGovernanceProgressRollup(children)).toBe(75);
    });

    it('does not penalize parent progress when optional children are unfinished', () => {
      const children = [
        { progressPct: 100, weight: 1, isRequired: true },
        { progressPct: 100, weight: 1, isRequired: true },
        { progressPct: 0, weight: 1, isRequired: false }, // Optional stretch task
      ];
      // Only required tasks (both 100%) count towards progress
      expect(calculateGovernanceProgressRollup(children)).toBe(100);
    });

    it('falls back gracefully when all children are optional', () => {
      const children = [
        { progressPct: 60, weight: 1, isRequired: false },
        { progressPct: 40, weight: 1, isRequired: false },
      ];
      expect(calculateGovernanceProgressRollup(children)).toBe(50);
    });
  });
});
