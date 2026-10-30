import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { NodesService } from '../nodes/nodes.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';

describe('FlowTrack — Complete User Management & Authentication Suite', () => {
  let authService: AuthService;
  let jwtStrategy: JwtStrategy;
  let rolesGuard: RolesGuard;
  let workspacesService: WorkspacesService;
  let nodesService: NodesService;
  let reflector: Reflector;

  const JWT_SECRET = 'flowtrack-super-secret-jwt-key-2026-very-secure';

  // Isolated In-Memory Database Fixture
  const db = {
    users: new Map<string, any>(),
    memberships: new Map<string, any>(),
    workspaces: new Map<string, any>(),
    nodes: new Map<string, any>(),
  };

  beforeEach(() => {
    db.users.clear();
    db.memberships.clear();
    db.workspaces.clear();
    db.nodes.clear();

    const prismaMock: any = {
      user: {
        findFirst: vi.fn(async ({ where }) => {
          for (const u of db.users.values()) {
            if (where.email && u.email.toLowerCase() === where.email.toLowerCase()) return u;
            if (where.phone && u.phone === where.phone) return u;
            if (where.OR) {
              for (const c of where.OR) {
                if (c.email && u.email.toLowerCase() === c.email.toLowerCase()) return u;
                if (c.phone && u.phone === c.phone) return u;
              }
            }
          }
          return null;
        }),
        findUnique: vi.fn(async ({ where, include }) => {
          let u = null;
          if (where.id) u = db.users.get(where.id);
          if (where.email) {
            for (const item of db.users.values()) {
              if (item.email.toLowerCase() === where.email.toLowerCase()) {
                u = item;
                break;
              }
            }
          }
          if (where.phone) {
            for (const item of db.users.values()) {
              if (item.phone === where.phone) {
                u = item;
                break;
              }
            }
          }
          if (!u) return null;
          if (include?.memberships) {
            const mems = Array.from(db.memberships.values()).filter((m) => m.userId === u.id);
            return {
              ...u,
              memberships: mems.map((m) => ({
                ...m,
                workspace: db.workspaces.get(m.workspaceId) || { id: m.workspaceId, name: 'Workspace' },
              })),
            };
          }
          return u;
        }),
        create: vi.fn(async ({ data }) => {
          const id = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const user = { id, ...data };
          db.users.set(id, user);
          return user;
        }),
        update: vi.fn(async ({ where, data }) => {
          const u = db.users.get(where.id);
          if (!u) throw new Error('User not found');
          const updated = { ...u, ...data };
          db.users.set(where.id, updated);
          return updated;
        }),
      },
      workspace: {
        create: vi.fn(async ({ data }) => {
          const wsId = `ws-${Date.now()}`;
          const ws = { id: wsId, ...data };
          db.workspaces.set(wsId, ws);
          if (data.memberships?.create) {
            const m = {
              id: `mem-${Date.now()}`,
              workspaceId: wsId,
              userId: data.memberships.create.userId,
              role: data.memberships.create.role,
            };
            db.memberships.set(`${wsId}_${m.userId}`, m);
          }
          return ws;
        }),
      },
      membership: {
        findUnique: vi.fn(async ({ where }) => {
          if (where.workspaceId_userId) {
            return db.memberships.get(`${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`) || null;
          }
          return null;
        }),
        count: vi.fn(async () => 1),
        update: vi.fn(async ({ where, data }) => {
          const key = `${where.workspaceId_userId.workspaceId}_${where.workspaceId_userId.userId}`;
          const m = db.memberships.get(key);
          const updated = { ...m, ...data };
          db.memberships.set(key, updated);
          return updated;
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
      projectMember: { count: vi.fn(async () => 0), findUnique: vi.fn(async () => null) },
      teamMember: { findFirst: vi.fn(async () => ({ id: 'lead-1', role: 'lead' })) },
    };

    const realJwtService = new JwtService({ secret: JWT_SECRET });

    const jwtServiceMock: any = {
      sign: vi.fn((payload) => realJwtService.sign(payload)),
    };

    authService = new AuthService(prismaMock, jwtServiceMock);
    jwtStrategy = new JwtStrategy(prismaMock);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    workspacesService = new WorkspacesService(prismaMock);
    nodesService = new NodesService(prismaMock, null as any, null as any, null as any);
  });

  // =========================================================================
  // PHASE 2 — REGISTRATION TESTS
  // =========================================================================
  describe('PHASE 2 — Registration Tests', () => {
    describe('2.1 Valid Registration & Safe Credential Storage', () => {
      it('registers successfully with valid credentials and does not expose plain password', async () => {
        const res = await authService.register({
          fullName: 'Vikramaditya Rathore',
          email: 'vikram@flowtrack.in',
          password: 'Password123!',
          phone: '+919876543210',
          requestedRole: 'MANAGER' as any,
          workspaceName: 'Rathore Infrastructure',
        });

        expect(res.user.email).toBe('vikram@flowtrack.in');
        expect(res.user.phone).toBe('+919876543210');
        expect(res.role).toBe(Role.MEMBER);
        expect(res.accessToken).toBeDefined();

        // Verify password is encrypted via bcrypt in the database
        const savedUser = Array.from(db.users.values()).find((u) => u.email === 'vikram@flowtrack.in');
        expect(savedUser).toBeDefined();
        expect(savedUser.passwordHash).toBeDefined();
        expect(savedUser.passwordHash).not.toEqual('Password123!');
        expect(savedUser.passwordHash.startsWith('$2')).toBe(true);

        const isBcryptMatch = await bcrypt.compare('Password123!', savedUser.passwordHash);
        expect(isBcryptMatch).toBe(true);

        // Verify plain password is NEVER returned in the API response
        expect((res as any).password).toBeUndefined();
        expect((res as any).passwordHash).toBeUndefined();
      });

      it('rejects duplicate registration attempts with same email (409 Conflict)', async () => {
        await authService.register({
          fullName: 'User One',
          email: 'duplicate@flowtrack.in',
          password: 'Password123!',
          phone: '+919876543211',
        });

        await expect(
          authService.register({
            fullName: 'User Duplicate',
            email: 'duplicate@flowtrack.in',
            password: 'AnotherPassword123!',
            phone: '+919876543212',
          })
        ).rejects.toThrow(ConflictException);
      });

      it('rejects duplicate registration attempts with same phone number', async () => {
        await authService.register({
          fullName: 'User A',
          email: 'user_a@flowtrack.in',
          password: 'Password123!',
          phone: '+919876543219',
        });

        await expect(
          authService.register({
            fullName: 'User B',
            email: 'user_b@flowtrack.in',
            password: 'Password123!',
            phone: '+919876543219',
          })
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('2.2 Full-Name Validation & Sanitization', () => {
      it('rejects empty or whitespace-only name', async () => {
        await expect(
          authService.register({ fullName: '', email: 'empty@flowtrack.in', password: 'Password123!' })
        ).rejects.toThrow(BadRequestException);

        await expect(
          authService.register({ fullName: '   ', email: 'spaces@flowtrack.in', password: 'Password123!' })
        ).rejects.toThrow(BadRequestException);
      });

      it('accepts Unicode names, hyphens, and apostrophes', async () => {
        const unicodeNames = [
          'डॉ. राजेश कुमार',
          "Renée d'Aubigné",
          'Mary-Jane O’Connor',
          'Søren Kierkegaard',
          'François-Xavier Noël',
        ];

        for (let i = 0; i < unicodeNames.length; i++) {
          const res = await authService.register({
            fullName: unicodeNames[i],
            email: `unicode_${i}@flowtrack.in`,
            password: 'Password123!',
          });
          expect(res.user.fullName).toBe(unicodeNames[i]);
        }
      });

      it('trims leading and trailing whitespace from full name', async () => {
        const res = await authService.register({
          fullName: '   Dr. Arvind Kejriwal   ',
          email: 'arvind@flowtrack.in',
          password: 'Password123!',
        });
        expect(res.user.fullName).toBe('Dr. Arvind Kejriwal');
      });

      it('safely handles script tags and HTML-like input without crashing or execution', async () => {
        const scriptInput = '<script>alert("xss")</script>';
        const res = await authService.register({
          fullName: scriptInput,
          email: 'xss@flowtrack.in',
          password: 'Password123!',
        });
        expect(res.user.fullName).toBe(scriptInput);
      });
    });

    describe('2.3 Email Validation & Case Normalization', () => {
      it('normalizes uppercase email addresses to lowercase consistently', async () => {
        const res = await authService.register({
          fullName: 'Capital Email User',
          email: 'RAJESH.SHARMA@FLOWTRACK.IN',
          password: 'Password123!',
        });
        expect(res.user.email).toBe('rajesh.sharma@flowtrack.in');

        // Login with lowercase or uppercase must find the same normalized user
        const loginRes = await authService.login({
          email: 'rajesh.sharma@flowtrack.in',
          password: 'Password123!',
        });
        expect(loginRes.user.email).toBe('rajesh.sharma@flowtrack.in');
      });

      it('rejects duplicate email submitted with different casing', async () => {
        await authService.register({
          fullName: 'Case User 1',
          email: 'ananya@flowtrack.in',
          password: 'Password123!',
        });

        await expect(
          authService.register({
            fullName: 'Case User 2',
            email: 'ANANYA@FLOWTRACK.IN',
            password: 'Password123!',
          })
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('2.4 Indian Mobile Number Validation (+91 Format)', () => {
      it('accepts valid 10-digit Indian numbers starting with 6, 7, 8, 9 with +91', async () => {
        const validNumbers = [
          '+919876543210',
          '+918765432109',
          '+917654321098',
          '+916543210987',
        ];

        for (let i = 0; i < validNumbers.length; i++) {
          const res = await authService.register({
            fullName: `Phone User ${i}`,
            email: `phone_${i}@flowtrack.in`,
            password: 'Password123!',
            phone: validNumbers[i],
          });
          expect(res.user.phone).toBe(validNumbers[i]);
        }
      });

      it('rejects invalid Indian phone numbers (wrong digits, wrong prefix, letters)', async () => {
        const invalidPhones = [
          '9876543210', // Missing +91
          '+915876543210', // Starts with 5 (invalid Indian mobile)
          '+91987654321', // 9 digits (too short)
          '+9198765432100', // 11 digits (too long)
          '+9198765abcde', // Contains letters
          '+91 98765 43210', // Contains internal whitespace
          '+91+919876543210', // Double prefix
          '+19876543210', // Foreign USA country code
        ];

        for (const phone of invalidPhones) {
          await expect(
            authService.register({
              fullName: 'Bad Phone',
              email: `bad_${Math.random()}@flowtrack.in`,
              password: 'Password123!',
              phone,
            })
          ).rejects.toThrow(BadRequestException);
        }
      });
    });

    describe('2.5 Password Validation & Minimum Length', () => {
      it('rejects passwords below 8 characters', async () => {
        const weakPasswords = ['', '123', 'short', 'seven7_'];
        for (const pwd of weakPasswords) {
          await expect(
            authService.register({
              fullName: 'Weak Pwd',
              email: `pwd_${Math.random()}@flowtrack.in`,
              password: pwd,
            })
          ).rejects.toThrow(BadRequestException);
        }
      });

      it('accepts valid passwords at exactly 8 characters with special symbols', async () => {
        const res = await authService.register({
          fullName: 'Exact 8 User',
          email: 'exact8@flowtrack.in',
          password: 'P@ssw0rd',
        });
        expect(res.user.email).toBe('exact8@flowtrack.in');
      });
    });

    describe('2.6 Public Role Elevation Defense (Anti-Admin Exploitation)', () => {
      it('strictly denies public registration from claiming Platform Admin role', async () => {
        await expect(
          authService.register({
            fullName: 'Malicious Attacker',
            email: 'attacker@darknet.org',
            password: 'Password123!',
            requestedRole: 'ADMIN' as any,
          })
        ).rejects.toThrow(/Public signup cannot grant Platform Admin role/i);
      });

      it('strictly denies public registration with mass-assignment role injection', async () => {
        await expect(
          authService.register({
            fullName: 'Mass Assign Attacker',
            email: 'massassign@darknet.org',
            password: 'Password123!',
            role: 'ADMIN',
          } as any)
        ).rejects.toThrow(/Public signup cannot grant Platform Admin role/i);
      });

      it('safely assigns MEMBER when no elevated role is requested', async () => {
        const res = await authService.register({
          fullName: 'Standard Citizen',
          email: 'citizen@flowtrack.in',
          password: 'Password123!',
        });
        expect(res.role).toBe(Role.MEMBER);
      });
    });
  });

  // =========================================================================
  // PHASE 3 — LOGIN AND SESSION SECURITY TESTS
  // =========================================================================
  describe('PHASE 3 — Login & Session Security Tests', () => {
    beforeEach(async () => {
      // Seed a standard active user
      const passwordHash = await bcrypt.hash('SecretPass123!', 10);
      const user = {
        id: 'u-active-1',
        email: 'active.user@flowtrack.in',
        passwordHash,
        fullName: 'Active User',
        phone: '+919988776655',
        isActive: true,
      };
      db.users.set(user.id, user);

      // Seed a deactivated user
      const deactivated = {
        id: 'u-deactivated-1',
        email: 'deactivated.user@flowtrack.in',
        passwordHash,
        fullName: 'Deactivated User',
        isActive: false,
      };
      db.users.set(deactivated.id, deactivated);
    });

    it('successfully logs in with valid credentials and returns safe user data', async () => {
      const res = await authService.login({
        email: 'active.user@flowtrack.in',
        password: 'SecretPass123!',
      });

      expect(res.accessToken).toBeDefined();
      expect(res.user.email).toBe('active.user@flowtrack.in');
      expect(res.user.fullName).toBe('Active User');
      // Password hash must NOT be leaked
      expect((res.user as any).passwordHash).toBeUndefined();
    });

    it('rejects incorrect password with generic UnauthorizedException', async () => {
      await expect(
        authService.login({
          email: 'active.user@flowtrack.in',
          password: 'WrongPassword!',
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects nonexistent user email with generic UnauthorizedException', async () => {
      await expect(
        authService.login({
          email: 'ghost@flowtrack.in',
          password: 'SomePassword123!',
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects deactivated account with descriptive account-disabled message', async () => {
      await expect(
        authService.login({
          email: 'deactivated.user@flowtrack.in',
          password: 'SecretPass123!',
        })
      ).rejects.toThrow(/Account is deactivated/i);
    });

    describe('3.2 JWT Session Validation & Tamper Protection', () => {
      it('validates authentic JWT session and strips password hash in request context', async () => {
        const payload = { sub: 'u-active-1', email: 'active.user@flowtrack.in' };
        const validContext = await jwtStrategy.validate(payload);

        expect(validContext.id).toBe('u-active-1');
        expect(validContext.email).toBe('active.user@flowtrack.in');
        expect((validContext as any).passwordHash).toBeUndefined();
      });

      it('rejects JWT session for deactivated user upon subsequent requests', async () => {
        const payload = { sub: 'u-deactivated-1', email: 'deactivated.user@flowtrack.in' };
        await expect(jwtStrategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      });

      it('rejects tampered or forged JWT tokens with invalid signatures', () => {
        const attackerJwt = new JwtService({ secret: 'wrong-attacker-secret-key-123' });
        const forgedToken = attackerJwt.sign({ sub: 'u-active-1', role: 'ADMIN' });

        const localJwt = new JwtService({ secret: JWT_SECRET });
        expect(() => {
          localJwt.verify(forgedToken);
        }).toThrow();
      });

      it('rejects expired JWT session tokens', () => {
        const localJwt = new JwtService({ secret: JWT_SECRET });
        const expiredToken = localJwt.sign(
          { sub: 'u-active-1', email: 'active.user@flowtrack.in' },
          { expiresIn: '0s' }
        );

        expect(() => {
          localJwt.verify(expiredToken);
        }).toThrow();
      });
    });

    describe('3.3 RBAC Roles Guard Hardening', () => {
      it('grants access when user holds required role in workspace', () => {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN, Role.MANAGER]);

        const mockContext: any = {
          getHandler: () => {},
          getClass: () => {},
          switchToHttp: () => ({
            getRequest: () => ({
              headers: { 'x-workspace-id': 'ws-1' },
              user: {
                id: 'u-mgr',
                memberships: [{ workspaceId: 'ws-1', role: Role.MANAGER }],
              },
            }),
          }),
        };

        const allowed = rolesGuard.canActivate(mockContext);
        expect(allowed).toBe(true);
      });

      it('denies access when user holds insufficient role', () => {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

        const mockContext: any = {
          getHandler: () => {},
          getClass: () => {},
          switchToHttp: () => ({
            getRequest: () => ({
              headers: { 'x-workspace-id': 'ws-1' },
              user: {
                id: 'u-member',
                memberships: [{ workspaceId: 'ws-1', role: Role.MEMBER }],
              },
            }),
          }),
        };

        expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
      });

      it('denies access when user is not a member of the requested workspace', () => {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.MANAGER]);

        const mockContext: any = {
          getHandler: () => {},
          getClass: () => {},
          switchToHttp: () => ({
            getRequest: () => ({
              headers: { 'x-workspace-id': 'foreign-ws-99' },
              user: {
                id: 'u-member',
                memberships: [{ workspaceId: 'ws-1', role: Role.MANAGER }],
              },
            }),
          }),
        };

        expect(() => rolesGuard.canActivate(mockContext)).toThrow(/not a member of the requested workspace/i);
      });
    });
  });

  // =========================================================================
  // PHASE 4 — EMAIL & PHONE VERIFICATION TESTS
  // =========================================================================
  describe('PHASE 4 — Verification Services & OTP Lifecycle', () => {
    it('dispatches development OTP and records delivery simulation', async () => {
      const res = await authService.requestOtp({ phone: '+919876543210' });
      expect(res.message).toContain('OTP sent successfully');
      expect(res.phone).toBe('+919876543210');
    });

    it('verifies correct OTP and registers new user with standard MEMBER role', async () => {
      await authService.requestOtp({ phone: '+919876543210' });

      const verifyRes = await authService.verifyOtp({
        phone: '+919876543210',
        otp: '123456',
      });

      expect(verifyRes.user.phone).toBe('+919876543210');
      expect(verifyRes.accessToken).toBeDefined();

      // Check role assigned is strictly non-elevated MEMBER
      const createdMembership = Array.from(db.memberships.values()).find(
        (m) => m.userId === verifyRes.user.id
      );
      expect(createdMembership?.role).toBe(Role.MEMBER);
    });

    it('rejects incorrect OTP (400 Bad Request)', async () => {
      await authService.requestOtp({ phone: '+919876543210' });

      await expect(
        authService.verifyOtp({ phone: '+919876543210', otp: '000000' })
      ).rejects.toThrow(/Invalid OTP/i);
    });

    it('marks real external SMTP / SMS carrier delivery as NOT RUN when unconfigured', () => {
      const hasSmtpConfigured = Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY);
      const hasSmsCarrierConfigured = Boolean(process.env.TWILIO_AUTH_TOKEN || process.env.MSG91_AUTH_KEY);

      expect(hasSmtpConfigured).toBe(false);
      expect(hasSmsCarrierConfigured).toBe(false);
    });
  });

  // =========================================================================
  // PHASE 5 — FORGOT PASSWORD & RESET PASSWORD TESTS
  // =========================================================================
  describe('PHASE 5 — Password Recovery & Single-Use Token Invalidation', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash('InitialPass123!', 10);
      const user = {
        id: 'u-recov-target',
        email: 'target.recovery@flowtrack.in',
        passwordHash,
        fullName: 'Target Recovery User',
        isActive: true,
      };
      db.users.set(user.id, user);
    });

    it('dispatches password recovery token for registered user', async () => {
      const res = await authService.forgotPassword({ email: 'target.recovery@flowtrack.in' });
      expect(res.message).toContain('password recovery instructions have been dispatched');
      expect(res.resetToken).toBeDefined();
    });

    it('returns uniform message for unregistered email to prevent account enumeration', async () => {
      const res = await authService.forgotPassword({ email: 'nonexistent@flowtrack.in' });
      // Enumeration defense: returns same friendly dispatch message
      expect(res.message).toContain('password recovery instructions have been dispatched');
    });

    it('successfully resets password with valid token and enables login with new credentials', async () => {
      // Step 1: Request token
      const forgotRes = await authService.forgotPassword({ email: 'target.recovery@flowtrack.in' });
      const resetToken = forgotRes.resetToken!;

      // Step 2: Reset password
      const resetRes = await authService.resetPassword({
        email: 'target.recovery@flowtrack.in',
        token: resetToken,
        newPassword: 'BrandNewSecurePassword123!',
      });
      expect(resetRes.message).toContain('successfully updated');

      // Step 3: Old password must now fail
      await expect(
        authService.login({
          email: 'target.recovery@flowtrack.in',
          password: 'InitialPass123!',
        })
      ).rejects.toThrow(UnauthorizedException);

      // Step 4: New password must now succeed
      const newLoginRes = await authService.login({
        email: 'target.recovery@flowtrack.in',
        password: 'BrandNewSecurePassword123!',
      });
      expect(newLoginRes.user.email).toBe('target.recovery@flowtrack.in');
    });

    it('rejects password reset with invalid or corrupted token', async () => {
      await expect(
        authService.resetPassword({
          email: 'target.recovery@flowtrack.in',
          token: 'invalid-fake-token-12345',
          newPassword: 'BrandNewSecurePassword123!',
        })
      ).rejects.toThrow(/Invalid or expired password reset token/i);
    });

    it('strictly prevents token replay attacks (token invalidation after first use)', async () => {
      const forgotRes = await authService.forgotPassword({ email: 'target.recovery@flowtrack.in' });
      const resetToken = forgotRes.resetToken!;

      // First use: succeeds
      await authService.resetPassword({
        email: 'target.recovery@flowtrack.in',
        token: resetToken,
        newPassword: 'FirstUpdatedPassword123!',
      });

      // Second use (replay attack): rejected
      await expect(
        authService.resetPassword({
          email: 'target.recovery@flowtrack.in',
          token: resetToken,
          newPassword: 'ReplayHackerPassword123!',
        })
      ).rejects.toThrow(/Invalid or expired password reset token/i);
    });

    it('enforces password policy during reset (< 8 characters rejected)', async () => {
      const forgotRes = await authService.forgotPassword({ email: 'target.recovery@flowtrack.in' });
      const resetToken = forgotRes.resetToken!;

      await expect(
        authService.resetPassword({
          email: 'target.recovery@flowtrack.in',
          token: resetToken,
          newPassword: 'short',
        })
      ).rejects.toThrow(/Password must be at least 8 characters/i);
    });
  });
});
