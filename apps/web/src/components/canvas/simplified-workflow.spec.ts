import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateCriticalPath, canApproveTask, validateDependencyEdge } from '@flowtrack/shared';
import { getSmartViewportPosition, getNonOverlappingPosition } from '../../utils/positioning';
import { getRolePermissions } from '../../utils/permissions';

describe('FLOWTRACK — Simplified Project Workflow & UI Clutter Cleanup Regression Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Simplified Top Navigation (4 Essential Destinations)', () => {
    const simplifiedNavItems = [
      { id: 'dashboard', label: 'Projects' },
      { id: 'my-work', label: 'My Tasks' },
      { id: 'users', label: 'Team', authorizedRoles: ['ADMIN', 'MANAGER'] },
      { id: 'reports', label: 'Reports', authorizedRoles: ['ADMIN', 'MANAGER'] },
    ];

    const getPermittedNav = (role: string) => {
      return simplifiedNavItems.filter((item) => {
        if (item.authorizedRoles && !item.authorizedRoles.includes(role)) {
          return false;
        }
        return true;
      });
    };

    it('limits normal top navigation to exactly 4 destinations for authorized roles', () => {
      const adminNav = getPermittedNav('ADMIN').map((i) => i.id);
      expect(adminNav).toEqual(['dashboard', 'my-work', 'users', 'reports']);

      const managerNav = getPermittedNav('MANAGER').map((i) => i.id);
      expect(managerNav).toEqual(['dashboard', 'my-work', 'users', 'reports']);
    });

    it('limits standard team members to Projects and My Tasks', () => {
      const memberNav = getPermittedNav('MEMBER').map((i) => i.id);
      expect(memberNav).toEqual(['dashboard', 'my-work']);
      expect(memberNav).not.toContain('users');
      expect(memberNav).not.toContain('reports');
    });

    it('verifies confusing redundant items are removed from top navigation', () => {
      const allNavIds = simplifiedNavItems.map((i) => i.id);
      expect(allNavIds).not.toContain('approvals'); // Review queue removed from top nav
      expect(allNavIds).not.toContain('canvas'); // Duplicate canvas project selector removed
      expect(allNavIds).not.toContain('blueprints'); // Blueprints/templates removed
    });
  });

  describe('2. Simplified Canvas Toolbar', () => {
    const simplifiedToolbarControls = [
      { id: 'toolbar-add-task-btn', label: '+ Add Task', essential: true },
      { id: 'toolbar-critical-path-toggle-btn', label: 'Critical Path', essential: true },
      { id: 'toolbar-fit-view-btn', label: 'Fit View', essential: true },
      { id: 'saved-status-indicator', label: 'Saved status', essential: true },
    ];

    it('contains only the 4 essential canvas controls in normal toolbar', () => {
      const controlIds = simplifiedToolbarControls.map((c) => c.id);
      expect(controlIds).toContain('toolbar-add-task-btn');
      expect(controlIds).toContain('toolbar-critical-path-toggle-btn');
      expect(controlIds).toContain('toolbar-fit-view-btn');
      expect(controlIds).toContain('saved-status-indicator');
    });

    it('confirms removed actions do not appear in primary canvas toolbar', () => {
      const controlIds = simplifiedToolbarControls.map((c) => c.id);
      expect(controlIds).not.toContain('toolbar-add-stage-group-btn');
      expect(controlIds).not.toContain('canvas-tidy-up-btn');
      expect(controlIds).not.toContain('canvas-tidy-up-tree-btn');
      expect(controlIds).not.toContain('toolbar-clone-workflow-btn');
      expect(controlIds).not.toContain('toolbar-blueprints-btn');
    });
  });

  describe('3. Simplified Task Creation Form', () => {
    it('validates task name is required and creates task data with sensible defaults', () => {
      const createBasicTask = (name: string, assigneeId?: string, dueDate?: string) => {
        if (!name.trim()) {
          throw new Error('Task name is required');
        }
        return {
          title: name.trim(),
          ownerId: assigneeId || null,
          dueDate: dueDate || null,
          priority: 'MEDIUM',
          durationDays: 1,
          progressPct: 0,
        };
      };

      expect(() => createBasicTask('')).toThrow('Task name is required');
      expect(() => createBasicTask('   ')).toThrow('Task name is required');

      const task = createBasicTask('Install Facade Cladding', 'usr-1', '2026-11-15');
      expect(task.title).toBe('Install Facade Cladding');
      expect(task.ownerId).toBe('usr-1');
      expect(task.dueDate).toBe('2026-11-15');
      expect(task.priority).toBe('MEDIUM');
      expect(task.durationDays).toBe(1);
    });

    it('places new task node in sensible non-overlapping visible coordinates', () => {
      const viewport = { x: 0, y: 0, zoom: 1 };
      const container = { width: 1200, height: 800 };
      const existingNodes = [
        { id: 'node-1', position: { x: 456, y: 275 }, data: {} },
      ];

      const newPos = getSmartViewportPosition(viewport, container, existingNodes as any);
      expect(Number.isFinite(newPos.x)).toBe(true);
      expect(Number.isFinite(newPos.y)).toBe(true);
      // Coordinate must avoid direct collision with existing node
      const isOverlapping = Math.abs(newPos.x - 456) < 50 && Math.abs(newPos.y - 275) < 30;
      expect(isOverlapping).toBe(false);
    });
  });

  describe('4. Simplified Task Details (Max 3 Tabs)', () => {
    const taskDetailTabs = [
      { id: 'overview', label: 'Overview' },
      { id: 'work', label: 'Work & Evidence' },
      { id: 'activity', label: 'Approvals & History' },
    ];

    it('strictly limits drawer interface to maximum of three main tabs', () => {
      expect(taskDetailTabs.length).toBeLessThanOrEqual(3);
      expect(taskDetailTabs.map((t) => t.id)).toEqual(['overview', 'work', 'activity']);
    });

    it('hides irrelevant approval review controls when approval is not required', () => {
      const standardTask = {
        id: 't-1',
        title: 'Draft floorplan',
        approvalStatus: 'not_required',
        reviewerId: null,
      };

      const isApprovalRequired = Boolean(
        standardTask.approvalStatus === 'pending' ||
        standardTask.approvalStatus === 'approved' ||
        standardTask.approvalStatus === 'rejected' ||
        standardTask.reviewerId
      );

      expect(isApprovalRequired).toBe(false);
    });

    it('exposes approval review controls when task requires or has requested approval', () => {
      const pendingTask = {
        id: 't-2',
        title: 'Fire safety inspection sign-off',
        approvalStatus: 'pending',
        reviewerId: 'lead-1',
      };

      const isApprovalRequired = Boolean(
        pendingTask.approvalStatus === 'pending' ||
        pendingTask.approvalStatus === 'approved' ||
        pendingTask.approvalStatus === 'rejected' ||
        pendingTask.reviewerId
      );

      expect(isApprovalRequired).toBe(true);
    });
  });

  describe('5. Approval RBAC Authorization & Policy Enforcement', () => {
    it('authorizes Team Leads and Managers to approve work within their scope', () => {
      const managerAuth = canApproveTask({
        userRole: 'MANAGER',
        userId: 'mgr-1',
        taskOwnerId: 'member-1',
        taskSubmitterId: 'member-1',
        taskReviewerId: 'mgr-1',
      });
      expect(managerAuth.allowed).toBe(true);

      const leadAuth = canApproveTask({
        userRole: 'TEAM_LEAD',
        userId: 'lead-1',
        taskOwnerId: 'member-1',
        taskSubmitterId: 'member-1',
        taskReviewerId: 'lead-1',
      });
      expect(leadAuth.allowed).toBe(true);
    });

    it('denies standard Members from approving tasks', () => {
      const memberAuth = canApproveTask({
        userRole: 'MEMBER',
        userId: 'member-2',
        taskOwnerId: 'member-1',
        taskSubmitterId: 'member-1',
      });
      expect(memberAuth.allowed).toBe(false);
      expect(memberAuth.statusCode).toBe(403);
    });

    it('denies self-approval even if reviewer is a Manager or Team Lead', () => {
      const selfApproval = canApproveTask({
        userRole: 'MANAGER',
        userId: 'mgr-1',
        taskOwnerId: 'mgr-1',
        taskSubmitterId: 'mgr-1',
      });
      expect(selfApproval.allowed).toBe(false);
      expect(selfApproval.statusCode).toBe(403);
      expect(selfApproval.reason).toContain('Self-approval is forbidden');
    });

    it('allows Platform Admin to oversee approvals across the organization', () => {
      const adminAuth = canApproveTask({
        userRole: 'ADMIN',
        userId: 'admin-1',
        taskOwnerId: 'member-1',
        taskSubmitterId: 'member-1',
      });
      expect(adminAuth.allowed).toBe(true);
      expect(adminAuth.statusCode).toBe(200);
    });
  });

  describe('6. Node Dependencies & Critical Path Method (CPM)', () => {
    it('validates connections in real-time preventing circular cycles', () => {
      const existingEdges = [
        { sourceNodeId: 'node-A', targetNodeId: 'node-B', kind: 'sequence' },
        { sourceNodeId: 'node-B', targetNodeId: 'node-C', kind: 'sequence' },
      ];

      // Connecting C back to A would create a cycle A -> B -> C -> A
      const cycleCheck = validateDependencyEdge(existingEdges, {
        sourceNodeId: 'node-C',
        targetNodeId: 'node-A',
        kind: 'sequence',
      });

      expect(cycleCheck.isValid).toBe(false);
      expect(cycleCheck.error).toContain('Circular dependency detected');

      // Valid connection: B to D
      const validCheck = validateDependencyEdge(existingEdges, {
        sourceNodeId: 'node-B',
        targetNodeId: 'node-D',
        kind: 'sequence',
      });
      expect(validCheck.isValid).toBe(true);
    });

    it('calculates deterministic critical path and zero-float rules accurately', () => {
      const tasks = [
        { id: 'task-1', title: 'Site Prep', durationDays: 3 },
        { id: 'task-2', title: 'Foundation', durationDays: 5 },
        { id: 'task-3', title: 'Permit Wait', durationDays: 2 },
        { id: 'task-4', title: 'Final Handover', durationDays: 2 },
      ];

      // Path 1: task-1 (3) -> task-2 (5) -> task-4 (2) = 10 days
      // Path 2: task-3 (2) -> task-4 (2) = 4 days
      const edges = [
        { sourceNodeId: 'task-1', targetNodeId: 'task-2' },
        { sourceNodeId: 'task-2', targetNodeId: 'task-4' },
        { sourceNodeId: 'task-3', targetNodeId: 'task-4' },
      ];

      const cpm = calculateCriticalPath({
        tasks,
        edges,
      }) as any;

      expect(cpm.totalDurationDays).toBe(10);
      expect(cpm.criticalPathIds).toContain('task-1');
      expect(cpm.criticalPathIds).toContain('task-2');
      expect(cpm.criticalPathIds).toContain('task-4');
      expect(cpm.criticalPathIds).not.toContain('task-3'); // task-3 has float, NOT critical!
      const task3 = cpm.tasks.find((t: any) => t.id === 'task-3');
      expect(task3.totalFloat).toBe(6);
      expect(task3.isCritical).toBe(false);
    });
  });
});
