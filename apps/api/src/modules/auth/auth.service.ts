import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import {
  RegisterDto,
  LoginDto,
  RequestOtpDto,
  VerifyOtpDto,
  GoogleAuthDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '@flowtrack/shared';
import { Role } from '@prisma/client';
import { GoogleAuthService } from './google-auth.service';

@Injectable()
export class AuthService {
  // Mock store for OTP in development
  private otpStore = new Map<string, string>();
  // Secure token store for password recovery
  private resetTokenStore = new Map<string, { token: string; expiresAt: number }>();
  private readonly googleAuthService: GoogleAuthService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    googleAuthService?: GoogleAuthService
  ) {
    this.googleAuthService = googleAuthService || new GoogleAuthService();
  }

  async register(dto: RegisterDto) {
    // 1. Strict security boundary: Public signup cannot grant Platform Admin role
    if ((dto as any).requestedRole === 'ADMIN' || (dto as any).role === 'ADMIN') {
      throw new BadRequestException(
        'Public signup cannot grant Platform Admin role. Platform Admin must be provisioned through an authorized administrative bootstrap.'
      );
    }

    // 2. Validate Indian phone format if provided (+91 followed by 10 digits starting with 6-9)
    if (dto.phone) {
      const cleanPhone = dto.phone.trim();
      const indianPhoneRegex = /^\+91[6-9]\d{9}$/;
      if (!indianPhoneRegex.test(cleanPhone)) {
        throw new BadRequestException(
          'Phone number must be a valid Indian mobile number (+91 prefix followed by exactly 10 digits starting with 6, 7, 8, or 9).'
        );
      }
    }

    if (!dto.fullName || dto.fullName.trim().length < 2) {
      throw new BadRequestException('Full name must be at least 2 characters');
    }

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email.toLowerCase().trim() },
          ...(dto.phone ? [{ phone: dto.phone.trim() }] : []),
        ],
      },
    });

    if (existing) {
      throw new ConflictException('User with this email or phone already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        phone: dto.phone ? dto.phone.trim() : null,
        fullName: dto.fullName.trim(),
        passwordHash,
        isActive: true,
      },
    });

    // 3. Role assignment: Manager or Team Lead if requested, otherwise standard non-elevated Member. Never ADMIN.
    let assignedRole: Role = Role.MEMBER;
    if (dto.requestedRole === 'MANAGER') {
      assignedRole = Role.MANAGER;
    } else if (dto.requestedRole === 'TEAM_LEAD') {
      assignedRole = Role.TEAM_LEAD;
    } else if (dto.requestedRole === 'MEMBER') {
      assignedRole = Role.MEMBER;
    }

    // Create a personal default workspace for new user
    const wsName = dto.workspaceName?.trim() || `${user.fullName}'s Workspace`;
    const baseSlug = wsName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30) || 'workspace';
    const slug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;

    const workspace = await this.prisma.workspace.create({
      data: {
        name: wsName,
        slug,
        memberships: {
          create: {
            userId: user.id,
            role: assignedRole, // Never ADMIN
          },
        },
      },
    });

    const token = this.generateToken(user.id, user.email, workspace.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
      },
      activeWorkspaceId: workspace.id,
      accessToken: token,
      role: assignedRole,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email ? dto.email.trim().toLowerCase() : String() },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('Account is deactivated. Please contact your platform administrator.');
    }

    let valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid && dto.password && dto.password.trim() !== dto.password) {
      valid = await bcrypt.compare(dto.password.trim(), user.passwordHash);
    }
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const defaultWorkspaceId = user.memberships[0]?.workspaceId;
    const token = this.generateToken(user.id, user.email, defaultWorkspaceId);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        isActive: user.isActive,
      },
      workspaces: user.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
      })),
      activeWorkspaceId: defaultWorkspaceId,
      accessToken: token,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    // Generate secure expiring token (15 minute validity)
    const resetToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = Date.now() + 15 * 60 * 1000;

    if (user && user.isActive && !user.deletedAt) {
      this.resetTokenStore.set(user.email, { token: resetToken, expiresAt });
    }

    // Report requirement: email provider (SendGrid / AWS SES) is required for production outbound email delivery
    return {
      message: 'If an account exists with this email, password recovery instructions have been dispatched.',
      deliveryStatus:
        process.env.NODE_ENV === 'production'
          ? 'Awaiting SMTP/Transactional Email Provider Configuration (e.g., SendGrid/AWS SES)'
          : 'Development mode: reset token generated',
      // In development / test environment, return reset token for verification
      ...(process.env.NODE_ENV !== 'production' ? { resetToken } : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = this.resetTokenStore.get(dto.email.toLowerCase().trim());
    if (!record || record.token !== dto.token || Date.now() > record.expiresAt) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('User account is invalid or deactivated.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Single-use token invalidation
    this.resetTokenStore.delete(dto.email.toLowerCase().trim());

    return {
      message: 'Password has been successfully updated. You may now log in with your new credentials.',
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    const mockOtp = '123456';
    this.otpStore.set(dto.phone, mockOtp);

    return {
      message: 'OTP sent successfully (Development mock OTP: 123456)',
      phone: dto.phone,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const validOtp = this.otpStore.get(dto.phone) || '123456';
    if (dto.otp !== validOtp) {
      throw new BadRequestException('Invalid OTP');
    }

    let user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (user && (user.deletedAt || !user.isActive)) {
      throw new UnauthorizedException('Account is deactivated. Please contact your platform administrator.');
    }

    if (!user) {
      // Create new user on the fly for phone OTP
      const email = `user_${dto.phone.replace(/[^0-9]/g, '')}@flowtrack.dev`;
      user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          email,
          fullName: `User ${dto.phone.slice(-4)}`,
        },
        include: {
          memberships: {
            include: {
              workspace: true,
            },
          },
        },
      });

      const slug = `phone-workspace-${Math.floor(Math.random() * 10000)}`;
      const ws = await this.prisma.workspace.create({
        data: {
          name: `${user.fullName}'s Workspace`,
          slug,
          memberships: {
            create: {
              userId: user.id,
              role: Role.MEMBER, // Standard non-elevated Member for OTP
            },
          },
        },
      });

      user.memberships = [
        {
          id: 'temp',
          workspaceId: ws.id,
          userId: user.id,
          role: Role.MEMBER,
          projectPermissions: {},
          createdAt: new Date(),
          workspace: ws,
        },
      ];
    }

    const defaultWorkspaceId = user.memberships[0]?.workspaceId;
    const token = this.generateToken(user.id, user.email, defaultWorkspaceId);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        isActive: user.isActive,
      },
      workspaces: user.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
      })),
      activeWorkspaceId: defaultWorkspaceId,
      accessToken: token,
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      isActive: user.isActive,
      workspaces: user.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
        logoUrl: m.workspace.logoUrl,
      })),
    };
  }

  /**
   * Secure "Continue with Google" handler supporting both Sign In and Sign Up.
   * - Verifies token signature, issuer, audience, expiry, and email status via GoogleAuthService.
   * - Matches existing user by googleId or email safely (avoids duplicate accounts).
   * - Preserves existing roles and permissions (never automatically elevates roles).
   * - If new user, creates user record with standard MEMBER role and personal workspace.
   */
  async loginWithGoogle(dto: GoogleAuthDto) {
    const rawToken = dto.idToken || dto.credential;
    if (!rawToken) {
      throw new BadRequestException('Google ID token is required');
    }

    const googleUser = await this.googleAuthService.verifyIdToken(rawToken);

    // 1. Check if user exists by either googleId or email
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { googleId: googleUser.sub },
          { email: googleUser.email },
        ],
      },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (user) {
      // 2. Reject deactivated or soft-deleted accounts
      if (user.deletedAt || !user.isActive) {
        throw new UnauthorizedException('Account is deactivated. Please contact your platform administrator.');
      }

      // 3. Link googleId or update avatar if newly signing in via Google with matching email
      const needsGoogleIdLink = !user.googleId;
      const needsAvatarUpdate = !user.avatarUrl && googleUser.picture;

      if (needsGoogleIdLink || needsAvatarUpdate) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            ...(needsGoogleIdLink ? { googleId: googleUser.sub } : {}),
            ...(needsAvatarUpdate ? { avatarUrl: googleUser.picture } : {}),
          },
          include: {
            memberships: {
              include: {
                workspace: true,
              },
            },
          },
        });
      }
    } else {
      // 4. New user: register via Google with standard non-elevated MEMBER role
      const fullName = googleUser.name || googleUser.email.split('@')[0];

      user = await this.prisma.user.create({
        data: {
          email: googleUser.email,
          fullName,
          avatarUrl: googleUser.picture || null,
          googleId: googleUser.sub,
          passwordHash: null,
          isActive: true,
        },
        include: {
          memberships: {
            include: {
              workspace: true,
            },
          },
        },
      });

      // Create user's initial default personal workspace with standard MEMBER role
      const baseSlug = fullName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .slice(0, 30);
      const slug = `${baseSlug}-workspace-${Math.floor(Math.random() * 10000)}`;

      const workspace = await this.prisma.workspace.create({
        data: {
          name: `${user.fullName}'s Workspace`,
          slug,
          memberships: {
            create: {
              userId: user.id,
              role: Role.MEMBER, // Never automatically grant elevated roles to Google users
            },
          },
        },
      });

      user.memberships = [
        {
          id: 'initial',
          workspaceId: workspace.id,
          userId: user.id,
          role: Role.MEMBER,
          projectPermissions: {},
          createdAt: new Date(),
          workspace,
        } as any,
      ];
    }

    const defaultWorkspaceId = user.memberships?.[0]?.workspaceId;
    const token = this.generateToken(user.id, user.email, defaultWorkspaceId);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        isActive: user.isActive,
        googleLinked: Boolean(user.googleId),
      },
      workspaces: (user.memberships || []).map((m) => ({
        id: m.workspace?.id || m.workspaceId,
        name: m.workspace?.name || 'Workspace',
        slug: m.workspace?.slug || '',
        role: m.role,
      })),
      activeWorkspaceId: defaultWorkspaceId,
      accessToken: token,
    };
  }

  /**
   * Link Google account to an authenticated user session
   */
  async linkGoogleAccount(userId: string, dto: GoogleAuthDto) {
    const rawToken = dto.idToken || dto.credential;
    if (!rawToken) {
      throw new BadRequestException('Google ID token is required');
    }

    const googleUser = await this.googleAuthService.verifyIdToken(rawToken);

    // Verify whether this googleId is already linked to another user account
    const existingGoogleUser = await this.prisma.user.findFirst({
      where: { googleId: googleUser.sub },
    });

    if (existingGoogleUser && existingGoogleUser.id !== userId) {
      throw new ConflictException('This Google account is already linked to another FlowTrack user.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleId: googleUser.sub,
        ...(googleUser.picture ? { avatarUrl: googleUser.picture } : {}),
      },
    });

    return {
      message: 'Google account linked successfully',
      googleId: updated.googleId,
    };
  }

  private generateToken(userId: string, email: string, activeWorkspaceId?: string) {
    return this.jwtService.sign({
      sub: userId,
      email,
      activeWorkspaceId,
    });
  }
}
