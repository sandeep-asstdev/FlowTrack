import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { RegisterDto, LoginDto, RequestOtpDto, VerifyOtpDto, GoogleAuthDto } from '@flowtrack/shared';
import { Role } from '@prisma/client';
import { GoogleAuthService } from './google-auth.service';

@Injectable()
export class AuthService {
  // Mock store for OTP in development
  private otpStore = new Map<string, string>();
  private readonly googleAuthService: GoogleAuthService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    googleAuthService?: GoogleAuthService
  ) {
    this.googleAuthService = googleAuthService || new GoogleAuthService();
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, ...(dto.phone ? [{ phone: dto.phone }] : [])],
      },
    });

    if (existing) {
      throw new ConflictException('User with this email or phone already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        fullName: dto.fullName,
        passwordHash,
      },
    });

    // Create a personal default workspace for new user
    const slug = dto.fullName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-workspace-' + Math.floor(Math.random() * 1000);
    const workspace = await this.prisma.workspace.create({
      data: {
        name: `${dto.fullName}'s Workspace`,
        slug,
        memberships: {
          create: {
            userId: user.id,
            role: Role.ADMIN,
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
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
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

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
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
              role: Role.ADMIN,
            },
          },
        },
      });

      user.memberships = [
        {
          id: 'temp',
          workspaceId: ws.id,
          userId: user.id,
          role: Role.ADMIN,
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
