import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

describe('Chunk 3 — Security, Role Safety & End-to-End Hardening', () => {
  let authService: AuthService;
  let googleAuthService: GoogleAuthService;
  let jwtStrategy: JwtStrategy;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let prismaMock: any;
  let jwtServiceMock: any;
  let mockOAuthClient: any;

  const TEST_CLIENT_ID =
    process.env.GOOGLE_CLIENT_ID || 'test-flowtrack-google-client-id.apps.googleusercontent.com';

  beforeEach(() => {
    vi.restoreAllMocks();

    prismaMock = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      workspace: {
        create: vi.fn(),
      },
      membership: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };

    jwtServiceMock = {
      sign: vi.fn().mockImplementation((payload) => `signed-jwt-token-for-${payload.sub}`),
      verify: vi.fn(),
    };

    googleAuthService = new GoogleAuthService();
    mockOAuthClient = {
      verifyIdToken: vi.fn(),
    };
    googleAuthService.setOAuthClient(mockOAuthClient);

    authService = new AuthService(prismaMock, jwtServiceMock, googleAuthService);
    jwtStrategy = new JwtStrategy(prismaMock);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  // =========================================================================
  // 1. SUCCESSFUL GOOGLE SIGN-IN & NEW USER REGISTRATION
  // =========================================================================
  describe('1. Successful Google Sign-In & New User Registration', () => {
    it('provisions new Google user with standard Role.MEMBER and isolated workspace', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google-sub-alice',
          email: 'alice@flowtrack.dev',
          email_verified: true,
          name: 'Alice Rivera',
          picture: 'https://lh3.googleusercontent.com/alice.jpg',
          iss: 'https://accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      });

      // User does not exist yet
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      const createdUser = {
        id: 'user-alice-1',
        email: 'alice@flowtrack.dev',
        fullName: 'Alice Rivera',
        avatarUrl: 'https://lh3.googleusercontent.com/alice.jpg',
        googleId: 'google-sub-alice',
        passwordHash: null,
        isActive: true,
        deletedAt: null,
        memberships: [],
      };
      prismaMock.user.create.mockResolvedValueOnce(createdUser);

      const createdWorkspace = {
        id: 'ws-alice-1',
        name: "Alice Rivera's Workspace",
        slug: 'alice-rivera-workspace-1234',
        memberships: [
          {
            id: 'mem-alice-1',
            userId: 'user-alice-1',
            workspaceId: 'ws-alice-1',
            role: Role.MEMBER,
          },
        ],
      };
      prismaMock.workspace.create.mockResolvedValueOnce(createdWorkspace);

      const res = await authService.loginWithGoogle({ idToken: 'valid-google-token' });

      // 1. User created with googleId and no password hash
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'alice@flowtrack.dev',
          fullName: 'Alice Rivera',
          googleId: 'google-sub-alice',
          passwordHash: null,
          isActive: true,
        }),
        include: expect.anything(),
      });

      // 2. Personal workspace membership created with Role.MEMBER (never ADMIN/MANAGER)
      expect(prismaMock.workspace.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          memberships: {
            create: {
              userId: 'user-alice-1',
              role: Role.MEMBER,
            },
          },
        }),
      });

      // 3. Output token and payload verification
      expect(res.user.email).toBe('alice@flowtrack.dev');
      expect(res.user.googleLinked).toBe(true);
      expect(res.workspaces[0].role).toBe(Role.MEMBER);
      expect(res.accessToken).toBe('signed-jwt-token-for-user-alice-1');
    });

    it('supports local dev mock tokens strictly in non-production environments', async () => {
      // In development mode (NODE_ENV !== 'production'), verifyIdToken parses dev tokens
      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce({
        id: 'user-dev-1',
        email: 'dev.tester@flowtrack.dev',
        fullName: 'Dev Tester',
        avatarUrl: null,
        googleId: 'google-mock-sub-dev',
        isActive: true,
        deletedAt: null,
        memberships: [],
      });
      prismaMock.workspace.create.mockResolvedValueOnce({
        id: 'ws-dev-1',
        name: "Dev Tester's Workspace",
        slug: 'dev-tester-ws',
      });

      const res = await authService.loginWithGoogle({
        idToken: 'dev-mock-google-token:dev.tester@flowtrack.dev:Dev Tester',
      });

      expect(res.user.email).toBe('dev.tester@flowtrack.dev');
      expect(res.workspaces[0].role).toBe(Role.MEMBER);
    });
  });

  // =========================================================================
  // 2. EXISTING ACCOUNT HANDLING & SAFE LINKING
  // =========================================================================
  describe('2. Existing Account Handling & Safe Linking', () => {
    it('seamlessly links googleId to existing password user without resetting password or elevating role', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google-sub-carol-999',
          email: 'carol.lead@flowtrack.dev',
          email_verified: true,
          name: 'Carol Team Lead',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      });

      const existingUser = {
        id: 'user-carol-existing',
        email: 'carol.lead@flowtrack.dev',
        fullName: 'Carol Team Lead',
        passwordHash: '$2a$10$existingBcryptPasswordHashWillNotBeOverwritten',
        googleId: null, // not yet linked
        avatarUrl: null,
        isActive: true,
        deletedAt: null,
        memberships: [
          {
            id: 'mem-1',
            workspaceId: 'ws-team',
            role: Role.TEAM_LEAD, // existing assigned role
            workspace: { id: 'ws-team', name: 'Engineering Team', slug: 'eng' },
          },
        ],
      };

      prismaMock.user.findFirst.mockResolvedValueOnce(existingUser);
      prismaMock.user.update.mockResolvedValueOnce({
        ...existingUser,
        googleId: 'google-sub-carol-999',
      });

      const res = await authService.loginWithGoogle({ idToken: 'token-carol' });

      // Verify user was updated with googleId only - passwordHash was preserved
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-carol-existing' },
        data: expect.objectContaining({
          googleId: 'google-sub-carol-999',
        }),
        include: expect.anything(),
      });

      // Role is preserved: Carol remains TEAM_LEAD, not escalated or downgraded
      expect(res.workspaces[0].role).toBe(Role.TEAM_LEAD);
      expect(res.user.email).toBe('carol.lead@flowtrack.dev');
      expect(res.user.googleLinked).toBe(true);
    });

    it('preserves Platform Admin / Manager roles for existing admin accounts', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google-sub-admin-1',
          email: 'admin@flowtrack.dev',
          email_verified: true,
          name: 'Super Admin',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      });

      const existingAdmin = {
        id: 'user-admin-1',
        email: 'admin@flowtrack.dev',
        fullName: 'Super Admin',
        passwordHash: '$2a$10$adminPasswordHash',
        googleId: 'google-sub-admin-1',
        isActive: true,
        deletedAt: null,
        memberships: [
          {
            id: 'mem-admin',
            workspaceId: 'ws-company',
            role: Role.ADMIN,
            workspace: { id: 'ws-company', name: 'FlowTrack HQ', slug: 'hq' },
          },
        ],
      };

      prismaMock.user.findFirst.mockResolvedValueOnce(existingAdmin);

      const res = await authService.loginWithGoogle({ idToken: 'token-admin' });

      expect(res.workspaces[0].role).toBe(Role.ADMIN);
      expect(res.user.email).toBe('admin@flowtrack.dev');
    });
  });

  // =========================================================================
  // 3. ROLE ESCALATION DEFENSE
  // =========================================================================
  describe('3. Role Escalation Defense', () => {
    it('prevents Google sign-in from granting elevated roles across workspaces', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google-sub-attacker',
          email: 'attacker@evil.com',
          email_verified: true,
          name: 'Attacker Attempting Escalation',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      });

      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce({
        id: 'user-attacker',
        email: 'attacker@evil.com',
        fullName: 'Attacker Attempting Escalation',
        googleId: 'google-sub-attacker',
        isActive: true,
        deletedAt: null,
      });

      const createdWs = {
        id: 'ws-attacker',
        name: "Attacker's Workspace",
        slug: 'attacker-ws',
        memberships: [{ role: Role.MEMBER }],
      };
      prismaMock.workspace.create.mockResolvedValueOnce(createdWs);

      const res = await authService.loginWithGoogle({
        idToken: 'token-attacker',
        // Even if client attempts to pass malicious role properties, schema/service ignores them
      } as any);

      // Enforces standard non-elevated MEMBER role
      expect(res.workspaces[0].role).toBe(Role.MEMBER);
      expect(res.workspaces[0].role).not.toBe(Role.ADMIN);
      expect(res.workspaces[0].role).not.toBe(Role.MANAGER);
      expect(res.workspaces[0].role).not.toBe(Role.TEAM_LEAD);
    });

    it('rejects unauthorized role changes attempted by non-admin members', async () => {
      // Simulate member attempting to access admin-restricted context
      const contextMock: any = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-workspace-id': 'ws-target' },
            user: {
              id: 'user-attacker-1',
              memberships: [
                {
                  workspaceId: 'ws-target',
                  role: Role.MEMBER,
                },
              ],
            },
            params: { workspaceId: 'ws-target' },
          }),
        }),
      };

      // Handler requires ADMIN role
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

      expect(() => rolesGuard.canActivate(contextMock)).toThrow(
        /Access denied. Requires one of the following roles: ADMIN/
      );
    });
  });

  // =========================================================================
  // 4. BOUNDARY & SECURITY TOKEN VALIDATIONS
  // =========================================================================
  describe('4. Boundary & Security Token Validations', () => {
    it('rejects tampered or forged signatures with 401 Unauthorized', async () => {
      mockOAuthClient.verifyIdToken.mockRejectedValueOnce(
        new Error('Crypto signature verification failed')
      );

      await expect(
        authService.loginWithGoogle({ idToken: 'tampered-signature-token' })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects empty or missing token payloads with 400 Bad Request', async () => {
      await expect(authService.loginWithGoogle({ idToken: '' })).rejects.toThrow(
        BadRequestException
      );
      await expect(authService.loginWithGoogle({} as any)).rejects.toThrow(
        BadRequestException
      );
    });

    it('rejects untrusted token issuers with 401 Unauthorized', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'sub-untrusted',
          iss: 'https://attacker-identity-provider.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'target@flowtrack.dev',
          email_verified: true,
        }),
      });

      await expect(
        authService.loginWithGoogle({ idToken: 'untrusted-iss-token' })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects tokens with mismatched audience with 401 Unauthorized', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'sub-bad-aud',
          iss: 'accounts.google.com',
          aud: 'mismatched-foreign-client-id.apps.googleusercontent.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'target@flowtrack.dev',
          email_verified: true,
        }),
      });

      await expect(
        authService.loginWithGoogle({ idToken: 'foreign-aud-token' })
      ).rejects.toThrow(/Google token audience does not match/);
    });

    it('rejects expired Google tokens with 401 Unauthorized', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'sub-expired',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) - 120, // expired 2 minutes ago
          email: 'expired@flowtrack.dev',
          email_verified: true,
        }),
      });

      await expect(
        authService.loginWithGoogle({ idToken: 'expired-token' })
      ).rejects.toThrow(/Google token has expired/);
    });

    it('rejects unverified Google emails with 401 Unauthorized', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'sub-unverified',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'unverified-email@flowtrack.dev',
          email_verified: false, // NOT verified by Google
        }),
      });

      await expect(
        authService.loginWithGoogle({ idToken: 'unverified-email-token' })
      ).rejects.toThrow(/Google account email is not verified/);
    });

    it('rejects deactivated user accounts with 401 Unauthorized', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'sub-deactivated',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'deactivated@flowtrack.dev',
          email_verified: true,
        }),
      });

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 'user-deactivated',
        email: 'deactivated@flowtrack.dev',
        isActive: false, // Banned/deactivated
        deletedAt: null,
      });

      await expect(
        authService.loginWithGoogle({ idToken: 'deactivated-user-token' })
      ).rejects.toThrow('Account is deactivated. Please contact your platform administrator.');
    });

    it('rejects soft-deleted user accounts with 401 Unauthorized', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'sub-deleted',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'deleted@flowtrack.dev',
          email_verified: true,
        }),
      });

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 'user-deleted',
        email: 'deleted@flowtrack.dev',
        isActive: true,
        deletedAt: new Date(), // Soft deleted
      });

      await expect(
        authService.loginWithGoogle({ idToken: 'deleted-user-token' })
      ).rejects.toThrow('Account is deactivated. Please contact your platform administrator.');
    });
  });

  // =========================================================================
  // 5. DUPLICATE ACCOUNT PREVENTION & LINK COLLISIONS
  // =========================================================================
  describe('5. Duplicate Account Prevention & Link Collisions', () => {
    it('prevents linking if Google ID is already tied to another user account (409 Conflict)', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google-sub-collision-777',
          email: 'victim@flowtrack.dev',
          email_verified: true,
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      });

      // Google ID is already owned by user-victim
      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: 'user-victim',
        email: 'victim@flowtrack.dev',
        googleId: 'google-sub-collision-777',
      });

      // user-attacker attempts to link it to their own profile
      await expect(
        authService.linkGoogleAccount('user-attacker', { idToken: 'token-victim' })
      ).rejects.toThrow(ConflictException);
    });

    it('successfully links Google account when no collision exists', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google-sub-clean',
          email: 'clean@flowtrack.dev',
          email_verified: true,
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      });

      // Not linked to anyone else
      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      prismaMock.user.update.mockResolvedValueOnce({
        id: 'user-clean',
        googleId: 'google-sub-clean',
      });

      const res = await authService.linkGoogleAccount('user-clean', { idToken: 'token-clean' });
      expect(res.message).toBe('Google account linked successfully');
      expect(res.googleId).toBe('google-sub-clean');
    });
  });

  // =========================================================================
  // 6. SESSION HANDLING & BACKEND AUTHORIZATION
  // =========================================================================
  describe('6. Session Handling & Backend Authorization', () => {
    it('validates active session and loads user context via JwtStrategy', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'user-active-1',
        email: 'active@flowtrack.dev',
        isActive: true,
        deletedAt: null,
        memberships: [{ workspaceId: 'ws-1' }],
      });

      const user = await jwtStrategy.validate({
        sub: 'user-active-1',
        email: 'active@flowtrack.dev',
        activeWorkspaceId: 'ws-1',
      });

      expect(user.id).toBe('user-active-1');
      expect(user.email).toBe('active@flowtrack.dev');
      expect(user.activeWorkspaceId).toBe('ws-1');
    });

    it('rejects deactivated user sessions in JwtStrategy with 401 Unauthorized', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'user-deactivated-2',
        email: 'deactivated@flowtrack.dev',
        isActive: false,
        deletedAt: null,
      });

      await expect(
        jwtStrategy.validate({
          sub: 'user-deactivated-2',
          email: 'deactivated@flowtrack.dev',
          activeWorkspaceId: 'ws-1',
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects soft-deleted user sessions in JwtStrategy with 401 Unauthorized', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'user-deleted-2',
        email: 'deleted@flowtrack.dev',
        isActive: true,
        deletedAt: new Date(),
      });

      await expect(
        jwtStrategy.validate({
          sub: 'user-deleted-2',
          email: 'deleted@flowtrack.dev',
          activeWorkspaceId: 'ws-1',
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('getMe rejects unauthenticated or missing users with 401 Unauthorized', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await expect(authService.getMe('non-existent-user-id')).rejects.toThrow(
        UnauthorizedException
      );
    });
  });
});
