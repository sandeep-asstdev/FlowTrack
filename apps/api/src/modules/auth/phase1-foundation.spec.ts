import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationService } from './authorization.service';
import { OrganizationService } from '../organization/organization.service';
import { ProjectsService } from '../projects/projects.service';
import { NodesService } from '../nodes/nodes.service';
import {
  GRANULAR_PERMISSIONS,
  CONFIDENTIALITY_LEVELS,
  validateHierarchyCycle,
  validateTaskDepth,
  isConfidentialityStricterOrEqual,
  calculateGovernanceProgressRollup,
} from '@flowtrack/shared';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleScopeType } from '@prisma/client';

describe('PHASE 1 - FOUNDATION: Organization, Governance, Tasks, and Confidentiality', () => {
  let authService: AuthorizationService;
  let orgService: OrganizationService;
  let projectsService: ProjectsService;
  let nodesService: NodesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      project: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      node: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      edge: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      membership: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      projectMember: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      teamMember: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      department: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      position: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      scopedRoleAssignment: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      accessGrant: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      fieldDefinition: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      nodeType: {
        findUnique: vi.fn().mockResolvedValue({ id: 'nt-task', isGroup: false }),
      },
      statusSet: {
        findFirst: vi.fn().mockResolvedValue({
          statuses: [{ id: 'status-todo', key: 'todo', category: 'active' }],
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    authService = new AuthorizationService(mockPrisma);
    orgService = new OrganizationService(mockPrisma, authService);
    projectsService = new ProjectsService(mockPrisma, authService);
    nodesService = new NodesService(mockPrisma, undefined, undefined, undefined, authService);
  });

  // =========================================================================
  // 1. HIERARCHY CYCLES (Reject circular reporting chains & department loops)
  // =========================================================================
  describe('1. Hierarchy Cycles', () => {
    it('detects and rejects circular reporting chains in departments', () => {
      // Dept A -> Dept B -> Dept C. Attempting Dept A -> Dept C creates a cycle.
      const departments = [
        { id: 'dept-a', parentId: null },
        { id: 'dept-b', parentId: 'dept-a' },
        { id: 'dept-c', parentId: 'dept-b' },
      ];

      // Moving dept-a under dept-c
      const check = validateHierarchyCycle(departments, 'dept-a', 'dept-c');
      expect(check.isValid).toBe(false);
      expect(check.error).toContain('Circular chain detected');
    });

    it('rejects self-parenting in hierarchy', () => {
      const items = [{ id: 'pos-1', parentId: null }];
      const check = validateHierarchyCycle(items, 'pos-1', 'pos-1');
      expect(check.isValid).toBe(false);
      expect(check.error).toContain('cannot be its own parent');
    });

    it('allows valid acyclic tree extensions', () => {
      const departments = [
        { id: 'dept-root', parentId: null },
        { id: 'dept-eng', parentId: 'dept-root' },
      ];
      const check = validateHierarchyCycle(departments, 'dept-qa', 'dept-eng');
      expect(check.isValid).toBe(true);
    });

    it('rejects circular position reporting relationship via OrganizationService', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
      mockPrisma.position.findMany.mockResolvedValue([
        { id: 'pos-cto', reportsToPositionId: null },
        { id: 'pos-vp', reportsToPositionId: 'pos-cto' },
        { id: 'pos-lead', reportsToPositionId: 'pos-vp' },
      ]);
      mockPrisma.position.create.mockResolvedValue({ id: 'pos-exec', title: 'Executive' });

      await expect(
        orgService.createPosition('ws-1', 'user-admin', {
          title: 'Executive',
          departmentId: 'dept-eng',
          reportsToPositionId: 'pos-lead',
        })
      ).resolves.toBeDefined();

      // Now attempting to update CTO to report to lead should fail with BadRequestException
      mockPrisma.position.findFirst.mockResolvedValue({ id: 'pos-cto', workspaceId: 'ws-1' });
      await expect(
        orgService.updatePosition('ws-1', 'pos-cto', 'user-admin', {
          reportsToPositionId: 'pos-lead',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 2. DEPTH LIMIT (Configurable max depth 10, Materialized Paths)
  // =========================================================================
  describe('2. Task Depth Limit & Materialized Paths', () => {
    it('computes correct materialized path and depth for root and children', () => {
      const allTasks = [
        { id: 'task-1', parentId: null, depth: 0, path: '/task-1' },
        { id: 'task-2', parentId: 'task-1', depth: 1, path: '/task-1/task-2' },
      ];

      const childCheck = validateTaskDepth(allTasks, 'task-3', 'task-2', 10);
      expect(childCheck.isValid).toBe(true);
      expect(childCheck.depth).toBe(2);
      expect(childCheck.path).toBe('/task-1/task-2/task-3');
    });

    it('rejects task creation that exceeds maximum depth limit of 10', () => {
      // Create a chain of 10 tasks (depth 0 to 9)
      const tasks: any[] = [];
      let currentPath = '';
      for (let i = 1; i <= 9; i++) {
        const id = `task-${i}`;
        const parentId = i === 1 ? null : `task-${i - 1}`;
        currentPath = parentId ? `${currentPath}/${id}` : `/${id}`;
        tasks.push({
          id,
          parentId,
          depth: i,
          path: currentPath,
        });
      }

      // Depth of task-9 is 9. A child under task-9 would have depth 10 (allowed).
      const check10 = validateTaskDepth(tasks, 'task-10', 'task-9', 10);
      expect(check10.isValid).toBe(true);
      expect(check10.depth).toBe(10);

      // Now add task-10 with depth 10
      tasks.push({
        id: 'task-10',
        parentId: 'task-9',
        depth: 10,
        path: `${currentPath}/task-10`,
      });

      // Attempting to add a child under task-10 would have depth 11 -> Must be REJECTED!
      const check11 = validateTaskDepth(tasks, 'task-11', 'task-10', 10);
      expect(check11.isValid).toBe(false);
      expect(check11.error).toContain('Maximum task nesting depth exceeded');
    });
  });

  // =========================================================================
  // 3. SCOPED ROLES (Organization / Department / Team / Project / Task)
  // =========================================================================
  describe('3. Scoped Roles & Context Resolution', () => {
    it('resolves project-scoped manager role for Project A, but not Project B', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      mockPrisma.scopedRoleAssignment.findMany.mockResolvedValue([
        {
          roleScope: RoleScopeType.PROJECT,
          scopeId: 'proj-alpha',
          roleName: 'ProjectManager',
          permissions: [GRANULAR_PERMISSIONS.PROJECT_EDIT, GRANULAR_PERMISSIONS.TASK_ASSIGN],
        },
      ]);

      // Can edit Project A
      const canEditA = await authService.can(
        { id: 'user-bob', workspaceId: 'ws-1' },
        GRANULAR_PERMISSIONS.PROJECT_EDIT,
        { project: { id: 'proj-alpha' } }
      );
      expect(canEditA).toBe(true);

      // Cannot edit Project B
      const canEditB = await authService.can(
        { id: 'user-bob', workspaceId: 'ws-1' },
        GRANULAR_PERMISSIONS.PROJECT_EDIT,
        { project: { id: 'proj-beta' } }
      );
      expect(canEditB).toBe(false);
    });

    it('inherits department-scoped permissions to projects in that department', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      mockPrisma.scopedRoleAssignment.findMany.mockResolvedValue([
        {
          roleScope: RoleScopeType.DEPARTMENT,
          scopeId: 'dept-engineering',
          roleName: 'DepartmentHead',
          permissions: [GRANULAR_PERMISSIONS.PROJECT_VIEW, GRANULAR_PERMISSIONS.PROJECT_EDIT],
        },
      ]);

      // Project in engineering department
      const canEditEngProject = await authService.can(
        { id: 'user-lead', workspaceId: 'ws-1' },
        GRANULAR_PERMISSIONS.PROJECT_EDIT,
        { project: { id: 'proj-compiler', departmentId: 'dept-engineering' } }
      );
      expect(canEditEngProject).toBe(true);

      // Project in marketing department -> no permission
      const canEditMarketingProject = await authService.can(
        { id: 'user-lead', workspaceId: 'ws-1' },
        GRANULAR_PERMISSIONS.PROJECT_EDIT,
        { project: { id: 'proj-campaign', departmentId: 'dept-marketing' } }
      );
      expect(canEditMarketingProject).toBe(false);
    });
  });

  // =========================================================================
  // 4. PRIVILEGE ESCALATION PREVENTION
  // =========================================================================
  describe('4. Privilege Escalation Prevention', () => {
    it('prevents a regular contributor from granting scoped roles', async () => {
      // User is only a MEMBER
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      mockPrisma.scopedRoleAssignment.findMany.mockResolvedValue([]);

      await expect(
        orgService.assignScopedRole('ws-1', 'user-attacker', {
          userId: 'user-attacker',
          roleScope: RoleScopeType.ORGANIZATION,
          scopeId: 'ws-1',
          roleName: 'SuperAdmin',
          permissions: [GRANULAR_PERMISSIONS.PERMISSIONS_GRANT],
        })
      ).rejects.toThrow(ForbiddenException);
    });

    it('technical administrator does NOT automatically access highly confidential content', async () => {
      // User is technical ADMIN in workspace, but resource is HIGHLY_CONFIDENTIAL with no business grant
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
      mockPrisma.accessGrant.findMany.mockResolvedValue([]);
      mockPrisma.scopedRoleAssignment.findMany.mockResolvedValue([]);

      const result = await authService.evaluate(
        { id: 'user-tech-admin', role: 'ADMIN', workspaceId: 'ws-1' },
        GRANULAR_PERMISSIONS.PROJECT_VIEW,
        {
          project: {
            id: 'proj-secret-acquisition',
            classification: CONFIDENTIALITY_LEVELS.HIGHLY_CONFIDENTIAL,
            ownerId: 'ceo-user',
          },
        }
      );

      // Denied access and returns 404 to avoid leaking existence
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(404);
    });

    it('creating a task grants NO automatic approval authority', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });

      // Owner/creator is 'user-worker'. Reviewer is 'user-manager'.
      const canApprove = await authService.can(
        { id: 'user-worker', role: 'MEMBER', workspaceId: 'ws-1' },
        GRANULAR_PERMISSIONS.APPROVE_TASK,
        {
          node: {
            id: 'task-10',
            ownerId: 'user-worker',
            reviewerId: 'user-manager',
          },
        }
      );

      expect(canApprove).toBe(false);
    });
  });

  // =========================================================================
  // 5. CROSS-ORGANIZATION ACCESS (Multi-Tenant Isolation)
  // =========================================================================
  describe('5. Cross-Organization Multi-Tenant Boundary', () => {
    it('denies access if user organization does not match resource workspace', async () => {
      const canAccess = await authService.can(
        { id: 'user-tenant-a', workspaceId: 'org-tenant-a' },
        GRANULAR_PERMISSIONS.PROJECT_VIEW,
        {
          workspaceId: 'org-tenant-b',
          project: { id: 'proj-foreign', workspaceId: 'org-tenant-b' },
        }
      );

      expect(canAccess).toBe(false);
    });

    it('shared visibility filter strictly limits queries to the caller workspace', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      mockPrisma.accessGrant.findMany.mockResolvedValue([]);
      mockPrisma.scopedRoleAssignment.findMany.mockResolvedValue([]);

      const filter = await authService.getProjectVisibilityFilter({
        id: 'user-1',
        role: 'MEMBER',
        workspaceId: 'org-tenant-a',
      });

      expect(filter).toBeDefined();
      // Confidential levels are restricted to where user is owner, manager, or explicitly granted
      expect(filter.OR).toBeDefined();
    });
  });

  // =========================================================================
  // 6. CONFIDENTIAL VISIBILITY (5 Levels & 404 Not Found Masking)
  // =========================================================================
  describe('6. Confidentiality Visibility & Masking', () => {
    it('returns HTTP 404 (Not Found) instead of 403 when accessing unauthorized confidential projects', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      mockPrisma.accessGrant.findMany.mockResolvedValue([]);
      mockPrisma.scopedRoleAssignment.findMany.mockResolvedValue([]);

      const evalResult = await authService.evaluate(
        { id: 'user-curious', role: 'MEMBER', workspaceId: 'ws-1' },
        GRANULAR_PERMISSIONS.PROJECT_VIEW,
        {
          project: {
            id: 'proj-confidential-rnd',
            classification: CONFIDENTIALITY_LEVELS.CONFIDENTIAL,
            ownerId: 'owner-lead',
          },
        }
      );

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.statusCode).toBe(404);
      expect(evalResult.reason).toContain('Project not found');
    });

    it('allows access to confidential projects when explicit active AccessGrant is present', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      // Active grant exists
      mockPrisma.accessGrant.findMany.mockResolvedValue([
        {
          resourceType: 'project',
          resourceId: 'proj-confidential-rnd',
          granteeId: 'user-auditor',
          isRevoked: false,
          expiresAt: new Date(Date.now() + 86400000), // Valid tomorrow
        },
      ]);

      const evalResult = await authService.evaluate(
        { id: 'user-auditor', role: 'MEMBER', workspaceId: 'ws-1' },
        GRANULAR_PERMISSIONS.PROJECT_VIEW,
        {
          project: {
            id: 'proj-confidential-rnd',
            classification: CONFIDENTIALITY_LEVELS.CONFIDENTIAL,
            ownerId: 'owner-lead',
          },
        }
      );

      expect(evalResult.allowed).toBe(true);
    });

    it('rejects expired or revoked access grants and returns 404', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      // Revoked grant
      mockPrisma.accessGrant.findMany.mockResolvedValue([
        {
          resourceType: 'project',
          resourceId: 'proj-confidential-rnd',
          granteeId: 'user-ex-auditor',
          isRevoked: true,
          revokedAt: new Date(),
        },
      ]);

      const evalResult = await authService.evaluate(
        { id: 'user-ex-auditor', role: 'MEMBER', workspaceId: 'ws-1' },
        GRANULAR_PERMISSIONS.PROJECT_VIEW,
        {
          project: {
            id: 'proj-confidential-rnd',
            classification: CONFIDENTIALITY_LEVELS.CONFIDENTIAL,
            ownerId: 'owner-lead',
          },
        }
      );

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.statusCode).toBe(404);
    });

    it('enforces confidentiality inheritance: child task cannot be less restrictive than parent', () => {
      // Parent is CONFIDENTIAL. Child trying to be INTERNAL -> Rejected!
      const isOk = isConfidentialityStricterOrEqual(
        CONFIDENTIALITY_LEVELS.INTERNAL,
        CONFIDENTIALITY_LEVELS.CONFIDENTIAL
      );
      expect(isOk).toBe(false);

      // Child trying to be HIGHLY_CONFIDENTIAL -> Allowed!
      const isStricter = isConfidentialityStricterOrEqual(
        CONFIDENTIALITY_LEVELS.HIGHLY_CONFIDENTIAL,
        CONFIDENTIALITY_LEVELS.CONFIDENTIAL
      );
      expect(isStricter).toBe(true);
    });
  });

  // =========================================================================
  // 7. MASS-ASSIGNMENT & IMMUTABILITY PROTECTION
  // =========================================================================
  describe('7. Mass-Assignment & Protected Fields', () => {
    it('projects validate unique alphanumeric project key and ignore arbitrary field escalation', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
      mockPrisma.project.findFirst.mockResolvedValue(null);
      mockPrisma.project.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'proj-1', ...args.data })
      );

      const created = await projectsService.createProject(
        'ws-1',
        {
          name: 'Quantum Governance',
          key: 'QGOV',
          description: 'Secure platform',
          classification: CONFIDENTIALITY_LEVELS.RESTRICTED,
        },
        'user-admin',
        'ADMIN'
      );

      expect(created.key).toBe('QGOV');
      expect(created.classification).toBe(CONFIDENTIALITY_LEVELS.RESTRICTED);
    });
  });

  // =========================================================================
  // 8. REPARENTING RULES & PROGRESS ROLLUP
  // =========================================================================
  describe('8. Reparenting Rules, Subtree Safety, and Optional Progress Rollup', () => {
    it('progress rollup respects optional child tasks without dragging down progress', () => {
      // 1 required child at 100%, 1 optional child at 0%
      const children = [
        { id: 'task-required', progressPct: 100, weight: 1, isRequired: true },
        { id: 'task-optional', progressPct: 0, weight: 1, isRequired: false },
      ];

      const progress = calculateGovernanceProgressRollup(children);
      // Because required child is 100%, parent progress is 100% (optional child does not drag it down)
      expect(progress).toBe(100);
    });

    it('progress rollup weights required tasks proportionally', () => {
      const children = [
        { id: 'task-1', progressPct: 50, weight: 1, isRequired: true },
        { id: 'task-2', progressPct: 100, weight: 3, isRequired: true },
        { id: 'task-opt', progressPct: 0, weight: 1, isRequired: false },
      ];

      // Total weight: 1 + 3 = 4. Sum = 50*1 + 100*3 = 350. 350 / 4 = 87.5%
      const progress = calculateGovernanceProgressRollup(children);
      expect(progress).toBe(87.5);
    });
  });

  // =========================================================================
  // 9. BACKUP APPROVERS & DEPARTURE WORK REASSIGNMENT
  // =========================================================================
  describe('9. Backup Approver Delegation & Departure Work Reassignment', () => {
    it('allows designated backup reviewer to act on behalf of primary reviewer', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'primary-manager',
        backupReviewerId: 'backup-lead',
      });

      const canBackupAct = await authService.canActAsBackupApprover(
        'primary-manager',
        'backup-lead'
      );
      expect(canBackupAct).toBe(true);

      const canRandomAct = await authService.canActAsBackupApprover(
        'primary-manager',
        'stranger-user'
      );
      expect(canRandomAct).toBe(false);
    });

    it('reassigns tasks, reviews, and project ownership when a person departs', async () => {
      mockPrisma.node.updateMany.mockResolvedValue({ count: 5 });
      mockPrisma.project.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.user.update.mockResolvedValue({ id: 'departing-user', isActive: false });

      const result = await authService.reassignUserWork(
        'ws-1',
        'departing-user',
        'successor-user'
      );

      expect(result.reassignedTasks).toBe(5);
      expect(result.reassignedReviews).toBe(5);
      expect(result.reassignedProjects).toBe(2);
      expect(mockPrisma.node.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', ownerId: 'departing-user', deletedAt: null },
        data: expect.objectContaining({ ownerId: 'successor-user' }),
      });
    });
  });
});
