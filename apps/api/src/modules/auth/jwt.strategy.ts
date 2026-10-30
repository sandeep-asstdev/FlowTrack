import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  activeWorkspaceId?: string;
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: any) => {
          let token = null;
          if (req && req.cookies && req.cookies['flowtrack_jwt']) {
            token = req.cookies['flowtrack_jwt'];
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'flowtrack-super-secret-jwt-key-2026-very-secure',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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

    // Invalidate session if tokenVersion does not match current user record
    if (
      payload.tokenVersion !== undefined &&
      user.tokenVersion !== undefined &&
      payload.tokenVersion !== user.tokenVersion
    ) {
      throw new UnauthorizedException('Session expired or invalidated. Please sign in again.');
    }

    const { passwordHash: _hash, ...safeUser } = user;

    return {
      ...safeUser,
      activeWorkspaceId: payload.activeWorkspaceId || user.memberships?.[0]?.workspaceId,
      workspaceId: payload.activeWorkspaceId || user.memberships?.[0]?.workspaceId,
    };
  }
}
