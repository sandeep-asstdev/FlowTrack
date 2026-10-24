import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RolesGuard } from './roles.guard';
import { Role } from '@prisma/client';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('RolesGuard - Role-Based Access Control & Workspace Permissions', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (user: any, headerWorkspaceId?: string): ExecutionContext => {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          headers: {
            ...(headerWorkspaceId ? { 'x-workspace-id': headerWorkspaceId } : {}),
          },
        }),
      }),
    } as any;
  };

  it('allows access when no roles are required on the endpoint', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({ id: 'user-1' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when user is ADMIN in the requested workspace', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN, Role.MANAGER]);

    const context = createMockContext(
      {
        id: 'user-admin',
        memberships: [
          { workspaceId: 'ws-1', role: Role.ADMIN },
          { workspaceId: 'ws-2', role: Role.MEMBER },
        ],
      },
      'ws-1'
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when user is MANAGER in the requested workspace', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN, Role.MANAGER]);

    const context = createMockContext(
      {
        id: 'user-mgr',
        memberships: [{ workspaceId: 'ws-1', role: Role.MANAGER }],
      },
      'ws-1'
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when user is only MEMBER in the workspace', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN, Role.MANAGER]);

    const context = createMockContext(
      {
        id: 'user-member',
        memberships: [{ workspaceId: 'ws-1', role: Role.MEMBER }],
      },
      'ws-1'
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user is not a member of the requested workspace', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN, Role.MANAGER]);

    const context = createMockContext(
      {
        id: 'user-foreign',
        memberships: [{ workspaceId: 'ws-other', role: Role.ADMIN }],
      },
      'ws-unauthorized'
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
