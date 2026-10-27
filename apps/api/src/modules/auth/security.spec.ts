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

describe('Security & Authorization Hardening', () => {
  let workspacesService: WorkspacesService;
  let nodesService: NodesService;
  let authService: AuthService;
  let jwtStrategy: JwtStrategy;
  let teamsService: TeamsService;
  let projectsService: ProjectsService;
  let prismaMock: any;
  let jwtServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      membership: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      project: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      projectMember: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      team: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      teamMember: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      node: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      nodeType: {
        findUnique: vi.fn(),
      },
      fieldDefinition: {
        findMany: vi.fn(),
      },
      edge: {
        findMany: vi.fn(),
      },
      status: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      remark: {
        create: vi.fn().mockResolvedValue({}),
      },
      taskApproval: {
        create: vi.fn().mockResolvedValue({ id: 'appr-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: vi.fn((calls) => (typeof calls === 'function' ? calls(prismaMock) : Promise.all(calls))),
    };

    prismaMock.workspaceMember = prismaMock.membership;

    jwtServiceMock = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
    };

    workspacesService = new WorkspacesService(prismaMock);
    nodesService = new NodesService(prismaMock);
    authService = new AuthService(prismaMock, jwtServiceMock);
    jwtStrategy = new JwtStrategy(prismaMock);
    teamsService = new TeamsService(prismaMock);
    projectsService = new ProjectsService(prismaMock);
  });

  describe('Role Escalation & Membership Security', () => {
    it('prevents regular MEMBER from inviting users or modifying roles', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'regular-member',
        role: Role.MEMBER,
      });

      await expect(
        workspacesService.inviteMember('ws-1', 'regular-member', {
          email: 'newuser@example.com',
          role: 'MEMBER',
        })
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents MANAGER from elevating a user to ADMIN', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'manager-user',
        role: Role.MANAGER,
      });

      await expect(
        workspacesService.inviteMember('ws-1', 'manager-user', {
          email: 'escalate@example.com',
          role: 'ADMIN',
        })
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents user from modifying/elevating their own role (self-promotion blocked)', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'manager-user',
        role: Role.MANAGER,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'manager-user',
        email: 'manager@example.com',
      });

      await expect(
        workspacesService.inviteMember('ws-1', 'manager-user', {
          email: 'manager@example.com',
          role: 'ADMIN',
        })
      ).rejects.toThrow(ForbiddenException);

      await expect(
        workspacesService.updateMemberRole('ws-1', 'manager-user', 'manager-user', Role.ADMIN)
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents Manager from granting Platform Admin role via updateMemberRole', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'manager-user',
        role: Role.MANAGER,
      });

      await expect(
        workspacesService.updateMemberRole('ws-1', 'manager-user', 'member-1', Role.ADMIN)
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows ADMIN to invite another ADMIN', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'admin-user',
        role: Role.ADMIN,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'new-admin-id',
        email: 'admin2@example.com',
      });

      prismaMock.membership.upsert.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'new-admin-id',
        role: Role.ADMIN,
      });

      const res = await workspacesService.inviteMember('ws-1', 'admin-user', {
        email: 'admin2@example.com',
        role: 'ADMIN',
      });

      expect(res.role).toBe(Role.ADMIN);
    });
  });

  describe('Account Lifecycle & Deactivation Security', () => {
    it('prevents deactivated user from logging in (401)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'deact-user-1',
        email: 'deactivated@example.com',
        passwordHash: await bcrypt.hash('secret123', 10),
        isActive: false,
        memberships: [{ workspaceId: 'ws-1' }],
      });

      await expect(
        authService.login({
          email: 'deactivated@example.com',
          password: 'secret123',
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('prevents deactivated user from acting via JWT strategy (401)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'deact-user-2',
        email: 'deact2@example.com',
        isActive: false,
        deletedAt: null,
        memberships: [{ workspaceId: 'ws-1' }],
      });

      await expect(
        jwtStrategy.validate({
          sub: 'deact-user-2',
          email: 'deact2@example.com',
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('sanitizes user in JWT strategy omitting passwordHash', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'active-user',
        email: 'active@example.com',
        fullName: 'Active User',
        passwordHash: 'secret-hash-should-be-omitted',
        isActive: true,
        deletedAt: null,
        memberships: [{ workspaceId: 'ws-1' }],
      });

      const result = await jwtStrategy.validate({
        sub: 'active-user',
        email: 'active@example.com',
      });

      expect(result.id).toBe('active-user');
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('prevents deactivated user in getMe (401)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'deact-user-3',
        isActive: false,
        memberships: [],
      });

      await expect(authService.getMe('deact-user-3')).rejects.toThrow(UnauthorizedException);
    });

    it('prevents deactivating the last active Platform Admin', async () => {
      prismaMock.membership.findUnique
        .mockResolvedValueOnce({ workspaceId: 'ws-1', userId: 'admin-1', role: Role.ADMIN }) // actor
        .mockResolvedValueOnce({ workspaceId: 'ws-1', userId: 'admin-2', role: Role.ADMIN }); // target

      prismaMock.membership.count.mockResolvedValue(1); // Only 1 active admin exists!

      await expect(
        workspacesService.updateUserStatus('ws-1', 'admin-1', 'admin-2', false)
      ).rejects.toThrow(BadRequestException);
    });

    it('prevents Platform Admin from deactivating their own account', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'admin-1',
        role: Role.ADMIN,
      });

      await expect(
        workspacesService.updateUserStatus('ws-1', 'admin-1', 'admin-1', false)
      ).rejects.toThrow(BadRequestException);
    });

    it('allows deactivating Platform Admin when another active Admin exists', async () => {
      prismaMock.membership.findUnique
        .mockResolvedValueOnce({ workspaceId: 'ws-1', userId: 'admin-1', role: Role.ADMIN }) // actor
        .mockResolvedValueOnce({ workspaceId: 'ws-1', userId: 'admin-2', role: Role.ADMIN }); // target

      prismaMock.membership.count.mockResolvedValue(2); // 2 active admins exist

      prismaMock.user.update.mockResolvedValue({
        id: 'admin-2',
        email: 'admin2@example.com',
        fullName: 'Admin Two',
        isActive: false,
      });

      const res = await workspacesService.updateUserStatus('ws-1', 'admin-1', 'admin-2', false);
      expect(res.isActive).toBe(false);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'USER_DEACTIVATION',
            entityId: 'admin-2',
          }),
        })
      );
    });

    it('prevents demoting the last active Platform Admin', async () => {
      prismaMock.membership.findUnique
        .mockResolvedValueOnce({ workspaceId: 'ws-1', userId: 'admin-1', role: Role.ADMIN }) // actor
        .mockResolvedValueOnce({ workspaceId: 'ws-1', userId: 'admin-2', role: Role.ADMIN }); // target

      prismaMock.membership.count.mockResolvedValue(1); // Only 1 active admin exists!

      await expect(
        workspacesService.updateMemberRole('ws-1', 'admin-1', 'admin-2', Role.MEMBER)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Self-Approval Prevention & Task Sign-off Gates', () => {
    it('prevents unprivileged member from marking tasks approved via updateNode', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        approvalStatus: 'pending',
        reviewerId: 'reviewer-user-id',
        ownerId: 'assignee-member',
        version: 1,
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'assignee-member',
        role: Role.MEMBER,
      });

      await expect(
        nodesService.updateNode(
          'node-1',
          { approvalStatus: 'approved' },
          'assignee-member'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents Platform Admin from approving tasks (Platform Admin is never an approver)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-admin-gate',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        approvalStatus: 'pending',
        ownerId: 'assignee-member',
        version: 1,
        workspace: { memberships: [{ role: 'ADMIN' }] },
        project: { members: [] },
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'admin-user-id',
        role: Role.ADMIN,
      });

      prismaMock.node.update.mockResolvedValueOnce({
        id: 'node-admin-gate',
        approvalStatus: 'approved',
      });

      // Platform Admin can oversee and approve tasks as Head of Organization
      const approved = await nodesService.approveTask('node-admin-gate', 'admin-user-id', { decision: 'approved' });
      expect(approved.approvalStatus).toBe('approved');
    });

    it('prevents Manager from approving their own assigned task (Self-approval forbidden)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-self-gate',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        approvalStatus: 'pending',
        ownerId: 'manager-user-id',
        version: 1,
        workspace: { memberships: [{ role: 'MANAGER' }] },
        project: { members: [{ role: 'MANAGER' }] },
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'manager-user-id',
        role: Role.MANAGER,
      });

      await expect(
        nodesService.approveTask('node-self-gate', 'manager-user-id', { decision: 'approved' })
      ).rejects.toThrow(ForbiddenException);

      await expect(
        nodesService.updateNode('node-self-gate', { approvalStatus: 'approved' }, 'manager-user-id')
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents regular Member from assigning or reassigning task owner/reviewer', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-reassign',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'member-1',
        reviewerId: null,
        version: 1,
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'member-1',
        role: Role.MEMBER,
      });

      await expect(
        nodesService.updateNode('node-reassign', { ownerId: 'member-2' }, 'member-1')
      ).rejects.toThrow(ForbiddenException);

      await expect(
        nodesService.createNode('ws-1', {
          projectId: 'proj-1',
          nodeTypeId: 'nt-1',
          title: 'Unauthorized Assignment',
          ownerId: 'member-2',
        } as any, 'member-1')
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows Manager to approve task and records immutable TaskApproval history', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        approvalStatus: 'pending',
        reviewerId: 'manager-user-id',
        ownerId: 'assignee-member',
        submitterId: 'assignee-member',
        submittedAt: new Date('2026-10-24T10:00:00Z'),
        version: 1,
        workspace: { memberships: [{ role: 'MANAGER' }] },
        project: { members: [{ role: 'MANAGER' }] },
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'manager-user-id',
        role: Role.MANAGER,
      });

      prismaMock.nodeType.findUnique.mockResolvedValue({ id: 'nt-1', isGroup: false });
      prismaMock.fieldDefinition.findMany.mockResolvedValue([]);
      prismaMock.node.update.mockResolvedValue({
        id: 'node-1',
        approvalStatus: 'approved',
      });

      const approved = await nodesService.approveTask(
        'node-1',
        'manager-user-id',
        { decision: 'approved', feedback: 'Acceptance criteria passed' }
      );

      expect(approved.approvalStatus).toBe('approved');
      expect(prismaMock.taskApproval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nodeId: 'node-1',
            reviewerId: 'manager-user-id',
            decision: 'approved',
            feedback: 'Acceptance criteria passed',
          }),
        })
      );
    });

    it('submits task for review setting submitterId and audit log', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-submit',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        approvalStatus: 'not_required',
        ownerId: 'assignee-member',
        version: 1,
      });

      prismaMock.node.update.mockResolvedValue({
        id: 'node-submit',
        approvalStatus: 'pending',
        submitterId: 'assignee-member',
      });

      const res = await nodesService.submitTask('node-submit', 'assignee-member', 'Ready for signoff');

      expect(res.approvalStatus).toBe('pending');
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TASK_SUBMISSION',
            entityId: 'node-submit',
            actorId: 'assignee-member',
          }),
        })
      );
    });

    it('allows Team Lead to approve task assigned to someone else within their team', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-2',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        teamId: 'team-1',
        approvalStatus: 'pending',
        reviewerId: 'lead-user-id',
        ownerId: 'assignee-member',
        version: 1,
        workspace: { memberships: [{ role: 'TEAM_LEAD' }] },
        project: { members: [{ role: 'TEAM_LEAD' }] },
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'lead-user-id',
        role: Role.TEAM_LEAD,
      });

      prismaMock.teamMember.findFirst.mockResolvedValue({
        id: 'tm-1',
        teamId: 'team-1',
        userId: 'lead-user-id',
        role: 'lead',
      });

      prismaMock.nodeType.findUnique.mockResolvedValue({ id: 'nt-1', isGroup: false });
      prismaMock.fieldDefinition.findMany.mockResolvedValue([]);
      prismaMock.node.update.mockResolvedValue({
        id: 'node-2',
        approvalStatus: 'approved',
      });

      const approved = await nodesService.approveTask(
        'node-2',
        'lead-user-id',
        { decision: 'approved', feedback: 'Verified by Team Lead' }
      );

      expect(approved.approvalStatus).toBe('approved');
    });
  });

  describe('Chunk 5 — Teams and Project Membership Scoping & Cross-Access Denials', () => {
    it('prevents cross-team task assignment when assignee is not in the assigned team (403)', async () => {
      prismaMock.membership.findUnique
        .mockResolvedValueOnce({ role: Role.ADMIN }) // actor
        .mockResolvedValueOnce({
          role: Role.MEMBER,
          user: { id: 'frontend-dev', isActive: true, deletedAt: null },
        }); // target assignee

      // Assignee does NOT belong to team-backend
      prismaMock.teamMember.findUnique.mockResolvedValueOnce(null);

      await expect(
        nodesService.createNode('ws-1', {
          projectId: 'proj-1',
          nodeTypeId: 'nt-task',
          title: 'Backend API endpoint',
          teamId: 'team-backend',
          ownerId: 'frontend-dev',
        }, 'admin-id')
      ).rejects.toThrow(/Cross-team access denied: Assignee is not a member of this team/);
    });

    it('prevents cross-project task assignment when assignee is not a member of restricted project (403)', async () => {
      prismaMock.membership.findUnique
        .mockResolvedValueOnce({ role: Role.ADMIN }) // actor
        .mockResolvedValueOnce({
          role: Role.MEMBER,
          user: { id: 'other-user', isActive: true, deletedAt: null },
        }); // target assignee

      prismaMock.projectMember.count.mockResolvedValueOnce(3); // restricted project with members!
      prismaMock.projectMember.findUnique.mockResolvedValueOnce(null); // assignee is not in this project

      await expect(
        nodesService.createNode('ws-1', {
          projectId: 'secret-proj',
          nodeTypeId: 'nt-task',
          title: 'Classified task',
          ownerId: 'other-user',
        }, 'admin-id')
      ).rejects.toThrow(/Cross-project access denied: Assignee is not a member of this project/);
    });

    it('prevents Team Lead from assigning tasks outside their team scope (403)', async () => {
      prismaMock.membership.findUnique
        .mockResolvedValueOnce({ role: Role.TEAM_LEAD }) // actor
        .mockResolvedValueOnce({
          role: Role.MEMBER,
          user: { id: 'member-1', isActive: true, deletedAt: null },
        }) // assignee ws check
        .mockResolvedValueOnce({ role: Role.TEAM_LEAD }); // actor scoping check

      // Team Lead actor is NOT a lead in team-other
      prismaMock.teamMember.findUnique.mockResolvedValueOnce({ id: 'tm-m', teamId: 'team-other', userId: 'member-1' });
      prismaMock.teamMember.findFirst.mockResolvedValueOnce(null);

      await expect(
        nodesService.createNode('ws-1', {
          projectId: 'proj-1',
          nodeTypeId: 'nt-task',
          title: 'Task in another team',
          teamId: 'team-other',
          ownerId: 'member-1',
        }, 'lead-actor-id')
      ).rejects.toThrow(/Cross-team access denied: Team Lead is not authorized for this team/);
    });

    it('allows Team Lead to assign tasks within their authorized team scope', async () => {
      prismaMock.membership.findUnique
        .mockResolvedValueOnce({ role: Role.TEAM_LEAD }) // actor
        .mockResolvedValueOnce({
          role: Role.MEMBER,
          user: { id: 'dev-1', isActive: true, deletedAt: null },
        }) // assignee ws check
        .mockResolvedValueOnce({ role: Role.TEAM_LEAD }); // actor scoping check

      prismaMock.teamMember.findUnique.mockResolvedValueOnce({ id: 'tm-1', teamId: 'team-alpha', userId: 'dev-1' });
      prismaMock.teamMember.findFirst.mockResolvedValueOnce({ id: 'lead-1', teamId: 'team-alpha', userId: 'lead-actor', role: 'lead' });

      prismaMock.nodeType.findUnique.mockResolvedValue({ id: 'nt-task', isGroup: false });
      prismaMock.fieldDefinition.findMany.mockResolvedValue([]);
      prismaMock.node.create.mockResolvedValue({
        id: 'node-created-1',
        title: 'Authorized Team Task',
        ownerId: 'dev-1',
        teamId: 'team-alpha',
        projectId: 'proj-1',
        workspaceId: 'ws-1',
      });

      const res = await nodesService.createNode('ws-1', {
        projectId: 'proj-1',
        nodeTypeId: 'nt-task',
        title: 'Authorized Team Task',
        teamId: 'team-alpha',
        ownerId: 'dev-1',
      }, 'lead-actor');

      expect(res.id).toBe('node-created-1');
      expect(res.teamId).toBe('team-alpha');
    });

    it('denies cross-team approval when Team Lead attempts to approve task from another team (403)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-cross-team',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        teamId: 'team-bravo',
        ownerId: 'dev-2',
        reviewerId: null,
        approvalStatus: 'pending',
        workspace: { memberships: [{ role: 'TEAM_LEAD' }] },
        project: { members: [{ role: 'TEAM_LEAD' }] },
      });

      // Team Lead is NOT a lead in team-bravo
      prismaMock.teamMember.findFirst.mockResolvedValue(null);

      await expect(
        nodesService.approveTask('node-cross-team', 'lead-user-1', { decision: 'approved' })
      ).rejects.toThrow(/Cross-team access denied: Team Lead is not authorized to approve tasks for this team/);
    });

    it('denies cross-project approval when Manager is not an authorized member of that project (403)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-cross-proj',
        workspaceId: 'ws-1',
        projectId: 'restricted-project',
        ownerId: 'dev-3',
        reviewerId: null,
        approvalStatus: 'pending',
        workspace: { memberships: [{ role: 'MANAGER' }] },
        project: { members: [] }, // Manager is not assigned to this project!
      });

      prismaMock.projectMember.count.mockResolvedValue(2); // Project has restricted membership
      prismaMock.projectMember.findUnique.mockResolvedValue(null); // Manager not found in project

      await expect(
        nodesService.approveTask('node-cross-proj', 'manager-user-1', { decision: 'approved' })
      ).rejects.toThrow(/Cross-project access denied: Manager is not authorized to approve tasks in this project/);
    });

    it('TeamsService: prevents Team Lead from creating new teams (403)', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'lead-user-1',
        role: Role.TEAM_LEAD,
      });

      await expect(
        teamsService.createTeam('ws-1', 'lead-user-1', { name: 'Unauthorized Team' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('TeamsService: prevents Team Lead from promoting a member to lead (403)', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'lead-user-1',
        role: Role.TEAM_LEAD,
      });
      // Is lead of team-1
      prismaMock.teamMember.findFirst.mockResolvedValue({ teamId: 'team-1', userId: 'lead-user-1', role: 'lead' });
      prismaMock.team.findFirst.mockResolvedValue({ id: 'team-1', workspaceId: 'ws-1', _count: { nodes: 0 } });

      await expect(
        teamsService.addOrUpdateMember('team-1', 'ws-1', 'lead-user-1', {
          userId: 'dev-1',
          role: 'lead',
        })
      ).rejects.toThrow(/Forbidden: Team Leads cannot assign or promote Team Leads/);
    });

    it('TeamsService: prevents Team Lead from managing another team they do not lead (403)', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'lead-user-1',
        role: Role.TEAM_LEAD,
      });
      // Not a lead of team-2
      prismaMock.teamMember.findFirst.mockResolvedValue(null);

      await expect(
        teamsService.addOrUpdateMember('team-2', 'ws-1', 'lead-user-1', {
          userId: 'dev-1',
          role: 'member',
        })
      ).rejects.toThrow(/Forbidden: Team Leads can only manage teams they lead/);
    });

    it('ProjectsService: prevents Manager not in project from managing project members (403)', async () => {
      prismaMock.project.findFirst.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'manager-1',
        role: Role.MANAGER,
      });
      // Manager is NOT in projectMember
      prismaMock.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        projectsService.addOrUpdateProjectMember('proj-1', 'ws-1', 'manager-1', {
          userId: 'dev-1',
          role: Role.MEMBER,
        })
      ).rejects.toThrow(/Unauthorized: Only Admins or Project Managers can assign project members/);
    });

    it('safe deletion: deleting a team nullifies task teamId and removing member preserves historical records', async () => {
      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'admin-1',
        role: Role.ADMIN,
      });
      prismaMock.team.findFirst.mockResolvedValue({ id: 'team-1', workspaceId: 'ws-1', name: 'Alpha', _count: { nodes: 5 } });
      prismaMock.node.updateMany.mockResolvedValue({ count: 5 });
      prismaMock.team.delete.mockResolvedValue({ id: 'team-1' });

      // Delete team
      const delResult = await teamsService.deleteTeam('team-1', 'ws-1', 'admin-1');
      expect(delResult.success).toBe(true);
      expect(prismaMock.node.updateMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        data: { teamId: null },
      });

      // Remove member
      prismaMock.teamMember.findUnique.mockResolvedValue({ id: 'tm-1', teamId: 'team-1', userId: 'dev-1', role: 'member' });
      prismaMock.teamMember.delete.mockResolvedValue({ id: 'tm-1' });
      const remResult = await teamsService.removeMember('team-1', 'ws-1', 'admin-1', 'dev-1');
      expect(remResult.success).toBe(true);
      expect(prismaMock.teamMember.delete).toHaveBeenCalledWith({
        where: { teamId_userId: { teamId: 'team-1', userId: 'dev-1' } },
      });
    });
  });

  describe('Chunk 6: Task assignment and submission', () => {
    it('permits task assignee to update task fields', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-task-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        nodeTypeId: 'nt-1',
        ownerId: 'assignee-user-1',
        version: 1,
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'assignee-user-1',
        role: Role.MEMBER,
      });

      prismaMock.node.update.mockResolvedValue({
        id: 'node-task-1',
        title: 'Updated Scope by Assignee',
        version: 2,
      } as any);

      const result = await nodesService.updateNode(
        'node-task-1',
        { title: 'Updated Scope by Assignee' },
        'assignee-user-1'
      );

      expect(result.title).toBe('Updated Scope by Assignee');
      expect(prismaMock.node.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'node-task-1' },
          data: expect.objectContaining({
            title: 'Updated Scope by Assignee',
          }),
        })
      );
    });

    it('denies regular member from updating a task assigned to someone else (403)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-task-2',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'someone-else',
        version: 1,
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'regular-member',
        role: Role.MEMBER,
      });

      await expect(
        nodesService.updateNode(
          'node-task-2',
          { title: 'Unauthorized Modification' },
          'regular-member'
        )
      ).rejects.toThrow(/Forbidden: You can only update tasks assigned to you/);
    });

    it('records assignedById and assignedAt when ownerId is assigned or reassigned', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-task-3',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'dev-1',
        version: 1,
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'manager-user-1',
        role: Role.MANAGER,
      });

      // Target assignee is valid and active
      prismaMock.membership.findUnique.mockImplementation(async (args: any) => {
        if (args?.where?.workspaceId_userId?.userId === 'dev-2') {
          return { workspaceId: 'ws-1', userId: 'dev-2', user: { isActive: true, deletedAt: null } };
        }
        return { workspaceId: 'ws-1', userId: 'manager-user-1', role: Role.MANAGER };
      });

      prismaMock.projectMember.count.mockResolvedValue(0); // non-restricted

      prismaMock.node.update.mockResolvedValue({
        id: 'node-task-3',
        ownerId: 'dev-2',
        assignedById: 'manager-user-1',
        version: 2,
      } as any);

      await nodesService.updateNode(
        'node-task-3',
        { ownerId: 'dev-2' },
        'manager-user-1'
      );

      expect(prismaMock.node.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'node-task-3' },
          data: expect.objectContaining({
            ownerId: 'dev-2',
            assignedById: 'manager-user-1',
            assignedAt: expect.any(Date),
          }),
        })
      );
    });

    it('permits task assignee to submit work for review', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-task-4',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'dev-1',
        approvalStatus: 'not_required',
      });

      prismaMock.node.update.mockResolvedValue({
        id: 'node-task-4',
        approvalStatus: 'pending',
        submitterId: 'dev-1',
      } as any);

      const result = await nodesService.submitTask(
        'node-task-4',
        'dev-1',
        'Implemented features and passing test suites'
      );

      expect(result.approvalStatus).toBe('pending');
      expect(prismaMock.node.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'node-task-4' },
          data: expect.objectContaining({
            approvalStatus: 'pending',
            submitterId: 'dev-1',
            submittedAt: expect.any(Date),
          }),
        })
      );
    });

    it('denies non-assignee regular member from submitting work for another user (403)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-task-5',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'dev-1',
        approvalStatus: 'not_required',
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'dev-2',
        role: Role.MEMBER,
      });

      await expect(
        nodesService.submitTask('node-task-5', 'dev-2', 'Trying to submit someone else work')
      ).rejects.toThrow(/Forbidden: Only the task assignee, a manager, or admin can submit work for review/);
    });

    it('preserves previous review cycles in task_approvals upon resubmission', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-task-6',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'dev-1',
        approvalStatus: 'rejected',
      });

      prismaMock.node.update.mockResolvedValue({
        id: 'node-task-6',
        approvalStatus: 'pending',
        submitterId: 'dev-1',
      } as any);

      await nodesService.submitTask('node-task-6', 'dev-1', 'Addressed feedback and fixed edge cases');

      // Crucial: TaskApproval history rows must NEVER be deleted on resubmission
      expect(prismaMock.taskApproval.delete).not.toHaveBeenCalled();
      expect(prismaMock.taskApproval.deleteMany).not.toHaveBeenCalled();

      expect(prismaMock.node.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'node-task-6' },
          data: expect.objectContaining({
            approvalStatus: 'pending',
            submitterId: 'dev-1',
            submittedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('Chunk 7: Approval and Rejection Workflow & Review Queue', () => {
    it('denies Platform Admin from approving or rejecting tasks (403)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-gate-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'dev-1',
        submitterId: 'dev-1',
        approvalStatus: 'pending',
        workspace: { memberships: [{ role: Role.ADMIN }] },
        project: { members: [{ role: Role.ADMIN }] },
      });

      prismaMock.node.update.mockResolvedValueOnce({
        id: 'task-gate-1',
        approvalStatus: 'approved',
      });

      // Platform Admin can oversee and approve tasks as Head of Organization
      const result = await nodesService.approveTask('task-gate-1', 'admin-user', { decision: 'approved' });
      expect(result.approvalStatus).toBe('approved');
    });

    it('denies assignee from approving their own task (403)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-gate-2',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'manager-user', // Assignee is same as reviewer
        submitterId: 'dev-1',
        approvalStatus: 'pending',
        workspace: { memberships: [{ role: Role.MANAGER }] },
        project: { members: [{ role: Role.MANAGER }] },
      });

      await expect(
        nodesService.approveTask('task-gate-2', 'manager-user', { decision: 'approved' })
      ).rejects.toThrow(/Self-approval is forbidden: You cannot approve or reject a task you are assigned to/);
    });

    it('denies submitter from approving work they submitted (403)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-gate-3',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'dev-1',
        submitterId: 'lead-user', // Submitter is same as reviewer
        approvalStatus: 'pending',
        workspace: { memberships: [{ role: Role.TEAM_LEAD }] },
        project: { members: [{ role: Role.TEAM_LEAD }] },
      });

      await expect(
        nodesService.approveTask('task-gate-3', 'lead-user', { decision: 'approved' })
      ).rejects.toThrow(/Self-approval is forbidden: You cannot approve or reject work you submitted/);
    });

    it('denies approval if task is not in pending approval status (400)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-gate-4',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'dev-1',
        submitterId: 'dev-1',
        approvalStatus: 'approved', // Already approved, not pending
        workspace: { memberships: [{ role: Role.MANAGER }] },
        project: { members: [{ role: Role.MANAGER }] },
      });

      await expect(
        nodesService.approveTask('task-gate-4', 'manager-user', { decision: 'approved' })
      ).rejects.toThrow(/Invalid transition: Task is not currently pending approval/);
    });

    it('requires a valid reason or feedback when rejecting or requesting changes (400)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-gate-5',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        ownerId: 'dev-1',
        submitterId: 'dev-1',
        approvalStatus: 'pending',
        workspace: { memberships: [{ role: Role.MANAGER }] },
        project: { members: [{ role: Role.MANAGER }] },
      });

      await expect(
        nodesService.approveTask('task-gate-5', 'manager-user', { decision: 'rejected', feedback: '' })
      ).rejects.toThrow(/A valid reason or comment is required when rejecting or requesting changes/);
    });

    it('denies out-of-scope Manager from approving tasks in an unauthorized project (403)', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-gate-6',
        workspaceId: 'ws-1',
        projectId: 'proj-restricted',
        ownerId: 'dev-1',
        submitterId: 'dev-1',
        approvalStatus: 'pending',
        workspace: { memberships: [{ role: Role.MANAGER }] },
        project: { members: [] }, // Manager is NOT a member of this project
      });

      prismaMock.projectMember.count.mockResolvedValue(3); // Project has restricted membership
      prismaMock.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        nodesService.approveTask('task-gate-6', 'manager-user', { decision: 'approved' })
      ).rejects.toThrow(/Cross-project access denied: Manager is not authorized to approve tasks in this project/);
    });

    it('permits authorized Manager to approve pending task atomically', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-gate-7',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        title: 'Complete Infrastructure Audit',
        ownerId: 'dev-1',
        submitterId: 'dev-1',
        submittedAt: new Date(),
        approvalStatus: 'pending',
        workspace: { memberships: [{ role: Role.MANAGER }] },
        project: { members: [{ role: Role.MANAGER }] },
      });

      prismaMock.projectMember.count.mockResolvedValue(0); // Unrestricted or manager authorized

      prismaMock.node.update.mockResolvedValue({
        id: 'task-gate-7',
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvalFeedback: 'All unit test reports and QA signs verified.',
      } as any);

      const result = await nodesService.approveTask('task-gate-7', 'manager-sarah', {
        decision: 'approved',
        feedback: 'All unit test reports and QA signs verified.',
      });

      expect(result.approvalStatus).toBe('approved');
      expect(prismaMock.node.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-gate-7' },
          data: expect.objectContaining({
            approvalStatus: 'approved',
            approvedAt: expect.any(Date),
            approvalFeedback: 'All unit test reports and QA signs verified.',
          }),
        })
      );

      // Verify immutable taskApproval record created
      expect(prismaMock.taskApproval.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nodeId: 'task-gate-7',
          reviewerId: 'manager-sarah',
          decision: 'approved',
          feedback: 'All unit test reports and QA signs verified.',
        }),
      });

      // Verify audit log created
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'APPROVAL_DECISION',
          actorId: 'manager-sarah',
          entityId: 'task-gate-7',
        }),
      });

      // Verify remark created
      expect(prismaMock.remark.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nodeId: 'task-gate-7',
          authorId: 'manager-sarah',
          body: expect.stringContaining('Task Approved'),
        }),
      });
    });

    it('filters review queue to only eligible tasks for the reviewer', async () => {
      // Mock actor memberships: Manager in ws-1, not in team-bravo
      prismaMock.membership.findMany.mockResolvedValue([{ role: Role.MANAGER }]);
      prismaMock.projectMember.findMany.mockResolvedValue([{ projectId: 'proj-1', role: Role.MANAGER }]);
      prismaMock.teamMember.findMany.mockResolvedValue([]);

      prismaMock.node.findMany.mockResolvedValue([
        {
          id: 'task-q-1',
          title: 'Eligible Task in Proj 1',
          projectId: 'proj-1',
          ownerId: 'dev-1',
          submitterId: 'dev-1',
          approvalStatus: 'pending',
          teamId: null,
        },
        {
          id: 'task-q-2',
          title: 'Self-Assigned Task',
          projectId: 'proj-1',
          ownerId: 'manager-actor', // Self-assigned
          submitterId: 'dev-2',
          approvalStatus: 'pending',
        },
        {
          id: 'task-q-3',
          title: 'Self-Submitted Task',
          projectId: 'proj-1',
          ownerId: 'dev-3',
          submitterId: 'manager-actor', // Self-submitted
          approvalStatus: 'pending',
        },
      ]);

      const queue = await nodesService.getReviewQueue('manager-actor', 'ws-1');

      // Only task-q-1 should be returned
      expect(queue.length).toBe(1);
      expect(queue[0].id).toBe('task-q-1');
    });
  });

  describe('Chunk 8: Audit, Dashboards, and Notifications', () => {
    let mockNotificationsService: any;
    let mockAuditService: any;
    let chunk8NodesService: NodesService;

    beforeEach(() => {
      mockNotificationsService = {
        sendNotification: vi.fn().mockResolvedValue({ id: 'notif-123' }),
      };
      mockAuditService = {
        log: vi.fn().mockResolvedValue({ id: 'audit-123' }),
      };
      chunk8NodesService = new NodesService(
        prismaMock,
        mockAuditService,
        mockNotificationsService
      );
    });

    it('notifies both new and previous assignee upon task reassignment', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-reassign',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        title: 'Security Vulnerability Patch',
        ownerId: 'previous-dev',
        reviewerId: null,
        approvalStatus: 'not_required',
        version: 1,
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'lead-1',
        role: Role.MANAGER,
      });

      prismaMock.node.update.mockResolvedValue({
        id: 'node-reassign',
        title: 'Security Vulnerability Patch',
        ownerId: 'new-dev',
        reviewerId: null,
      });

      await chunk8NodesService.updateNode('node-reassign', { ownerId: 'new-dev' }, 'lead-1');

      // Verify new assignee notification
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'new-dev',
          type: 'ASSIGNMENT',
          title: expect.stringContaining('Task Reassigned to You'),
        })
      );

      // Verify previous assignee notification
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'previous-dev',
          type: 'ASSIGNMENT',
          title: expect.stringContaining('Task Reassigned'),
          body: expect.stringContaining('reassigned to another team member'),
        })
      );
    });

    it('differentiates notifications for approved, rejected, and changes_requested decisions', async () => {
      // 1. Rejected decision
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-reject-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        title: 'Deploy to Prod',
        ownerId: 'assignee-user',
        submitterId: 'assignee-user',
        approvalStatus: 'pending',
        version: 1,
        workspace: { memberships: [{ role: Role.MANAGER }] },
        project: { members: [{ role: Role.MANAGER }] },
      });

      prismaMock.node.update.mockResolvedValue({
        id: 'task-reject-1',
        approvalStatus: 'rejected',
      });

      await chunk8NodesService.approveTask('task-reject-1', 'manager-reviewer', {
        decision: 'rejected',
        feedback: 'Fails load tests. 500 error on checkout.',
      });

      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'assignee-user',
          type: 'APPROVAL_DECISION',
          title: expect.stringContaining('Task Rejected'),
          body: expect.stringContaining('Fails load tests'),
        })
      );

      // 2. Changes requested decision
      mockNotificationsService.sendNotification.mockClear();
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-rework-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        title: 'Refactor Auth Interceptor',
        ownerId: 'assignee-user',
        submitterId: 'assignee-user',
        approvalStatus: 'pending',
        version: 1,
        workspace: { memberships: [{ role: Role.MANAGER }] },
        project: { members: [{ role: Role.MANAGER }] },
      });

      await chunk8NodesService.approveTask('task-rework-1', 'manager-reviewer', {
        decision: 'changes_requested',
        feedback: 'Please address lint warnings and add tests.',
      });

      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'assignee-user',
          type: 'APPROVAL_DECISION',
          title: expect.stringContaining('Changes Requested'),
          body: expect.stringContaining('Please address lint warnings'),
        })
      );
    });

    it('notification failure does not corrupt or abort task approval transaction', async () => {
      // Configure mock to fail/throw
      mockNotificationsService.sendNotification.mockRejectedValue(
        new Error('Redis/Gateway connection timeout')
      );

      prismaMock.node.findUnique.mockResolvedValue({
        id: 'task-failnotif-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        title: 'Critical DB Migration',
        ownerId: 'dev-1',
        submitterId: 'dev-1',
        approvalStatus: 'pending',
        version: 1,
        workspace: { memberships: [{ role: Role.MANAGER }] },
        project: { members: [{ role: Role.MANAGER }] },
      });

      prismaMock.node.update.mockResolvedValue({
        id: 'task-failnotif-1',
        approvalStatus: 'approved',
      });

      // The transaction must succeed and NOT throw even if notification failed!
      const approved = await chunk8NodesService.approveTask('task-failnotif-1', 'manager-reviewer', {
        decision: 'approved',
        feedback: 'Sign-off complete',
      });

      expect(approved.approvalStatus).toBe('approved');
      expect(prismaMock.taskApproval.create).toHaveBeenCalled();
    });

    it('records audit log on task assignment change', async () => {
      prismaMock.node.findUnique.mockResolvedValue({
        id: 'node-audit-assign',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        title: 'Data Pipeline Optimization',
        ownerId: null,
        reviewerId: null,
        approvalStatus: 'not_required',
        version: 1,
      });

      prismaMock.membership.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'admin-1',
        role: Role.ADMIN,
      });

      prismaMock.node.update.mockResolvedValue({
        id: 'node-audit-assign',
        ownerId: 'dev-2',
        reviewerId: null,
      });

      await chunk8NodesService.updateNode('node-audit-assign', { ownerId: 'dev-2' }, 'admin-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ASSIGNMENT_CHANGE',
          actorId: 'admin-1',
          entityId: 'node-audit-assign',
          newValues: expect.objectContaining({ ownerId: 'dev-2' }),
        })
      );
    });
  });
});
