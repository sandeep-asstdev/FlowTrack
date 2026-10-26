import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { GoogleAuthService, GoogleUserPayload } from './google-auth.service';
import { UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('Google Authentication Backend (Chunk 1)', () => {
  let authService: AuthService;
  let googleAuthService: GoogleAuthService;
  let prismaMock: any;
  let jwtServiceMock: any;
  let mockOAuthClient: any;

  const TEST_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-flowtrack-google-client-id.apps.googleusercontent.com';

  beforeEach(() => {
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
        findMany: vi.fn(),
      },
    };

    jwtServiceMock = {
      sign: vi.fn().mockReturnValue('mock-jwt-token-12345'),
    };

    googleAuthService = new GoogleAuthService();
    mockOAuthClient = {
      verifyIdToken: vi.fn(),
    };
    googleAuthService.setOAuthClient(mockOAuthClient);

    authService = new AuthService(prismaMock, jwtServiceMock, googleAuthService);
  });

  describe('1. Google Token Verification (Signature, Issuer, Audience, Expiry, Verified Email)', () => {
    it('throws BadRequestException if idToken is empty or missing', async () => {
      await expect(googleAuthService.verifyIdToken('')).rejects.toThrow(BadRequestException);
      await expect(googleAuthService.verifyIdToken(null as any)).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException if cryptographic verification fails', async () => {
      mockOAuthClient.verifyIdToken.mockRejectedValue(new Error('Invalid signature'));

      await expect(googleAuthService.verifyIdToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects tokens from unauthorized issuers', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          iss: 'https://malicious-issuer.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'user@example.com',
          email_verified: true,
        }),
      });

      await expect(googleAuthService.verifyIdToken('token-bad-iss')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects tokens with mismatched audience', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          iss: 'accounts.google.com',
          aud: 'mismatched-client-id.apps.googleusercontent.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'user@example.com',
          email_verified: true,
        }),
      });

      await expect(googleAuthService.verifyIdToken('bad-aud-token')).rejects.toThrow(
        /Google token audience does not match/
      );
    });

    it('accepts tokens from valid Google issuers (accounts.google.com and https://accounts.google.com)', async () => {
      const validPayload = {
        sub: 'google-sub-123',
        iss: 'https://accounts.google.com',
        aud: TEST_CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
        email: 'user@example.com',
        email_verified: true,
        name: 'Jane Doe',
        picture: 'https://lh3.googleusercontent.com/avatar.jpg',
      };

      mockOAuthClient.verifyIdToken.mockResolvedValue({
        getPayload: () => validPayload,
      });

      const res = await googleAuthService.verifyIdToken('valid-token');
      expect(res.sub).toBe('google-sub-123');
      expect(res.email).toBe('user@example.com');
      expect(res.emailVerified).toBe(true);
      expect(res.name).toBe('Jane Doe');
      expect(res.picture).toBe('https://lh3.googleusercontent.com/avatar.jpg');
    });

    it('rejects expired Google ID tokens', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) - 60, // Expired 1 minute ago
          email: 'user@example.com',
          email_verified: true,
        }),
      });

      await expect(googleAuthService.verifyIdToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects tokens with unverified email addresses', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'unverified@example.com',
          email_verified: false, // Unverified!
        }),
      });

      await expect(googleAuthService.verifyIdToken('unverified-token')).rejects.toThrow(
        /Google account email is not verified/
      );
    });

    it('rejects tokens missing email address', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          iss: 'accounts.google.com',
          aud: TEST_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email_verified: true,
        }),
      });

      await expect(googleAuthService.verifyIdToken('no-email-token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Account Matching & Duplicate Prevention', () => {
    it('authenticates existing user matching googleId without creating duplicate', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-uid-888',
        email: 'alex@flowtrack.io',
        emailVerified: true,
        name: 'Alex Rivera',
        picture: 'https://google.com/pic.jpg',
      });

      const existingUser = {
        id: 'user-888',
        email: 'alex@flowtrack.io',
        fullName: 'Alex Rivera',
        avatarUrl: 'https://google.com/pic.jpg',
        googleId: 'google-uid-888',
        isActive: true,
        deletedAt: null,
        memberships: [
          {
            workspaceId: 'ws-existing',
            role: Role.MEMBER,
            workspace: { id: 'ws-existing', name: 'Engineering', slug: 'eng' },
          },
        ],
      };

      prismaMock.user.findFirst.mockResolvedValue(existingUser);
      prismaMock.user.update.mockResolvedValue(existingUser);

      const res = await authService.loginWithGoogle({ idToken: 'valid-token' });

      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(res.user.id).toBe('user-888');
      expect(res.accessToken).toBe('mock-jwt-token-12345');
      expect(res.workspaces[0].role).toBe(Role.MEMBER);
    });

    it('links googleId to existing user with matching email safely', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-uid-999',
        email: 'suresh@flowtrack.dev',
        emailVerified: true,
        name: 'Suresh Sharma',
        picture: 'https://google.com/suresh.jpg',
      });

      const existingPasswordUser = {
        id: 'user-suresh',
        email: 'suresh@flowtrack.dev',
        fullName: 'Suresh Sharma',
        passwordHash: '$2a$10$hashedpassword',
        googleId: null, // Not yet linked
        avatarUrl: null,
        isActive: true,
        deletedAt: null,
        memberships: [
          {
            workspaceId: 'ws-suresh',
            role: Role.MANAGER,
            workspace: { id: 'ws-suresh', name: 'Operations', slug: 'ops' },
          },
        ],
      };

      prismaMock.user.findFirst.mockResolvedValue(existingPasswordUser);
      prismaMock.user.update.mockResolvedValue({
        ...existingPasswordUser,
        googleId: 'google-uid-999',
        avatarUrl: 'https://google.com/suresh.jpg',
      });

      const res = await authService.loginWithGoogle({ credential: 'valid-token' });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-suresh' },
          data: expect.objectContaining({
            googleId: 'google-uid-999',
            avatarUrl: 'https://google.com/suresh.jpg',
          }),
        })
      );
      expect(res.user.googleLinked).toBe(true);
      expect(res.workspaces[0].role).toBe(Role.MANAGER); // Preserves existing MANAGER role!
    });

    it('rejects deactivated or deleted accounts even with valid Google credentials', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-uid-inactive',
        email: 'banned@flowtrack.dev',
        emailVerified: true,
      });

      prismaMock.user.findFirst.mockResolvedValue({
        id: 'user-banned',
        email: 'banned@flowtrack.dev',
        isActive: false, // DEACTIVATED
        deletedAt: null,
        memberships: [],
      });

      await expect(authService.loginWithGoogle({ idToken: 'token-banned' })).rejects.toThrow(
        /Account is deactivated/
      );
    });
  });

  describe('3. Role Safety & New User Registration', () => {
    it('creates new Google user with non-elevated MEMBER role and personal workspace', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-newbie',
        email: 'newbie@gmail.com',
        emailVerified: true,
        name: 'Newbie User',
        picture: 'https://lh3.googleusercontent.com/newbie.jpg',
      });

      // No user found
      prismaMock.user.findFirst.mockResolvedValue(null);

      const createdUser = {
        id: 'user-newbie-1',
        email: 'newbie@gmail.com',
        fullName: 'Newbie User',
        avatarUrl: 'https://lh3.googleusercontent.com/newbie.jpg',
        googleId: 'google-sub-newbie',
        passwordHash: null,
        isActive: true,
        memberships: [],
      };

      prismaMock.user.create.mockResolvedValue(createdUser);

      const createdWorkspace = {
        id: 'ws-newbie',
        name: "Newbie User's Workspace",
        slug: 'newbie-user-workspace-123',
      };
      prismaMock.workspace.create.mockResolvedValue(createdWorkspace);

      const res = await authService.loginWithGoogle({ idToken: 'token-newbie' });

      // Verifies user created with googleId and without password
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'newbie@gmail.com',
          fullName: 'Newbie User',
          googleId: 'google-sub-newbie',
          passwordHash: null,
          isActive: true,
        }),
        include: expect.anything(),
      });

      // Verifies personal workspace membership is created with standard MEMBER role
      expect(prismaMock.workspace.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          memberships: {
            create: {
              userId: 'user-newbie-1',
              role: Role.MEMBER, // Never elevated!
            },
          },
        }),
      });

      expect(res.user.email).toBe('newbie@gmail.com');
      expect(res.workspaces[0].role).toBe(Role.MEMBER);
    });

    it('never alters existing roles when logging in with Google', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-teamlead',
        email: 'lead@flowtrack.io',
        emailVerified: true,
      });

      const teamLeadUser = {
        id: 'user-lead',
        email: 'lead@flowtrack.io',
        googleId: 'google-sub-teamlead',
        isActive: true,
        memberships: [
          {
            workspaceId: 'ws-1',
            role: Role.TEAM_LEAD,
            workspace: { id: 'ws-1', name: 'Workspace 1', slug: 'ws-1' },
          },
          {
            workspaceId: 'ws-2',
            role: Role.MEMBER,
            workspace: { id: 'ws-2', name: 'Workspace 2', slug: 'ws-2' },
          },
        ],
      };

      prismaMock.user.findFirst.mockResolvedValue(teamLeadUser);

      const res = await authService.loginWithGoogle({ idToken: 'token-lead' });

      // Ensure roles returned match exactly the existing assigned roles
      expect(res.workspaces[0].role).toBe(Role.TEAM_LEAD);
      expect(res.workspaces[1].role).toBe(Role.MEMBER);
    });
  });

  describe('4. Explicit Google Account Linking (linkGoogleAccount)', () => {
    it('links Google ID to current authenticated user', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-link',
        email: 'member@flowtrack.io',
        emailVerified: true,
        picture: 'https://photo.jpg',
      });

      prismaMock.user.findFirst.mockResolvedValue(null); // Not linked to anyone else
      prismaMock.user.update.mockResolvedValue({
        id: 'user-curr',
        googleId: 'google-sub-link',
      });

      const res = await authService.linkGoogleAccount('user-curr', { idToken: 'token-link' });

      expect(res.message).toBe('Google account linked successfully');
      expect(res.googleId).toBe('google-sub-link');
    });

    it('prevents linking if Google ID is already tied to a different user account', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-conflict',
        email: 'conflict@flowtrack.io',
        emailVerified: true,
      });

      // Already tied to user-other
      prismaMock.user.findFirst.mockResolvedValue({
        id: 'user-other',
        email: 'conflict@flowtrack.io',
        googleId: 'google-sub-conflict',
      });

      await expect(
        authService.linkGoogleAccount('user-curr', { idToken: 'token-conflict' })
      ).rejects.toThrow(ConflictException);
    });
  });
});
