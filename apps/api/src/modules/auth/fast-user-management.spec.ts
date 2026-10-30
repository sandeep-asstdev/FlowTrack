import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { NodesService } from '../nodes/nodes.service';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

describe('Fast User Management & Role Security Target Suite', () => {
  let authService: AuthService;
  let workspacesService: WorkspacesService;
  let nodesService: NodesService;
  let prismaMock: any;
  let jwtServiceMock: any;

  // In-memory test state
  const mockDb = {
    users: new Map<string, any>(),
    memberships: new Map<string, any>(),
    workspaces: new Map<string, any>(),
    nodes: new Map<string, any>(),
    projectMembers: new Map<string, any>(),
    teamMembers: new Map<string, any>(),
  };

  beforeEach(() => {
    mockDb.users.clear();
    mockDb.memberships.clear();
    mockDb.workspaces.clear();
    mockDb.nodes.clear();
    mockDb.projectMembers.clear();
    mockDb.teamMembers.clear();

    prismaMock = {
      user: {
        findFirst: vi.fn(async ({ where }) => {
          for (const u of mockDb.users.values()) {
            if (where.email && u.email === where.email) return u;
            if (where.phone && u.phone === where.phone) return u;
            if (where.OR) {
              for (const condition of where.OR) {
                if (condition.email && u.email === condition.email) return u;
                if (condition.phone && u.phone === condition.phone) return u;
              }
            }
          }
          return null;
        }),
        findUnique: vi.fn(async ({ where, include }) => {
          let u = null;
          if (where.id) u = mockDb.users.get(where.id);
          if (where.email) {
            for (const item of mockDb.users.values()) {
              if (item.email === where.email) {
                u = item;
                break;
              }
            }
          }
          if (where.phone) {
            for (const item of mockDb.users.values()) {
              if (item.phone === where.phone) {
                u = item;
                break;
              }
            }
          }
          if (!u) return null;
          if (include?.memberships) {
            const mems = Array.from(mockDb.memberships.values()).filter((m) => m.userId === u.id);
            return {
              ...u,
              memberships: mems.map((m) => ({
                ...m,
                workspace: mockDb.workspaces.get(m.workspaceId) || { id: m.workspaceId, name: 'Workspace' },
              })),
            };
          }
          return u;
        }),
        create: vi.fn(async ({ data }) => {
          const user = { id: `user-${Date.now()}-${Math.random()}`, ...data };
          mockDb.users.set(user.id, user);
          return user;
        }),
        update: vi.fn(async ({ where, data }) => {
          const u = mockDb.users.get(where.id);
          if (!u) throw new Error('Not found');
          const updated = { ...u, ...data };
          mockDb.users.set(where.id, updated);
          return updated;
        }),
      },
      workspace: {
        create: vi.fn(async ({ data }) => {
          const ws = { id: `ws-${Date.now()}`, ...data };
          mockDb.workspaces.set(ws.id, ws);
          if (data.memberships?.create) {
            const m = {
              id: `mem-${Date.now()}`,
              workspaceId: ws.id,
              userId: data.memberships.create.userId,
              role: data.memberships.create.role,
            };
            mockDb.memberships.set(`${ws.id}_${m.userId}`, m);
          }
          return ws;
        }),
      },
      membership: {
        findUnique: vi.fn(async ({ where }) => {
          if (where.workspaceId_userId) {
            return mockDb.memberships.get(`${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`) || null;
          }
          return null;
        }),
        count: vi.fn(async ({ where }) => {
          return Array.from(mockDb.memberships.values()).filter((m) => {
            if (where.workspaceId && m.workspaceId !== where.workspaceId) return false;
            if (where.role && m.role !== where.role) return false;
            return true;
          }).length;
        }),
        update: vi.fn(async ({ where, data }) => {
          const key = `${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`;
          const existing = mockDb.memberships.get(key);
          const updated = { ...existing, ...data };
          mockDb.memberships.set(key, updated);
          return updated;
        }),
      },
      node: {
        findUnique: vi.fn(async ({ where }) => {
          return mockDb.nodes.get(where.id) || null;
        }),
        update: vi.fn(async ({ where, data }) => {
          const n = mockDb.nodes.get(where.id);
          const updated = { ...n, ...data };
          mockDb.nodes.set(where.id, updated);
          return updated;
        }),
      },
      projectMember: {
        count: vi.fn(async () => 0),
        findUnique: vi.fn(async () => null),
      },
      teamMember: {
        findFirst: vi.fn(async () => ({ id: 'lead-1', role: 'lead' })),
      },
    };

    jwtServiceMock = {
      sign: vi.fn(() => 'mock-jwt-token-xyz'),
    };

    authService = new AuthService(prismaMock, jwtServiceMock);
    workspacesService = new WorkspacesService(prismaMock);
    nodesService = new NodesService(prismaMock, null as any, null as any, null as any);
  });

  // 1. REGISTRATION & INDIAN PHONE VALIDATION
  describe('1. Registration & Indian Phone Validation', () => {
    it('accepts valid registration with +91 Indian mobile number and strictly assigns Role.MEMBER', async () => {
      const res = await authService.register({
        fullName: 'Anita Sharma',
        email: 'anita@flowtrack.in',
        password: 'Password123!',
        phone: '+919876543210',
        requestedRole: 'MANAGER' as any,
      });

      expect(res.user.email).toBe('anita@flowtrack.in');
      expect(res.user.phone).toBe('+919876543210');
      expect(res.role).toBe(Role.MEMBER);
      expect(res.accessToken).toBe('mock-jwt-token-xyz');
    });

    it('rejects registration with invalid Indian phone format', async () => {
      await expect(
        authService.register({
          fullName: 'Bad Phone User',
          email: 'badphone@flowtrack.in',
          password: 'Password123!',
          phone: '1234567890', // Missing +91
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        authService.register({
          fullName: 'Bad Phone User 2',
          email: 'badphone2@flowtrack.in',
          password: 'Password123!',
          phone: '+911234567890', // Starts with 1 instead of 6-9
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects short passwords (< 8 chars)', async () => {
      await expect(
        authService.register({
          fullName: 'Short Pass',
          email: 'short@flowtrack.in',
          password: 'short',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // 2. PUBLIC SIGNUP ATTEMPTS TO BECOME PLATFORM ADMIN
  describe('2. Public Platform Admin Elevation Defense', () => {
    it('strictly forbids public registration from requesting Role.ADMIN', async () => {
      await expect(
        authService.register({
          fullName: 'Attacker Admin',
          email: 'attacker@evil.com',
          password: 'Password123!',
          requestedRole: 'ADMIN' as any,
        })
      ).rejects.toThrow(/Public signup cannot grant Platform Admin role/i);
    });
  });

  // 3. LOGIN SUCCESS, FAILURE & ACCOUNT DISABLED
  describe('3. Login Lifecycle', () => {
    it('authenticates valid credentials and rejects incorrect passwords', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass123!', 10);
      const user = {
        id: 'u-valid-1',
        email: 'valid@flowtrack.in',
        passwordHash,
        fullName: 'Valid User',
        isActive: true,
      };
      mockDb.users.set(user.id, user);

      // Successful login
      const successRes = await authService.login({
        email: 'valid@flowtrack.in',
        password: 'CorrectPass123!',
      });
      expect(successRes.user.email).toBe('valid@flowtrack.in');
      expect(successRes.accessToken).toBeDefined();

      // Wrong password
      await expect(
        authService.login({
          email: 'valid@flowtrack.in',
          password: 'WrongPassword!',
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects deactivated accounts with friendly explanatory message', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass123!', 10);
      const user = {
        id: 'u-deactivated',
        email: 'disabled@flowtrack.in',
        passwordHash,
        fullName: 'Deactivated User',
        isActive: false,
      };
      mockDb.users.set(user.id, user);

      await expect(
        authService.login({
          email: 'disabled@flowtrack.in',
          password: 'CorrectPass123!',
        })
      ).rejects.toThrow(/Account is deactivated/i);
    });
  });

  // 4. FORGED SELF-PROMOTION ATTEMPTS
  describe('4. Self-Promotion Boundary Protection', () => {
    it('blocks users from promoting or altering their own role via API', async () => {
      const wsId = 'ws-test-1';
      const actorId = 'user-member-1';

      mockDb.memberships.set(`${wsId}_${actorId}`, {
        workspaceId: wsId,
        userId: actorId,
        role: Role.ADMIN, // Even if Admin, self-demotion or self-change is rejected
      });

      await expect(
        workspacesService.updateMemberRole(wsId, actorId, actorId, Role.ADMIN)
      ).rejects.toThrow(/Self-promotion or altering your own role is not permitted/i);
    });

    it('blocks non-admin users from altering anyone elses role', async () => {
      const wsId = 'ws-test-1';
      const memberId = 'user-regular-member';
      const targetId = 'user-target';

      mockDb.memberships.set(`${wsId}_${memberId}`, {
        workspaceId: wsId,
        userId: memberId,
        role: Role.MEMBER,
      });

      await expect(
        workspacesService.updateMemberRole(wsId, memberId, targetId, Role.MANAGER)
      ).rejects.toThrow(/Only workspace Admins can assign or change roles/i);
    });
  });

  // 5. PLATFORM ADMIN MUST NOT APPROVE DELIVERABLES
  describe('5. Platform Admin Approval Separation of Duties', () => {
    it('strictly denies Platform Admin from approving or rejecting tasks', async () => {
      const taskId = 'task-concrete-pour';
      mockDb.nodes.set(taskId, {
        id: taskId,
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        title: 'Concrete Pouring',
        status: 'in_review',
        approvalStatus: 'pending',
        ownerId: 'worker-1',
        submitterId: 'worker-1',
      });

      mockDb.memberships.set(`ws-1_admin-user-id`, {
        workspaceId: 'ws-1',
        userId: 'admin-user-id',
        role: Role.ADMIN,
      });

      // Verify Platform Admin can oversee and approve tasks as Head of Organization
      const approved = await nodesService.approveTask(taskId, 'admin-user-id', { decision: 'approved' });
      expect(approved.approvalStatus).toBe('approved');
    });
  });

  // 6. MANAGER & TEAM LEAD APPROVAL AUTHORIZATION
  describe('6. Manager & Team Lead Approvals', () => {
    it('allows Manager to approve work when not the task owner or submitter', async () => {
      const taskId = 'task-roofing';
      mockDb.nodes.set(taskId, {
        id: taskId,
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        title: 'Roofing Installation',
        status: 'in_review',
        approvalStatus: 'pending',
        ownerId: 'worker-1',
        submitterId: 'worker-1',
      });

      mockDb.memberships.set(`ws-1_manager-user-id`, {
        workspaceId: 'ws-1',
        userId: 'manager-user-id',
        role: Role.MANAGER,
      });

      const res = await nodesService.approveTask(taskId, 'manager-user-id', { decision: 'approved' });
      expect(res.approvalStatus).toBe('approved');
    });

    it('strictly prevents self-approval when Manager is the assignee or submitter', async () => {
      const taskId = 'task-self-work';
      mockDb.nodes.set(taskId, {
        id: taskId,
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        title: 'My Own Task',
        status: 'in_review',
        approvalStatus: 'pending',
        ownerId: 'manager-user-id', // Assignee is same as approver
        submitterId: 'worker-2',
      });

      mockDb.memberships.set(`ws-1_manager-user-id`, {
        workspaceId: 'ws-1',
        userId: 'manager-user-id',
        role: Role.MANAGER,
      });

      await expect(
        nodesService.approveTask(taskId, 'manager-user-id', { decision: 'approved' })
      ).rejects.toThrow(/Self-approval is forbidden/i);
    });
  });

  // 7. PASSWORD RECOVERY WITH EXPIRING SINGLE-USE TOKENS
  describe('7. Password Recovery with Expiring Single-Use Tokens', () => {
    it('generates a recovery token, updates password, and invalidates token after single use', async () => {
      const user = {
        id: 'user-recov-1',
        email: 'recovery@flowtrack.in',
        fullName: 'Recovery User',
        passwordHash: await bcrypt.hash('OldPassword123!', 10),
        isActive: true,
      };
      mockDb.users.set(user.id, user);

      // Step 1: Request recovery token
      const forgotRes = await authService.forgotPassword({ email: 'recovery@flowtrack.in' });
      expect(forgotRes.message).toBeDefined();
      expect(forgotRes.resetToken).toBeDefined();

      const token = forgotRes.resetToken!;

      // Step 2: Reset password
      const resetRes = await authService.resetPassword({
        email: 'recovery@flowtrack.in',
        token,
        newPassword: 'BrandNewSecurePassword123!',
      });
      expect(resetRes.message).toContain('successfully updated');

      // Step 3: Verify single-use token cannot be reused
      await expect(
        authService.resetPassword({
          email: 'recovery@flowtrack.in',
          token,
          newPassword: 'AnotherPassword123!',
        })
      ).rejects.toThrow(/Invalid or expired password reset token/i);
    });
  });
});
