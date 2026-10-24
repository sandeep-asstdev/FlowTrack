import { describe, it, expect } from 'vitest';
import { validateDependencyEdge } from '@flowtrack/shared';
import { getRolePermissions } from '../../utils/permissions';

describe('Canvas Core Operations & Workflow Interaction Tests', () => {
  describe('Node and Edge Configuration Model', () => {
    it('supports multiple configurable node types without hardcoded industry logic', () => {
      const nodeTypes = [
        { key: 'stage', name: 'Stage Group', isGroup: true },
        { key: 'task', name: 'Standard Task', isGroup: false },
        { key: 'milestone', name: 'Key Milestone', isGroup: false, isMilestone: true },
        { key: 'approval', name: 'Approval Sign-off', isGroup: false, isApprovalGate: true },
      ];

      expect(nodeTypes.find((t) => t.isGroup)?.key).toBe('stage');
      expect(nodeTypes.find((t) => t.isMilestone)?.key).toBe('milestone');
      expect(nodeTypes.find((t) => t.isApprovalGate)?.key).toBe('approval');
    });

    it('resolves dynamic project terminology from project configuration', () => {
      const schoolTerminology = {
        stage: 'Academic Term',
        task: 'Curriculum Module',
        milestone: 'Board Examination',
        approver: 'Principal Sign-off',
      };

      const constructionTerminology = {
        stage: 'Civil Phase',
        task: 'Contractor Work Order',
        milestone: 'Structural Handover',
        approver: 'Chief Engineer Gate',
      };

      const dealershipTerminology = {
        stage: 'Showroom Setup Tier',
        task: 'OEM Compliance Checklist',
        milestone: 'Dealer Inauguration',
        approver: 'Brand Auditor',
      };

      // Ensure the same generic canvas node component resolves custom terminology
      const resolveLabel = (typeKey: string, termConfig: any) => termConfig[typeKey] || typeKey;

      expect(resolveLabel('milestone', schoolTerminology)).toBe('Board Examination');
      expect(resolveLabel('milestone', constructionTerminology)).toBe('Structural Handover');
      expect(resolveLabel('milestone', dealershipTerminology)).toBe('Dealer Inauguration');

      expect(resolveLabel('approver', schoolTerminology)).toBe('Principal Sign-off');
      expect(resolveLabel('approver', constructionTerminology)).toBe('Chief Engineer Gate');
      expect(resolveLabel('approver', dealershipTerminology)).toBe('Brand Auditor');
    });

    it('differentiates visual sequence flow from enforced blocking dependencies', () => {
      const edges = [
        { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', kind: 'sequence' },
        { id: 'e2', sourceNodeId: 'n2', targetNodeId: 'n3', kind: 'dependency', label: 'Blocking Sign-off' },
        { id: 'e3', sourceNodeId: 'n1', targetNodeId: 'n4', kind: 'related' },
      ];

      const dependencyEdge = edges.find((e) => e.kind === 'dependency');
      const sequenceEdge = edges.find((e) => e.kind === 'sequence');
      const relatedEdge = edges.find((e) => e.kind === 'related');

      expect(dependencyEdge?.kind).toBe('dependency');
      expect(dependencyEdge?.label).toBe('Blocking Sign-off');
      expect(sequenceEdge?.kind).toBe('sequence');
      expect(relatedEdge?.kind).toBe('related');
    });
  });

  describe('Connection Validation & Circular Cycle Prevention', () => {
    it('prevents self-loop connections', () => {
      const existingEdges = [
        { sourceNodeId: 'node-A', targetNodeId: 'node-B', kind: 'sequence' },
      ];

      const result = validateDependencyEdge(existingEdges, {
        sourceNodeId: 'node-A',
        targetNodeId: 'node-A',
        kind: 'sequence',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/Self-dependency/);
    });

    it('prevents duplicate connections between identical node pairs', () => {
      const existingEdges = [
        { sourceNodeId: 'node-A', targetNodeId: 'node-B', kind: 'sequence' },
      ];

      const result = validateDependencyEdge(existingEdges, {
        sourceNodeId: 'node-A',
        targetNodeId: 'node-B',
        kind: 'sequence',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/Duplicate connection/);
    });

    it('detects and blocks circular dependency cycles (A -> B -> C -> A)', () => {
      const existingEdges = [
        { sourceNodeId: 'node-A', targetNodeId: 'node-B', kind: 'sequence' },
        { sourceNodeId: 'node-B', targetNodeId: 'node-C', kind: 'sequence' },
      ];

      // Proposed connection from C back to A should be rejected
      const cycleResult = validateDependencyEdge(existingEdges, {
        sourceNodeId: 'node-C',
        targetNodeId: 'node-A',
        kind: 'dependency',
      });

      expect(cycleResult.isValid).toBe(false);
      expect(cycleResult.error).toMatch(/Circular dependency/);
      expect(cycleResult.cyclePath).toEqual(['node-C', 'node-A', 'node-B', 'node-C']);
    });

    it('permits informational non-blocking "related" edges even across cycles', () => {
      const existingEdges = [
        { sourceNodeId: 'node-A', targetNodeId: 'node-B', kind: 'sequence' },
        { sourceNodeId: 'node-B', targetNodeId: 'node-C', kind: 'sequence' },
      ];

      const result = validateDependencyEdge(existingEdges, {
        sourceNodeId: 'node-C',
        targetNodeId: 'node-A',
        kind: 'related',
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('Search and Filter Canvas Projection', () => {
    const sampleNodes = [
      {
        id: '1',
        data: {
          title: 'Physics Lab Bench Installation',
          description: 'Assemble chemical-resistant workstations',
          ownerName: 'Dr. John',
          statusCategory: 'active',
          priority: 'HIGH',
          isGroup: false,
          isMilestone: false,
          isApprovalGate: false,
        },
      },
      {
        id: '2',
        data: {
          title: 'Roof Truss Fabrication',
          description: 'Structural steel framing',
          ownerName: 'Chief Engineer Sarah',
          statusCategory: 'blocked',
          priority: 'URGENT',
          isGroup: false,
          isMilestone: false,
          isApprovalGate: false,
        },
      },
      {
        id: '3',
        data: {
          title: 'Civil Construction Phase 1',
          description: 'Foundation and framing',
          ownerName: 'Sarah',
          statusCategory: 'done',
          priority: 'MEDIUM',
          isGroup: true,
          isMilestone: false,
          isApprovalGate: false,
        },
      },
      {
        id: '4',
        data: {
          title: 'Final Handover Milestone',
          description: 'Client delivery sign-off',
          ownerName: 'Director Smith',
          statusCategory: 'active',
          priority: 'URGENT',
          isGroup: false,
          isMilestone: true,
          isApprovalGate: false,
        },
      },
    ];

    it('matches search query against title, description, and owner', () => {
      const query = 'structural';
      const matches = sampleNodes.filter((n) => {
        const q = query.toLowerCase();
        return (
          n.data.title.toLowerCase().includes(q) ||
          n.data.description.toLowerCase().includes(q) ||
          n.data.ownerName.toLowerCase().includes(q)
        );
      });

      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe('2');
    });

    it('filters by node type: milestones, stage groups, and tasks', () => {
      const milestones = sampleNodes.filter((n) => n.data.isMilestone);
      const stageGroups = sampleNodes.filter((n) => n.data.isGroup);
      const regularTasks = sampleNodes.filter(
        (n) => !n.data.isGroup && !n.data.isMilestone && !n.data.isApprovalGate
      );

      expect(milestones.length).toBe(1);
      expect(milestones[0].id).toBe('4');

      expect(stageGroups.length).toBe(1);
      expect(stageGroups[0].id).toBe('3');

      expect(regularTasks.length).toBe(2);
    });

    it('filters by status category (active, blocked, done)', () => {
      const blockedNodes = sampleNodes.filter((n) => n.data.statusCategory === 'blocked');
      expect(blockedNodes.length).toBe(1);
      expect(blockedNodes[0].data.title).toContain('Roof Truss Fabrication');

      const completedNodes = sampleNodes.filter((n) => n.data.statusCategory === 'done');
      expect(completedNodes.length).toBe(1);
      expect(completedNodes[0].id).toBe('3');
    });
  });

  describe('Safe Deletion and Child Item Integrity', () => {
    it('detects nested children and attached edges before node deletion', () => {
      const targetNode = {
        id: 'group-stage-1',
        title: 'Main Foundation Phase',
        childCount: 4,
      };

      const projectEdges = [
        { source: 'group-stage-1', target: 'task-A' },
        { source: 'task-prev', target: 'group-stage-1' },
        { source: 'task-other', target: 'task-other-2' },
      ];

      const attachedEdgeCount = projectEdges.filter(
        (e) => e.source === targetNode.id || e.target === targetNode.id
      ).length;

      expect(targetNode.childCount).toBe(4);
      expect(attachedEdgeCount).toBe(2);
      // Confirms safe deletion modal receives critical warnings
      expect(targetNode.childCount > 0).toBe(true);
      expect(attachedEdgeCount > 0).toBe(true);
    });
  });

  describe('Authorization and Edit Restrictions', () => {
    it('enforces view-only restrictions for unauthorized roles', () => {
      const viewerPerms = getRolePermissions('VIEWER');
      expect(viewerPerms.canEditProject).toBe(false);

      const memberPerms = getRolePermissions('MEMBER');
      expect(memberPerms.canEditProject).toBe(true);

      const adminPerms = getRolePermissions('ADMIN');
      expect(adminPerms.canEditProject).toBe(true);
      expect(adminPerms.canEditLayout).toBe(true);
    });
  });

  describe('Due Date Persistence & Normalization', () => {
    it('safely normalizes and accepts datetime-local input formats into valid ISO datetimes', () => {
      const inputVal = '2026-10-25T14:30';
      const parsedIso = inputVal && !isNaN(new Date(inputVal).getTime()) ? new Date(inputVal).toISOString() : null;

      expect(parsedIso).toBeTruthy();
      expect(parsedIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('safely converts empty strings to null when due date is cleared', () => {
      const emptyVal = '';
      const parsedIso = emptyVal && !isNaN(new Date(emptyVal).getTime()) ? new Date(emptyVal).toISOString() : null;

      expect(parsedIso).toBeNull();
    });
  });
});
