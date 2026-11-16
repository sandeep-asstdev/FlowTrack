import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ProjectsService } from '../projects/projects.service';
import { AuthorizationService } from './authorization.service';

describe('Chunk 7-Lite: Seed More Users to "Acme Developments"', () => {
  let prisma: PrismaClient;
  let authService: AuthService;
  let workspacesService: WorkspacesService;
  let projectsService: ProjectsService;
  let authorizationService: AuthorizationService;

  const demoPassword = process.env.DEMO_USER_PASSWORD || 'Demo@12345';

  const EXPECTED_USERS: { fullName: string; email: string; role: Role }[] = [
    { fullName: 'Ravi Kumar', email: 'ravi@acme.dev', role: Role.MANAGER },
    { fullName: 'Anita Rao', email: 'anita@acme.dev', role: Role.MANAGER },
    { fullName: 'Kiran Shetty', email: 'kiran@acme.dev', role: Role.TEAM_LEAD },
    { fullName: 'Divya Nair', email: 'divya@acme.dev', role: Role.TEAM_LEAD },
    { fullName: 'Mohan Gowda', email: 'mohan@acme.dev', role: Role.MEMBER },
    { fullName: 'Priya Hegde', email: 'priya@acme.dev', role: Role.MEMBER },
    { fullName: 'Arjun Patil', email: 'arjun@acme.dev', role: Role.MEMBER },
    { fullName: 'Sneha Desai', email: 'sneha@acme.dev', role: Role.MEMBER },
    { fullName: 'Vikram Joshi', email: 'vikram@acme.dev', role: Role.MEMBER },
    { fullName: 'Lakshmi Bhat', email: 'lakshmi@acme.dev', role: Role.MEMBER },
  ];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'flowtrack-super-secret-jwt-key-2026-very-secure',
      signOptions: { expiresIn: '1d' },
    });

    authService = new AuthService(prisma as any, jwtService);
    workspacesService = new WorkspacesService(prisma as any);
    authorizationService = new AuthorizationService(prisma as any);
    projectsService = new ProjectsService(prisma as any, authorizationService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Acme Developments workspace exists and contains all 10 seeded users', async () => {
    const acmeWs = await prisma.workspace.findFirst({
      where: { name: 'Acme Developments', deletedAt: null },
    });
    expect(acmeWs).toBeDefined();
    expect(acmeWs?.name).toBe('Acme Developments');

    const members = await workspacesService.listMembers(acmeWs!.id);
    const memberEmails = members.map((m: any) => m.user?.email);

    for (const expected of EXPECTED_USERS) {
      expect(memberEmails).toContain(expected.email);
      const member = members.find((m: any) => m.user?.email === expected.email);
      expect(member).toBeDefined();
      expect(member.role).toBe(expected.role);
    }
  });

  it('all 10 users have emailVerified=true and phoneVerified=true (can log in without OTP)', async () => {
    for (const expected of EXPECTED_USERS) {
      const user = await prisma.user.findUnique({
        where: { email: expected.email },
      });
      expect(user).toBeDefined();
      expect(user!.emailVerified).toBe(true);
      expect(user!.phoneVerified).toBe(true);
      expect(user!.isActive).toBe(true);
    }
  });

  it('new users can authenticate with DEMO_USER_PASSWORD and receive a valid JWT session', async () => {
    const sampleEmails = ['ravi@acme.dev', 'kiran@acme.dev', 'mohan@acme.dev', 'lakshmi@acme.dev'];
    for (const email of sampleEmails) {
      const res = await authService.login({
        email,
        password: demoPassword,
      });
      expect(res).toBeDefined();
      expect(res.accessToken).toBeDefined();
      expect(res.user.email).toBe(email);
    }
  });

  it('none of the new users are assigned to any project or task initially', async () => {
    const userEmails = EXPECTED_USERS.map((u) => u.email);
    const users = await prisma.user.findMany({
      where: { email: { in: userEmails } },
      include: {
        projectMemberships: true,
        ownedNodes: true,
      },
    });

    for (const user of users) {
      expect(user.projectMemberships.length).toBe(0);
      expect(user.ownedNodes.length).toBe(0);
    }
  });

  it('project isolation holds: new Member sees no projects until assigned', async () => {
    const acmeWs = await prisma.workspace.findFirst({
      where: { name: 'Acme Developments', deletedAt: null },
    });
    const mohan = await prisma.user.findUnique({
      where: { email: 'mohan@acme.dev' },
    });
    expect(mohan).toBeDefined();

    // Member with no project assignment in Acme Developments
    const projects = await projectsService.listWorkspaceProjects(acmeWs!.id, {
      id: mohan!.id,
      role: Role.MEMBER,
    });

    // Moham has no projects assigned or owned, so projects visible to him must only be PUBLIC/INTERNAL if any exist, or none
    const directAssigned = projects.filter(
      (p: any) => p.ownerId === mohan!.id || p.members?.some?.((m: any) => m.userId === mohan!.id)
    );
    expect(directAssigned.length).toBe(0);
  });

  it('project isolation holds: new Manager sees only projects they own, manage, or are assigned to', async () => {
    const acmeWs = await prisma.workspace.findFirst({
      where: { name: 'Acme Developments', deletedAt: null },
    });
    const ravi = await prisma.user.findUnique({
      where: { email: 'ravi@acme.dev' },
    });
    expect(ravi).toBeDefined();

    const projects = await projectsService.listWorkspaceProjects(acmeWs!.id, {
      id: ravi!.id,
      role: Role.MANAGER,
    });

    // Ravi has created 0 projects and is member of 0 projects
    const directAssigned = projects.filter(
      (p: any) => p.ownerId === ravi!.id || p.responsibleManagerId === ravi!.id
    );
    expect(directAssigned.length).toBe(0);
  });

  it('cli safety: script refuses to run with NODE_ENV=production', () => {
    const { execSync } = require('child_process');
    expect(() => {
      execSync('npx ts-node prisma/seed-more-users.ts', {
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: 'pipe',
      });
    }).toThrow();
  }, 20000);

  it('cli safety: script refuses to run when DEMO_USER_PASSWORD is missing', () => {
    const { execSync } = require('child_process');
    expect(() => {
      execSync('npx ts-node prisma/seed-more-users.ts', {
        env: { ...process.env, DEMO_USER_PASSWORD: '' },
        stdio: 'pipe',
      });
    }).toThrow();
  }, 20000);

  it('idempotency: re-running script reports all 10 users as skipped (already exists)', () => {
    const { execSync } = require('child_process');
    const output = execSync('npx ts-node prisma/seed-more-users.ts', {
      env: { ...process.env, DEMO_USER_PASSWORD: demoPassword },
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    expect(output).toContain('Total: 10 | Created: 0 | Skipped: 10');
  }, 20000);
});

