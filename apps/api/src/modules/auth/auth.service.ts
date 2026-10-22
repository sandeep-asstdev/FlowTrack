import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { RegisterDto, LoginDto, RequestOtpDto, VerifyOtpDto } from '@flowtrack/shared';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  // Mock store for OTP in development
  private otpStore = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

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

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      workspaces: user.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
        logoUrl: m.workspace.logoUrl,
      })),
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
