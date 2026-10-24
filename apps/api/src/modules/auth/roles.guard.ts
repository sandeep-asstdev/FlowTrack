import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      return false;
    }

    // Determine active workspace from header or activeWorkspaceId
    const workspaceId =
      request.headers['x-workspace-id'] ||
      user.activeWorkspaceId ||
      user.memberships?.[0]?.workspaceId;

    // Find membership in that workspace
    const membership = user.memberships?.find(
      (m: any) => m.workspaceId === workspaceId
    );

    if (!membership) {
      throw new ForbiddenException('User is not a member of the requested workspace');
    }

    const hasRole = requiredRoles.includes(membership.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Requires one of the following roles: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }
}
