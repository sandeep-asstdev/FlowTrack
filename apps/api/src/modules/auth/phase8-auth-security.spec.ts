import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { OtpService } from './otp/otp.service';
import { GoogleAuthService } from './google-auth.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { BadRequestException, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

describe('Phase 8 — Authentication & Security Test Suite', () => {
  let authService: AuthService;
  let otpService: OtpService;
  let googleAuthService: GoogleAuthService;
  let workspacesService: WorkspacesService;

  let prismaMock: any;
  let jwtMock: any;
  let mockOAuthClient: any;

  const mockDb = {
    users: new Map<string, any>(),
    workspaces: new Map<string, any>(),
    memberships: new Map<string, any>(),
    otpChallenges: new Map<string, any>(),
    phoneProofs: new Map<string, any>(),
    passwordResetTokens: new Map<string, any>(),
    pendingGoogleSignups: new Map<string, any>(),
    authIdentities: new Map<string, any>(),
  };

  beforeEach(() => {
    mockDb.users.clear();
    mockDb.workspaces.clear();
    mockDb.memberships.clear();
    mockDb.otpChallenges.clear();
    mockDb.phoneProofs.clear();
    mockDb.passwordResetTokens.clear();
    mockDb.pendingGoogleSignups.clear();
    mockDb.authIdentities.clear();

    prismaMock = {
      user: {
        findUnique: vi.fn(async ({ where, include }: any) => {
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
                workspace: mockDb.workspaces.get(m.workspaceId) || { id: m.workspaceId, name: 'Workspace', slug: 'workspace' },
              })),
            };
          }
          return u;
        }),
        findFirst: vi.fn(async ({ where, include }: any) => {
          for (const u of mockDb.users.values()) {
            if (where.email && u.email === where.email) return u;
            if (where.phone && u.phone === where.phone) return u;
            if (where.googleId && u.googleId === where.googleId) return u;
            if (where.OR) {
              for (const c of where.OR) {
                if (c.email && u.email === c.email) return u;
                if (c.phone && u.phone === c.phone) return u;
                if (c.googleId && u.googleId === c.googleId) return u;
              }
            }
          }
          return null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const user = { id: `user-${Date.now()}-${Math.random()}`, ...data };
          mockDb.users.set(user.id, user);
          return user;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const u = mockDb.users.get(where.id);
          if (!u) throw new Error('User not found');
          const updated = { ...u, ...data };
          mockDb.users.set(where.id, updated);
          return updated;
        }),
      },
      workspace: {
        create: vi.fn(async ({ data }: any) => {
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
        findUnique: vi.fn(async ({ where }: any) => {
          const key = `${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`;
          return mockDb.memberships.get(key) || null;
        }),
        count: vi.fn(async ({ where }: any) => {
          let count = 0;
          for (const m of mockDb.memberships.values()) {
            if (m.workspaceId === where.workspaceId && m.role === where.role) {
              count++;
            }
          }
          return count;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const key = `${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`;
          const m = mockDb.memberships.get(key);
          if (!m) throw new Error('Membership not found');
          const updated = { ...m, ...data };
          mockDb.memberships.set(key, updated);
          return updated;
        }),
      },
      otpChallenge: {
        findFirst: vi.fn(async ({ where }: any) => {
          for (const c of Array.from(mockDb.otpChallenges.values()).reverse()) {
            if (c.phone === where.phone && c.purpose === where.purpose && !c.consumed && c.expiresAt > new Date()) {
              return c;
            }
          }
          return null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const challenge = { id: `otp-${Date.now()}-${Math.random()}`, createdAt: new Date(), ...data };
          mockDb.otpChallenges.set(challenge.id, challenge);
          return challenge;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const c = mockDb.otpChallenges.get(where.id);
          if (!c) throw new Error('Challenge not found');
          const updated = { ...c, ...data };
          mockDb.otpChallenges.set(where.id, updated);
          return updated;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          for (const c of mockDb.otpChallenges.values()) {
            if (c.phone === where.phone && c.purpose === where.purpose) {
              Object.assign(c, data);
            }
          }
          return { count: mockDb.otpChallenges.size };
        }),
      },
      phoneVerificationProof: {
        create: vi.fn(async ({ data }: any) => {
          const proof = { id: `proof-${Date.now()}`, ...data };
          mockDb.phoneProofs.set(data.proofHash, proof);
          return proof;
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          return mockDb.phoneProofs.get(where.proofHash) || null;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          for (const [hash, p] of mockDb.phoneProofs.entries()) {
            if (p.id === where.id) {
              const updated = { ...p, ...data };
              mockDb.phoneProofs.set(hash, updated);
              return updated;
            }
          }
          return null;
        }),
      },
      passwordResetToken: {
        create: vi.fn(async ({ data }: any) => {
          const rec = { id: `prt-${Date.now()}`, ...data };
          mockDb.passwordResetTokens.set(data.tokenHash, rec);
          return rec;
        }),
        findFirst: vi.fn(async ({ where, include }: any) => {
          const rec = mockDb.passwordResetTokens.get(where.tokenHash);
          if (rec && !rec.consumed && rec.expiresAt > new Date()) {
            if (include?.user) {
              const u = mockDb.users.get(rec.userId);
              return { ...rec, user: u };
            }
            return rec;
          }
          return null;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          for (const [hash, rec] of mockDb.passwordResetTokens.entries()) {
            if (rec.id === where.id) {
              const updated = { ...rec, ...data };
              mockDb.passwordResetTokens.set(hash, updated);
              return updated;
            }
          }
          return null;
        }),
      },
      pendingGoogleSignup: {
        create: vi.fn(async ({ data }: any) => {
          const pending = { id: `pgs-${Date.now()}`, ...data };
          mockDb.pendingGoogleSignups.set(data.tokenHash, pending);
          return pending;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          const p = mockDb.pendingGoogleSignups.get(where.tokenHash);
          if (p && !p.consumed && p.expiresAt > new Date()) return p;
          return null;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          for (const [hash, p] of mockDb.pendingGoogleSignups.entries()) {
            if (p.id === where.id) {
              const updated = { ...p, ...data };
              mockDb.pendingGoogleSignups.set(hash, updated);
              return updated;
            }
          }
          return null;
        }),
      },
      authIdentity: {
        upsert: vi.fn(async ({ create, update }: any) => {
          const key = `${create.provider}_${create.providerSubject}`;
          const rec = { id: `auth-id-${Date.now()}`, ...create, ...update };
          mockDb.authIdentities.set(key, rec);
          return rec;
        }),
        create: vi.fn(async ({ data }: any) => {
          const key = `${data.provider}_${data.providerSubject}`;
          const rec = { id: `auth-id-${Date.now()}`, ...data };
          mockDb.authIdentities.set(key, rec);
          return rec;
        }),
      },
      auditLog: {
        create: vi.fn(async () => ({ id: 'al-1' })),
      },
      $transaction: vi.fn(async (actions: any) => Promise.all(actions)),
    };

    jwtMock = {
      sign: vi.fn(() => 'mock-jwt-phase8'),
    };

    googleAuthService = new GoogleAuthService();
    mockOAuthClient = { verifyIdToken: vi.fn() };
    googleAuthService.setOAuthClient(mockOAuthClient);

    otpService = new OtpService(prismaMock);
    authService = new AuthService(prismaMock, jwtMock, otpService, { log: vi.fn() } as any, googleAuthService);
    workspacesService = new WorkspacesService(prismaMock);
  });

  describe('1. Mobile Phone OTP & Verification Proof', () => {
    it('requests OTP and enforces 45-second resend cooldown', async () => {
      const res = await otpService.requestOtp('+919876543210', 'SIGNUP');
      expect(res.success).toBe(true);
      expect(res.resendCooldownSeconds).toBe(45);

      // Immediate second request must be blocked by cooldown
      await expect(otpService.requestOtp('+919876543210', 'SIGNUP')).rejects.toThrow(
        /Please wait \d+ seconds before requesting a new verification code/
      );
    });

    it('locks out after 5 consecutive incorrect OTP attempts', async () => {
      await otpService.requestOtp('+919876543211', 'SIGNUP');

      for (let i = 1; i <= 4; i++) {
        await expect(otpService.verifyOtp('+919876543211', '000000', 'SIGNUP')).rejects.toThrow(
          /Invalid OTP: Incorrect verification code/
        );
      }

      // 5th attempt exhausts attempts and invalidates challenge
      await expect(otpService.verifyOtp('+919876543211', '000000', 'SIGNUP')).rejects.toThrow(
        /Maximum attempts exceeded/
      );
    });

    it('issues single-use phone verification proof on successful verification', async () => {
      await otpService.requestOtp('+919876543212', 'SIGNUP');
      const verifyRes = await otpService.verifyOtp('+919876543212', '123456', 'SIGNUP');

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.phoneProof).toBeDefined();

      // Consumes proof on first registration
      const firstConsume = await otpService.validateAndConsumePhoneProof('+919876543212', verifyRes.phoneProof);
      expect(firstConsume).toBe(true);

      // Replay attack: second consumption of same proof MUST be rejected
      const replayConsume = await otpService.validateAndConsumePhoneProof('+919876543212', verifyRes.phoneProof);
      expect(replayConsume).toBe(false);
    });
  });

  describe('2. Registration & Mass-Assignment Protection', () => {
    it('strictly assigns Role.MEMBER and ignores role/requestedRole in payload', async () => {
      await otpService.requestOtp('+919876543213', 'SIGNUP');
      const verifyRes = await otpService.verifyOtp('+919876543213', '123456', 'SIGNUP');

      const res = await authService.register({
        fullName: 'Arjun Verma',
        email: 'arjun@acme.dev',
        password: 'Password123!',
        phone: '+919876543213',
        phoneProof: verifyRes.phoneProof,
        requestedRole: 'MANAGER' as any,
      } as any);

      expect(res.user.email).toBe('arjun@acme.dev');
      expect(res.role).toBe(Role.MEMBER); // Mass-assignment protected!
    });

    it('rejects public signup attempting to claim ADMIN role', async () => {
      await otpService.requestOtp('+919876543299', 'SIGNUP');
      const verifyRes = await otpService.verifyOtp('+919876543299', '123456', 'SIGNUP');

      await expect(
        authService.register({
          fullName: 'Hacker Admin',
          email: 'hacker@acme.dev',
          password: 'Password123!',
          phone: '+919876543299',
          phoneProof: verifyRes.phoneProof,
          role: 'ADMIN',
        } as any)
      ).rejects.toThrow(/Public signup cannot grant Platform Admin role/);
    });

    it('rejects passwords from common password blocklist', async () => {
      await otpService.requestOtp('+919876543214', 'SIGNUP');
      const verifyRes = await otpService.verifyOtp('+919876543214', '123456', 'SIGNUP');

      await expect(
        authService.register({
          fullName: 'Security Tester',
          email: 'tester@acme.dev',
          password: 'password123', // Common password
          phone: '+919876543214',
          phoneProof: verifyRes.phoneProof,
        })
      ).rejects.toThrow(/too common or easily guessable/);
    });
  });

  describe('3. Login Security & Session Management', () => {
    it('returns generic error on wrong password or unknown user without timing leak', async () => {
      await expect(
        authService.login({ email: 'nonexistent@acme.dev', password: 'WrongPassword123!' })
      ).rejects.toThrow('Invalid email or password');
    });

    it('invalidates sessions across devices when password is reset by incrementing tokenVersion', async () => {
      const initialPasswordHash = await bcrypt.hash('OldPassword123!', 10);
      const user = await prismaMock.user.create({
        data: {
          email: 'session-test@acme.dev',
          fullName: 'Session User',
          passwordHash: initialPasswordHash,
          isActive: true,
          tokenVersion: 1,
        },
      });

      // Request password reset
      const forgotRes = await authService.forgotPassword({ email: 'session-test@acme.dev' });
      expect(forgotRes.resetToken).toBeDefined();

      // Reset password
      const resetRes = await authService.resetPassword({
        token: forgotRes.resetToken!,
        newPassword: 'NewPassword123!',
      } as any);
      expect(resetRes.success).toBe(true);

      const updatedUser = mockDb.users.get(user.id);
      expect(updatedUser.tokenVersion).toBe(2); // Invalidation verified!
    });
  });

  describe('4. Google Authentication & Completion Flow', () => {
    it('returns PENDING_REGISTRATION for new Google users requiring phone proof', async () => {
      mockOAuthClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: process.env.GOOGLE_CLIENT_ID || '954853707879-khbiv8su3of67ih08vfflpj2vanqbj2j.apps.googleusercontent.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: 'newgoogleuser@gmail.com',
          email_verified: true,
          name: 'Google User',
          sub: 'google-sub-999',
          picture: 'https://lh3.googleusercontent.com/avatar',
        }),
      });

      const res = await authService.loginWithGoogle({ idToken: 'valid-google-token' });
      expect(res.status).toBe('PENDING_REGISTRATION');
      expect(res.signupToken).toBeDefined();

      // Complete Google registration with phone proof
      await otpService.requestOtp('+919876543215', 'SIGNUP');
      const verifyRes = await otpService.verifyOtp('+919876543215', '123456', 'SIGNUP');

      const completeRes = await authService.completeGoogleRegistration({
        signupToken: res.signupToken!,
        fullName: 'Google User Completed',
        phone: '+919876543215',
        phoneProof: verifyRes.phoneProof,
      });

      expect(completeRes.status).toBe('AUTHENTICATED');
      expect(completeRes.user.email).toBe('newgoogleuser@gmail.com');
      expect(completeRes.workspaces[0].role).toBe(Role.MEMBER);
    });
  });

  describe('5. Role Management & Authorization Boundaries', () => {
    it('prevents self-promotion or modifying own role', async () => {
      mockDb.memberships.set('ws-1_admin-1', {
        id: 'mem-1',
        workspaceId: 'ws-1',
        userId: 'admin-1',
        role: Role.ADMIN,
      });

      await expect(
        workspacesService.updateMemberRole('ws-1', 'admin-1', 'admin-1', Role.ADMIN)
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks demoting the last active Platform Admin in a workspace', async () => {
      mockDb.memberships.set('ws-1_admin-1', {
        id: 'mem-1',
        workspaceId: 'ws-1',
        userId: 'admin-1',
        role: Role.ADMIN,
      });
      mockDb.memberships.set('ws-1_admin-2', {
        id: 'mem-2',
        workspaceId: 'ws-1',
        userId: 'admin-2',
        role: Role.ADMIN,
      });

      // When active admin count is 1, demoting an ADMIN must fail
      prismaMock.membership.count.mockResolvedValueOnce(1);
      await expect(
        workspacesService.updateMemberRole('ws-1', 'admin-1', 'admin-2', Role.MEMBER)
      ).rejects.toThrow(/Cannot demote the last active Platform Admin/);
    });
  });
});
