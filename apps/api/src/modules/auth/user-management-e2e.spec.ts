import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { NodesService } from '../nodes/nodes.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { TeamsService } from '../teams/teams.service';
import { ProjectsService } from '../projects/projects.service';
import { ForbiddenException, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { canApproveTask } from '@flowtrack/shared';

describe('Chunk 9: End-to-End User Management & Approval Lifecycle Scenario', () => {
  let workspacesService: WorkspacesService;
  let nodesService: NodesService;
  let authService: AuthService;
  let jwtStrategy: JwtStrategy;
  let teamsService: TeamsService;
  let projectsService: ProjectsService;
  let prismaMock: any;
  let jwtServiceMock: any;
  let auditServiceMock: any;
  let notificationsServiceMock: any;

  // Global in-memory test store to simulate persistent database state across steps
  const db: {
    users: Map<string, any>;
    memberships: Map<string, any>;
    projects: Map<string, any>;
    projectMembers: Map<string, any>;
    teams: Map<string, any>;
    teamMembers: Map<string, any>;
    nodes: Map<string, any>;
    approvals: any[];
    auditLogs: any[];
  } = {
    users: new Map(),
    memberships: new Map(),
    projects: new Map(),
    projectMembers: new Map(),
    teams: new Map(),
    teamMembers: new Map(),
    nodes: new Map(),
    approvals: [],
    auditLogs: [],
  };

  const workspaceId = 'ws-acme-corp';
  const adminId = 'user-platform-admin';
  const m1Id = 'user-manager-m1';
  const tl1Id = 'user-teamlead-tl1';
  const tl2Id = 'user-teamlead-tl2'; // From Team B
  const u1Id = 'user-assignee-u1';
  const projectAId = 'proj-alpha';
  const teamAId = 'team-core-eng';
  const teamBId = 'team-marketing';

  beforeEach(() => {
    // Reset DB store
    db.users.clear();
    db.memberships.clear();
    db.projects.clear();
    db.projectMembers.clear();
    db.teams.clear();
    db.teamMembers.clear();
    db.nodes.clear();
    db.approvals = [];
    db.auditLogs = [];

    // Seed Admin and initial Workspace
    db.users.set(adminId, {
      id: adminId,
      email: 'admin@flowtrack.io',
      fullName: 'Super Administrator',
      isActive: true,
      deletedAt: null,
      passwordHash: bcrypt.hashSync('Password123!', 6),
    });

    db.memberships.set(`${workspaceId}_${adminId}`, {
      workspaceId,
      userId: adminId,
      role: Role.ADMIN,
      user: db.users.get(adminId),
    });

    db.projects.set(projectAId, {
      id: projectAId,
      workspaceId,
      name: 'Project Alpha Platform',
      deletedAt: null,
    });

    db.teams.set(teamAId, {
      id: teamAId,
      workspaceId,
      name: 'Core Engineering',
      deletedAt: null,
    });

    db.teams.set(teamBId, {
      id: teamBId,
      workspaceId,
      name: 'Marketing Ops',
      deletedAt: null,
    });

    // Mock Prisma Service backed by the in-memory state
    prismaMock = {
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id) return db.users.get(where.id) || null;
          if (where.email) {
            for (const u of db.users.values()) {
              if (u.email === where.email) return u;
            }
          }
          return null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const user = { id: data.id || `user-${Date.now()}-${Math.random()}`, isActive: true, deletedAt: null, ...data };
          db.users.set(user.id, user);
          return user;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const existing = db.users.get(where.id);
          if (!existing) throw new NotFoundException('User not found');
          const updated = { ...existing, ...data };
          db.users.set(where.id, updated);
          return updated;
        }),
      },
      membership: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.workspaceId_userId) {
            const key = `${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`;
            return db.memberships.get(key) || null;
          }
          return null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          const results: any[] = [];
          for (const m of db.memberships.values()) {
            if (where.workspaceId && m.workspaceId !== where.workspaceId) continue;
            if (where.userId && m.userId !== where.userId) continue;
            results.push(m);
          }
          return results;
        }),
        create: vi.fn(async ({ data }: any) => {
          const key = `${data.workspaceId}_${data.userId}`;
          const membership = { ...data, user: db.users.get(data.userId) };
          db.memberships.set(key, membership);
          return membership;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const key = `${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`;
          const existing = db.memberships.get(key);
          const updated = { ...existing, ...data };
          db.memberships.set(key, updated);
          return updated;
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const key = `${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`;
          const existing = db.memberships.get(key);
          if (existing) {
            const updated = { ...existing, ...update, user: db.users.get(existing.userId) };
            db.memberships.set(key, updated);
            return updated;
          }
          const created = { ...create, user: db.users.get(create.userId) };
          db.memberships.set(key, created);
          return created;
        }),
        count: vi.fn(async ({ where }: any) => {
          let c = 0;
          for (const m of db.memberships.values()) {
            if (where.role && m.role !== where.role) continue;
            if (where.workspaceId && m.workspaceId !== where.workspaceId) continue;
            c++;
          }
          return c;
        }),
      },
      project: {
        findUnique: vi.fn(async ({ where }: any) => db.projects.get(where.id) || null),
        findFirst: vi.fn(async ({ where }: any) => db.projects.get(where.id) || null),
      },
      projectMember: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = `${where.projectId_userId.projectId}_${where.projectId_userId.userId}`;
          return db.projectMembers.get(key) || null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          for (const pm of db.projectMembers.values()) {
            if (where.projectId && pm.projectId !== where.projectId) continue;
            if (where.userId && pm.userId !== where.userId) continue;
            return pm;
          }
          return null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          const list: any[] = [];
          for (const pm of db.projectMembers.values()) {
            if (where.projectId && pm.projectId !== where.projectId) continue;
            if (where.userId && pm.userId !== where.userId) continue;
            list.push(pm);
          }
          return list;
        }),
        create: vi.fn(async ({ data }: any) => {
          const key = `${data.projectId}_${data.userId}`;
          db.projectMembers.set(key, data);
          return data;
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const key = `${where.projectId_userId.projectId}_${where.projectId_userId.userId}`;
          const existing = db.projectMembers.get(key);
          if (existing) {
            const updated = { ...existing, ...update };
            db.projectMembers.set(key, updated);
            return updated;
          }
          db.projectMembers.set(key, create);
          return create;
        }),
        count: vi.fn(async ({ where }: any) => {
          let c = 0;
          for (const pm of db.projectMembers.values()) {
            if (where.projectId && pm.projectId !== where.projectId) continue;
            c++;
          }
          return c;
        }),
      },
      team: {
        findUnique: vi.fn(async ({ where }: any) => {
          const t = db.teams.get(where.id);
          if (!t) return null;
          return { ...t, members: [], _count: { nodes: 0, members: 0 } };
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          const t = db.teams.get(where.id);
          if (!t) return null;
          return { ...t, members: [], _count: { nodes: 0, members: 0 } };
        }),
      },
      teamMember: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = `${where.teamId_userId.teamId}_${where.teamId_userId.userId}`;
          return db.teamMembers.get(key) || null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          for (const tm of db.teamMembers.values()) {
            if (where.teamId && tm.teamId !== where.teamId) continue;
            if (where.userId && tm.userId !== where.userId) continue;
            if (where.role && tm.role !== where.role) continue;
            return tm;
          }
          return null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          const list: any[] = [];
          for (const tm of db.teamMembers.values()) {
            if (where.teamId && tm.teamId !== where.teamId) continue;
            if (where.userId && tm.userId !== where.userId) continue;
            list.push(tm);
          }
          return list;
        }),
        create: vi.fn(async ({ data }: any) => {
          const key = `${data.teamId}_${data.userId}`;
          db.teamMembers.set(key, data);
          return data;
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const key = `${where.teamId_userId.teamId}_${where.teamId_userId.userId}`;
          const existing = db.teamMembers.get(key);
          if (existing) {
            const updated = { ...existing, ...update };
            db.teamMembers.set(key, updated);
            return updated;
          }
          db.teamMembers.set(key, create);
          return create;
        }),
      },
      node: {
        findUnique: vi.fn(async ({ where }: any) => {
          const node = db.nodes.get(where.id);
          if (!node) return null;
          return {
            ...node,
            workspace: { memberships: Array.from(db.memberships.values()).filter((m) => m.workspaceId === node.workspaceId) },
            project: { members: Array.from(db.projectMembers.values()).filter((pm) => pm.projectId === node.projectId) },
          };
        }),
        create: vi.fn(async ({ data }: any) => {
          const node = { id: data.id || `node-${Date.now()}-${Math.random()}`, approvalStatus: 'not_required', version: 1, ...data };
          db.nodes.set(node.id, node);
          return node;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const existing = db.nodes.get(where.id);
          if (!existing) throw new NotFoundException('Node not found');
          const updated = { ...existing, ...data };
          if (data.version && data.version.increment) {
            updated.version = (existing.version || 1) + data.version.increment;
          }
          db.nodes.set(where.id, updated);
          return updated;
        }),
      },
      taskApproval: {
        create: vi.fn(async ({ data }: any) => {
          const record = { id: `approval-${db.approvals.length + 1}`, ...data };
          db.approvals.push(record);
          return record;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return db.approvals.filter((a) => !where?.nodeId || a.nodeId === where.nodeId);
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          const log = { id: `log-${db.auditLogs.length + 1}`, createdAt: new Date(), ...data };
          db.auditLogs.push(log);
          return log;
        }),
      },
      remark: {
        create: vi.fn(async ({ data }: any) => ({ id: `rem-${Date.now()}`, ...data })),
      },
      fieldDefinition: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      nodeType: {
        findUnique: vi.fn().mockResolvedValue({ id: 'nt-1', isGroup: false }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      status: {
        findUnique: vi.fn().mockResolvedValue({ id: 'stat-1', name: 'In Progress' }),
      },
    };

    jwtServiceMock = {
      sign: vi.fn().mockReturnValue('mock.jwt.token'),
    };

    auditServiceMock = {
      log: vi.fn(async (entry: any) => {
        db.auditLogs.push(entry);
      }),
    };

    notificationsServiceMock = {
      sendNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    workspacesService = new WorkspacesService(prismaMock);
    projectsService = new ProjectsService(prismaMock);
    teamsService = new TeamsService(prismaMock);
    nodesService = new NodesService(prismaMock, auditServiceMock, notificationsServiceMock);
    authService = new AuthService(prismaMock, jwtServiceMock);
    jwtStrategy = new JwtStrategy(prismaMock);
  });

  it('executes the full 12-step scenario with strict security and transition guarantees', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Platform Admin creates Manager M1, Team Lead TL1, and Assignee U1
    // -------------------------------------------------------------------------
    db.users.set(m1Id, {
      id: m1Id,
      email: 'm1@flowtrack.io',
      fullName: 'Manager One',
      isActive: true,
      deletedAt: null,
      passwordHash: bcrypt.hashSync('Password123!', 6),
    });
    db.users.set(tl1Id, {
      id: tl1Id,
      email: 'tl1@flowtrack.io',
      fullName: 'Team Lead One',
      isActive: true,
      deletedAt: null,
      passwordHash: bcrypt.hashSync('Password123!', 6),
    });
    db.users.set(tl2Id, {
      id: tl2Id,
      email: 'tl2@flowtrack.io',
      fullName: 'Team Lead Two',
      isActive: true,
      deletedAt: null,
      passwordHash: bcrypt.hashSync('Password123!', 6),
    });
    db.users.set(u1Id, {
      id: u1Id,
      email: 'u1@flowtrack.io',
      fullName: 'Developer User One',
      isActive: true,
      deletedAt: null,
      passwordHash: bcrypt.hashSync('Password123!', 6),
    });

    // Add members to workspace
    await workspacesService.inviteMember(workspaceId, adminId, { email: 'm1@flowtrack.io', role: 'MANAGER' as any });
    await workspacesService.inviteMember(workspaceId, adminId, { email: 'tl1@flowtrack.io', role: 'TEAM_LEAD' as any });
    await workspacesService.inviteMember(workspaceId, adminId, { email: 'tl2@flowtrack.io', role: 'TEAM_LEAD' as any });
    await workspacesService.inviteMember(workspaceId, adminId, { email: 'u1@flowtrack.io', role: 'MEMBER' as any });

    expect(db.memberships.get(`${workspaceId}_${m1Id}`)?.role).toBe(Role.MANAGER);
    expect(db.memberships.get(`${workspaceId}_${tl1Id}`)?.role).toBe(Role.TEAM_LEAD);
    expect(db.memberships.get(`${workspaceId}_${tl2Id}`)?.role).toBe(Role.TEAM_LEAD);
    expect(db.memberships.get(`${workspaceId}_${u1Id}`)?.role).toBe(Role.MEMBER);

    // -------------------------------------------------------------------------
    // Step 2: Admin assigns M1 to Project A and TL1 to Team A (and TL2 to Team B)
    // -------------------------------------------------------------------------
    await projectsService.addOrUpdateProjectMember(projectAId, workspaceId, adminId, { userId: m1Id, role: Role.MANAGER });
    await projectsService.addOrUpdateProjectMember(projectAId, workspaceId, adminId, { userId: tl1Id, role: Role.TEAM_LEAD });
    await projectsService.addOrUpdateProjectMember(projectAId, workspaceId, adminId, { userId: u1Id, role: Role.MEMBER });
    await teamsService.addOrUpdateMember(teamAId, workspaceId, adminId, { userId: tl1Id, role: 'lead' });
    await teamsService.addOrUpdateMember(teamBId, workspaceId, adminId, { userId: tl2Id, role: 'lead' });
    await teamsService.addOrUpdateMember(teamAId, workspaceId, adminId, { userId: u1Id, role: 'member' });

    expect(db.projectMembers.get(`${projectAId}_${m1Id}`)?.role).toBe(Role.MANAGER);
    expect(db.teamMembers.get(`${teamAId}_${tl1Id}`)?.role).toBe('lead');
    expect(db.teamMembers.get(`${teamBId}_${tl2Id}`)?.role).toBe('lead');
    expect(db.teamMembers.get(`${teamAId}_${u1Id}`)?.role).toBe('member');

    // -------------------------------------------------------------------------
    // Step 3: M1 assigns a task to TL1; TL1 assigns a task to U1
    // -------------------------------------------------------------------------
    const task1Id = 'task-101-auth-module';
    db.nodes.set(task1Id, {
      id: task1Id,
      workspaceId,
      projectId: projectAId,
      title: 'Implement Auth Tokens',
      ownerId: null,
      teamId: null,
      approvalStatus: 'not_required',
      version: 1,
    });

    // M1 assigns task1 to TL1 within Project A scope
    await nodesService.updateNode(task1Id, { ownerId: tl1Id }, m1Id);
    expect(db.nodes.get(task1Id).ownerId).toBe(tl1Id);

    // TL1 assigns task2 to U1 within Team A scope
    const task2Id = 'task-102-api-routes';
    db.nodes.set(task2Id, {
      id: task2Id,
      workspaceId,
      projectId: projectAId,
      title: 'Build Protected API Routes',
      ownerId: null,
      teamId: teamAId,
      approvalStatus: 'not_required',
      version: 1,
    });

    await nodesService.updateNode(task2Id, { ownerId: u1Id }, tl1Id);
    expect(db.nodes.get(task2Id).ownerId).toBe(u1Id);

    // -------------------------------------------------------------------------
    // Step 4: U1 submits work for approval
    // -------------------------------------------------------------------------
    await nodesService.submitTask(task2Id, u1Id, 'Finished protected routes implementation and tests.');
    expect(db.nodes.get(task2Id).approvalStatus).toBe('pending');
    expect(db.nodes.get(task2Id).submitterId).toBe(u1Id);

    // -------------------------------------------------------------------------
    // Step 5: TL1 approves it; verify task state and immutable history
    // -------------------------------------------------------------------------
    const approvedNode = await nodesService.approveTask(task2Id, tl1Id, {
      decision: 'approved',
      feedback: 'Verified routes and authorization guards. LGTM.',
    });

    expect(approvedNode.approvalStatus).toBe('approved');
    expect(db.nodes.get(task2Id).approvalStatus).toBe('approved');

    // Verify immutable taskApproval record created
    const approvalsTask2 = db.approvals.filter((a) => a.nodeId === task2Id);
    expect(approvalsTask2.length).toBe(1);
    expect(approvalsTask2[0].decision).toBe('approved');
    expect(approvalsTask2[0].reviewerId).toBe(tl1Id);
    expect(approvalsTask2[0].submitterId).toBe(u1Id);

    // -------------------------------------------------------------------------
    // Step 6: Submit another task; TL1 requests changes; U1 edits and resubmits
    // -------------------------------------------------------------------------
    const task3Id = 'task-103-audit-logger';
    db.nodes.set(task3Id, {
      id: task3Id,
      workspaceId,
      projectId: projectAId,
      title: 'Audit Logging Pipeline',
      ownerId: u1Id,
      teamId: teamAId,
      approvalStatus: 'not_required',
      version: 1,
    });

    // U1 submits Task 3
    await nodesService.submitTask(task3Id, u1Id, 'Initial audit service draft');
    expect(db.nodes.get(task3Id).approvalStatus).toBe('pending');

    // TL1 requests changes
    const changesNode = await nodesService.approveTask(task3Id, tl1Id, {
      decision: 'changes_requested',
      feedback: 'Please mask sensitive user tokens before persisting logs.',
    });
    expect(changesNode.approvalStatus).toBe('changes_requested');
    expect(db.nodes.get(task3Id).approvalStatus).toBe('changes_requested');

    // U1 edits and resubmits
    await nodesService.updateNode(task3Id, { description: 'Masked user tokens in pipeline' }, u1Id);
    await nodesService.submitTask(task3Id, u1Id, 'Addressed review remarks. Tokens now masked.');
    expect(db.nodes.get(task3Id).approvalStatus).toBe('pending');

    // -------------------------------------------------------------------------
    // Step 7: Platform Admin as Head of Organization has overarching approval authority
    // -------------------------------------------------------------------------
    const adminCheck = canApproveTask({ userRole: Role.ADMIN, userId: adminId });
    expect(adminCheck.allowed).toBe(true);

    // -------------------------------------------------------------------------
    // Step 8: Try approval as assignee: denied (403 Forbidden)
    // -------------------------------------------------------------------------
    await expect(
      nodesService.approveTask(task3Id, u1Id, { decision: 'approved' })
    ).rejects.toThrow(ForbiddenException);

    // -------------------------------------------------------------------------
    // Step 9: Try approval by a Team Lead from another team (TL2): denied (403 Forbidden)
    // -------------------------------------------------------------------------
    await expect(
      nodesService.approveTask(task3Id, tl2Id, { decision: 'approved' })
    ).rejects.toThrow(ForbiddenException);

    // -------------------------------------------------------------------------
    // Step 10: Deactivate a user; login / authenticated actions fail but history remains
    // -------------------------------------------------------------------------
    // Platform Admin deactivates U1
    await workspacesService.updateUserStatus(workspaceId, adminId, u1Id, false);
    expect(db.users.get(u1Id).isActive).toBe(false);

    // U1 login must fail with 401 Unauthorized
    await expect(
      authService.login({ email: 'u1@flowtrack.io', password: 'Password123!' })
    ).rejects.toThrow(UnauthorizedException);

    // JWT validation for U1 must fail with 401 Unauthorized
    await expect(
      jwtStrategy.validate({ sub: u1Id, email: 'u1@flowtrack.io' })
    ).rejects.toThrow(UnauthorizedException);

    // But all existing tasks, approvals, and audit logs remain intact
    expect(db.nodes.get(task2Id).ownerId).toBe(u1Id);
    expect(db.nodes.get(task2Id).approvalStatus).toBe('approved');
    expect(db.approvals.some((a) => a.nodeId === task2Id)).toBe(true);

    // -------------------------------------------------------------------------
    // Step 11: Refresh / persistence check: query task, approvals, and audit trail
    // -------------------------------------------------------------------------
    const refreshedTask2 = await prismaMock.node.findUnique({ where: { id: task2Id } });
    expect(refreshedTask2.approvalStatus).toBe('approved');
    expect(refreshedTask2.version).toBeGreaterThan(1);

    const auditTrail = db.auditLogs;
    expect(auditTrail.length).toBeGreaterThan(0);
    expect(auditTrail.some((log) => log.action === 'USER_DEACTIVATION')).toBe(true);
    expect(auditTrail.some((log) => log.action === 'TASK_SUBMISSION')).toBe(true);
    expect(auditTrail.some((log) => log.action === 'APPROVAL_DECISION')).toBe(true);

    // -------------------------------------------------------------------------
    // Step 12: Guard invalid transitions and duplicate decisions (400 BadRequest)
    // -------------------------------------------------------------------------
    // Duplicate submission on task3 (already pending) must throw BadRequestException
    await expect(
      nodesService.submitTask(task3Id, adminId, 'Trying to resubmit while pending')
    ).rejects.toThrow(BadRequestException);

    // Duplicate approval on task2 (already approved, not pending) must throw BadRequestException
    await expect(
      nodesService.approveTask(task2Id, tl1Id, { decision: 'approved' })
    ).rejects.toThrow(BadRequestException);
  });
});
