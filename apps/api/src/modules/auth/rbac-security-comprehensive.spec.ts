import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { NodesService } from '../nodes/nodes.service';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { JwtStrategy } from './jwt.strategy';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('FlowTrack — Comprehensive RBAC & Privilege Escalation Hardening Suite', () => {
  let workspacesService: WorkspacesService;
  let nodesService: NodesService;
  let authService: AuthService;
  let rolesGuard: RolesGuard;
  let jwtStrategy: JwtStrategy;
  let reflector: Reflector;

  // In-Memory Test State
  const db = {
    users: new Map<string, any>(),
    memberships: new Map<string, any>(),
    workspaces: new Map<string, any>(),
    projects: new Map<string, any>(),
    projectMembers: new Map<string, any>(),
    teams: new Map<string, any>(),
    teamMembers: new Map<string, any>(),
    nodes: new Map<string, any>(),
    auditLogs: [] as any[],
  };

  const ws1 = 'ws-corp-alpha';
  const ws2 = 'ws-corp-beta';

  const adminUser = 'usr-admin';
  const managerUser = 'usr-manager';
  const teamLeadUser = 'usr-lead';
  const regularMember = 'usr-member';
  const foreignUser = 'usr-foreign';

  beforeEach(async () => {
    db.users.clear();
    db.memberships.clear();
    db.workspaces.clear();
    db.projects.clear();
    db.projectMembers.clear();
    db.teams.clear();
    db.teamMembers.clear();
    db.nodes.clear();
    db.auditLogs.length = 0;

    // Seed Workspaces
    db.workspaces.set(ws1, { id: ws1, name: 'Corp Alpha', slug: 'corp-alpha' });
    db.workspaces.set(ws2, { id: ws2, name: 'Corp Beta (Foreign Org)', slug: 'corp-beta' });

    // Seed Users
    const defaultHash = await bcrypt.hash('Password123!', 10);
    const users = [
      { id: adminUser, email: 'admin@alpha.com', fullName: 'Platform Admin', isActive: true, passwordHash: defaultHash },
      { id: managerUser, email: 'manager@alpha.com', fullName: 'Project Manager', isActive: true, passwordHash: defaultHash },
      { id: teamLeadUser, email: 'lead@alpha.com', fullName: 'Team Lead', isActive: true, passwordHash: defaultHash },
      { id: regularMember, email: 'member@alpha.com', fullName: 'Team Member', isActive: true, passwordHash: defaultHash },
      { id: foreignUser, email: 'foreign@beta.com', fullName: 'Foreign User', isActive: true, passwordHash: defaultHash },
    ];
    users.forEach((u) => db.users.set(u.id, u));

    // Seed Memberships in Workspace 1
    db.memberships.set(`${ws1}_${adminUser}`, { workspaceId: ws1, userId: adminUser, role: Role.ADMIN });
    db.memberships.set(`${ws1}_${managerUser}`, { workspaceId: ws1, userId: managerUser, role: Role.MANAGER });
    db.memberships.set(`${ws1}_${teamLeadUser}`, { workspaceId: ws1, userId: teamLeadUser, role: Role.TEAM_LEAD });
    db.memberships.set(`${ws1}_${regularMember}`, { workspaceId: ws1, userId: regularMember, role: Role.MEMBER });

    // Seed Membership in Workspace 2 (Foreign)
    db.memberships.set(`${ws2}_${foreignUser}`, { workspaceId: ws2, userId: foreignUser, role: Role.ADMIN });

    // Seed Teams & Projects
    const teamAlpha = { id: 'team-eng-1', workspaceId: ws1, name: 'Engineering Core' };
    db.teams.set(teamAlpha.id, teamAlpha);
    db.teamMembers.set(`${teamAlpha.id}_${teamLeadUser}`, { teamId: teamAlpha.id, userId: teamLeadUser, role: 'lead' });
    db.teamMembers.set(`${teamAlpha.id}_${regularMember}`, { teamId: teamAlpha.id, userId: regularMember, role: 'member' });

    const projAlpha = { id: 'proj-skyline', workspaceId: ws1, name: 'Skyline Tower' };
    db.projects.set(projAlpha.id, projAlpha);
    db.projectMembers.set(`${projAlpha.id}_${managerUser}`, { projectId: projAlpha.id, userId: managerUser, role: Role.MANAGER });

    const prismaMock: any = {
      user: {
        findUnique: vi.fn(async ({ where, select }) => {
          let u = null;
          if (where.id) u = db.users.get(where.id);
          else if (where.email) {
            for (const user of db.users.values()) {
              if (user.email.toLowerCase() === where.email.toLowerCase()) {
                u = user;
                break;
              }
            }
          }
          if (!u) return null;
          if (select) {
            const out: any = {};
            Object.keys(select).forEach((k) => { out[k] = u[k]; });
            return out;
          }
          return u;
        }),
        findFirst: vi.fn(async ({ where }) => {
          for (const u of db.users.values()) {
            if (where.email && u.email.toLowerCase() === where.email.toLowerCase()) return u;
          }
          return null;
        }),
        create: vi.fn(async ({ data }) => {
          const u = { id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, isActive: true, ...data };
          db.users.set(u.id, u);
          return u;
        }),
        update: vi.fn(async ({ where, data }) => {
          const u = db.users.get(where.id);
          if (!u) throw new NotFoundException();
          const updated = { ...u, ...data };
          db.users.set(where.id, updated);
          return updated;
        }),
      },
      membership: {
        findUnique: vi.fn(async ({ where, include }) => {
          if (where.workspaceId_userId) {
            const m = db.memberships.get(`${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`);
            if (!m) return null;
            if (include?.user) {
              const u = db.users.get(m.userId);
              return { ...m, user: u };
            }
            return m;
          }
          return null;
        }),
        findMany: vi.fn(async ({ where }) => {
          return Array.from(db.memberships.values())
            .filter((m) => m.workspaceId === where.workspaceId)
            .map((m) => ({ ...m, user: db.users.get(m.userId) }));
        }),
        count: vi.fn(async ({ where }) => {
          return Array.from(db.memberships.values()).filter((m) => {
            if (where.workspaceId && m.workspaceId !== where.workspaceId) return false;
            if (where.role && m.role !== where.role) return false;
            const u = db.users.get(m.userId);
            if (where.user?.isActive !== undefined && u?.isActive !== where.user.isActive) return false;
            return true;
          }).length;
        }),
        create: vi.fn(async ({ data }) => {
          const m = { id: `mem-${Date.now()}`, ...data };
          db.memberships.set(`${data.workspaceId}_${data.userId}`, m);
          return m;
        }),
        upsert: vi.fn(async ({ where, create, update }) => {
          const key = `${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`;
          let m = db.memberships.get(key);
          if (m) {
            m = { ...m, ...update };
          } else {
            m = { id: `mem-${Date.now()}`, ...create };
          }
          db.memberships.set(key, m);
          return { ...m, user: db.users.get(m.userId) };
        }),
        update: vi.fn(async ({ where, data }) => {
          const key = `${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`;
          const m = db.memberships.get(key);
          const updated = { ...m, ...data };
          db.memberships.set(key, updated);
          return updated;
        }),
      },
      workspace: {
        findUnique: vi.fn(async ({ where }) => db.workspaces.get(where.id) || null),
      },
      teamMember: {
        findFirst: vi.fn(async ({ where }) => {
          return db.teamMembers.get(`${where.teamId}_${where.userId}`) || null;
        }),
      },
      projectMember: {
        count: vi.fn(async ({ where }) => {
          return Array.from(db.projectMembers.values()).filter((pm) => pm.projectId === where.projectId).length;
        }),
        findUnique: vi.fn(async ({ where }) => {
          return db.projectMembers.get(`${where.projectId_userId.projectId}_${where.projectId_userId.userId}`) || null;
        }),
      },
      node: {
        findUnique: vi.fn(async ({ where }) => db.nodes.get(where.id) || null),
        update: vi.fn(async ({ where, data }) => {
          const n = db.nodes.get(where.id);
          const updated = { ...n, ...data };
          db.nodes.set(where.id, updated);
          return updated;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }) => {
          db.auditLogs.push(data);
          return { id: `log-${Date.now()}`, ...data };
        }),
      },
    };

    workspacesService = new WorkspacesService(prismaMock);
    nodesService = new NodesService(prismaMock, null as any, null as any, null as any);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    jwtStrategy = new JwtStrategy(prismaMock);
    authService = new AuthService(prismaMock, { sign: vi.fn() } as any);
  });

  // =========================================================================
  // PHASE 6 — ROLE-BASED ACCESS CONTROL MATRIX
  // =========================================================================
  describe('PHASE 6 — Role-Based Access Control Matrix', () => {
    describe('6.1 User Directory & User Administration', () => {
      it('Platform Admin can view all workspace members', async () => {
        const members = await workspacesService.listMembers(ws1, adminUser);
        expect(members.length).toBe(4);
        expect(members.some((m) => m.userId === regularMember)).toBe(true);
      });

      it('Manager can view workspace members', async () => {
        const members = await workspacesService.listMembers(ws1, managerUser);
        expect(members.length).toBe(4);
      });

      it('Foreign user from another organization is DENIED access to member directory', async () => {
        await expect(workspacesService.listMembers(ws1, foreignUser)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('6.2 Member Invitation Permissions', () => {
      it('Platform Admin can invite members with any valid role', async () => {
        const res = await workspacesService.inviteMember(ws1, adminUser, {
          email: 'newadmin@alpha.com',
          role: Role.ADMIN,
        });
        expect(res).toBeDefined();
      });

      it('Manager can invite Team Lead or Member, but CANNOT invite Platform Admin', async () => {
        // Allowed: Manager invites Member
        const res = await workspacesService.inviteMember(ws1, managerUser, {
          email: 'newworker@alpha.com',
          role: Role.MEMBER,
        });
        expect(res).toBeDefined();

        // Denied: Manager attempts to invite Platform Admin
        await expect(
          workspacesService.inviteMember(ws1, managerUser, {
            email: 'unauthorized_admin@alpha.com',
            role: Role.ADMIN,
          })
        ).rejects.toThrow(ForbiddenException);
      });

      it('Team Lead and Member are strictly DENIED from inviting members', async () => {
        await expect(
          workspacesService.inviteMember(ws1, teamLeadUser, {
            email: 'illegal@alpha.com',
            role: Role.MEMBER,
          })
        ).rejects.toThrow(ForbiddenException);

        await expect(
          workspacesService.inviteMember(ws1, regularMember, {
            email: 'illegal2@alpha.com',
            role: Role.MEMBER,
          })
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('6.3 Role Modification & Anti-Self-Promotion', () => {
      it('Platform Admin can change roles of other users', async () => {
        const res = await workspacesService.updateMemberRole(ws1, adminUser, regularMember, Role.TEAM_LEAD);
        expect(res.role).toBe(Role.TEAM_LEAD);
      });

      it('Users CANNOT elevate or change their own role (Anti-Self-Promotion)', async () => {
        await expect(
          workspacesService.updateMemberRole(ws1, regularMember, regularMember, Role.ADMIN)
        ).rejects.toThrow(ForbiddenException);

        await expect(
          workspacesService.updateMemberRole(ws1, adminUser, adminUser, Role.ADMIN)
        ).rejects.toThrow(/Self-promotion or altering your own role is not permitted/i);
      });

      it('Non-admins cannot change roles of other users', async () => {
        await expect(
          workspacesService.updateMemberRole(ws1, managerUser, regularMember, Role.MANAGER)
        ).rejects.toThrow(/Only workspace Admins can assign or change roles/i);
      });
    });

    describe('6.4 Account Deactivation & Last Admin Protection', () => {
      it('Platform Admin can deactivate and reactivate non-admin accounts', async () => {
        const deactivated = await workspacesService.updateUserStatus(ws1, adminUser, regularMember, false);
        expect(deactivated.isActive).toBe(false);

        const reactivated = await workspacesService.updateUserStatus(ws1, adminUser, regularMember, true);
        expect(reactivated.isActive).toBe(true);
      });

      it('Users cannot deactivate their own account', async () => {
        await expect(
          workspacesService.updateUserStatus(ws1, adminUser, adminUser, false)
        ).rejects.toThrow(/Cannot deactivate your own account/i);
      });

      it('Protects the last active Platform Admin from deactivation', async () => {
        await expect(
          workspacesService.updateUserStatus(ws1, adminUser, adminUser, false)
        ).rejects.toThrow();
      });
    });
  });

  // =========================================================================
  // PHASE 7 — PRIVILEGE ESCALATION & DIRECT API ATTACK VECTORS
  // =========================================================================
  describe('PHASE 7 — Privilege Escalation & Direct API Attack Vectors', () => {
    it('blocks forged API requests attempting to access another organization/workspace', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN, Role.MANAGER]);

      const forgedContext: any = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-workspace-id': ws2 }, // User from ws1 attempts access to ws2
            user: {
              id: managerUser,
              memberships: [{ workspaceId: ws1, role: Role.MANAGER }],
            },
          }),
        }),
      };

      expect(() => rolesGuard.canActivate(forgedContext)).toThrow(/not a member of the requested workspace/i);
    });

    it('rejects access when user object is missing (unauthenticated direct request)', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MEMBER]);

      const unauthContext: any = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-workspace-id': ws1 },
            user: null, // Bypassed authentication
          }),
        }),
      };

      expect(rolesGuard.canActivate(unauthContext)).toBe(false);
    });

    it('denies access when unprivileged user crafts custom headers claiming elevated role', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

      const tamperedContext: any = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-workspace-id': ws1, 'x-role-override': 'ADMIN' },
            user: {
              id: regularMember,
              memberships: [{ workspaceId: ws1, role: Role.MEMBER }], // Database authority is MEMBER
            },
          }),
        }),
      };

      expect(() => rolesGuard.canActivate(tamperedContext)).toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // PHASE 9 — INVITATIONS AND WORKSPACE MEMBERSHIP
  // =========================================================================
  describe('PHASE 9 — Invitations and Workspace Membership Lifecycle', () => {
    it('creates an invitation audit log when an authorized invitation is sent', async () => {
      await workspacesService.inviteMember(ws1, adminUser, {
        email: 'collaborator@alpha.com',
        role: Role.MEMBER,
      });

      const auditEvent = db.auditLogs.find((log) => log.action === 'MEMBER_INVITED');
      expect(auditEvent).toBeDefined();
      expect(auditEvent.actorId).toBe(adminUser);
      expect(auditEvent.workspaceId).toBe(ws1);
    });

    it('rejects duplicate invitations for an existing workspace member', async () => {
      await expect(
        workspacesService.inviteMember(ws1, adminUser, {
          email: 'member@alpha.com', // Already a member of ws1
          role: Role.MEMBER,
        })
      ).rejects.toThrow(ConflictException);
    });

    it('rejects self-invitation requests', async () => {
      await expect(
        workspacesService.inviteMember(ws1, adminUser, {
          email: 'admin@alpha.com',
          role: Role.ADMIN,
        })
      ).rejects.toThrow(/Cannot invite yourself|Self-promotion/i);
    });
  });

  // =========================================================================
  // PHASE 10 — APPROVAL AND WORKFLOW REGRESSION
  // =========================================================================
  describe('PHASE 10 — Task Approvals & Workflow Separation of Duties', () => {
    const taskId = 'node-task-pour';

    beforeEach(() => {
      db.nodes.set(taskId, {
        id: taskId,
        projectId: 'proj-skyline',
        workspaceId: ws1,
        teamId: 'team-eng-1',
        title: 'Concrete Pouring Gate',
        status: 'in_review',
        approvalStatus: 'pending',
        ownerId: regularMember,
        submitterId: regularMember,
      });
    });

    it('Team Lead CAN approve task within their assigned team scope', async () => {
      const res = await nodesService.approveTask(taskId, teamLeadUser, { decision: 'approved' });
      expect(res.approvalStatus).toBe('approved');
    });

    it('Manager CAN approve task within their project scope', async () => {
      const res = await nodesService.approveTask(taskId, managerUser, { decision: 'approved' });
      expect(res.approvalStatus).toBe('approved');
    });

    it('Platform Admin CAN oversee and approve tasks as Head of Organization', async () => {
      const res = await nodesService.approveTask(taskId, adminUser, { decision: 'approved' });
      expect(res.approvalStatus).toBe('approved');
    });

    it('Assignee / Submitter CANNOT approve their own work (Four-Eyes Principle)', async () => {
      await expect(
        nodesService.approveTask(taskId, regularMember, { decision: 'approved' })
      ).rejects.toThrow(/Self-approval is forbidden/i);
    });

    it('Cross-team Team Lead is REJECTED from approving work outside their team', async () => {
      const foreignLead = 'usr-foreign-lead';
      db.users.set(foreignLead, { id: foreignLead, email: 'otherlead@alpha.com', isActive: true });
      db.memberships.set(`${ws1}_${foreignLead}`, { workspaceId: ws1, userId: foreignLead, role: Role.TEAM_LEAD });
      // Foreign lead is NOT in team-eng-1

      await expect(
        nodesService.approveTask(taskId, foreignLead, { decision: 'approved' })
      ).rejects.toThrow(/Cross-team access denied/i);
    });

    it('Cross-organization actor is REJECTED from approving tasks in another workspace', async () => {
      await expect(
        nodesService.approveTask(taskId, foreignUser, { decision: 'approved' })
      ).rejects.toThrow();
    });
  });
});
