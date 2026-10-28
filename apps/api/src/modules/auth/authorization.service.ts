import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GRANULAR_PERMISSIONS,
  GranularPermission,
  CONFIDENTIALITY_LEVELS,
  ConfidentialityLevel,
  CONFIDENTIALITY_RANK,
  isConfidentialityStricterOrEqual,
  ROLE_SCOPES,
  RoleScope,
} from '@flowtrack/shared';

export interface AuthenticatedUserContext {
  id: string;
  workspaceId: string;
  role?: string;
  email?: string;
}

export interface ResourceContext {
  type?: 'project' | 'task' | 'department' | 'team' | 'organization' | string;
  id?: string;
  workspaceId?: string;
  projectId?: string;
  departmentId?: string;
  teamId?: string;
  ownerId?: string | null;
  responsibleManagerId?: string | null;
  responsibleLeadId?: string | null;
  assigneeId?: string | null;
  classification?: ConfidentialityLevel | string;
  accessPolicy?: Record<string, any>;
  project?: any;
  node?: any;
  [key: string]: any;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
  statusCode: 200 | 401 | 403 | 404;
}

@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Central Authoritative Entrypoint: can(user, permission, resource)
   *
   * Enforces:
   * 1. Multi-tenant boundary: user.workspaceId must match resource.workspaceId.
   * 2. Deny-by-default: unauthorized if no explicit permission or grant matches.
   * 3. Technical Administrators are NOT automatically business-content authorized.
   * 4. Most-restrictive confidentiality wins. Confidentiality hides existence with 404.
   * 5. Scoped roles (Organization -> Department -> Team -> Project -> Task).
   */
  async can(
    user: AuthenticatedUserContext,
    permission: GranularPermission,
    resource?: ResourceContext
  ): Promise<boolean> {
    const decision = await this.evaluate(user, permission, resource);
    return decision.allowed;
  }

  private extractResourceMetadata(resource?: ResourceContext) {
    if (!resource) return {};
    const targetProject = resource.project || (resource.type === 'project' ? resource : undefined);
    const targetNode = resource.node || (resource.type === 'node' ? resource : undefined);
    const id = resource.id || targetProject?.id || targetNode?.id;
    const projectId = targetProject?.id || targetNode?.projectId || resource.projectId;
    const departmentId = targetProject?.departmentId || resource.departmentId;
    const teamId = targetNode?.teamId || resource.teamId;
    const ownerId = resource.ownerId || targetProject?.ownerId || targetNode?.ownerId;
    const responsibleManagerId = resource.responsibleManagerId || targetProject?.responsibleManagerId;
    const responsibleLeadId = resource.responsibleLeadId || targetNode?.responsibleLeadId;
    const assigneeId = resource.assigneeId || targetNode?.ownerId;
    const classification = (resource.classification || targetProject?.classification || targetNode?.classification || CONFIDENTIALITY_LEVELS.INTERNAL) as ConfidentialityLevel;
    const workspaceId = resource.workspaceId || targetProject?.workspaceId || targetNode?.workspaceId;

    return {
      id,
      projectId,
      departmentId,
      teamId,
      ownerId,
      responsibleManagerId,
      responsibleLeadId,
      assigneeId,
      classification,
      workspaceId,
    };
  }

  /**
   * Evaluates permission and returns structured decision with accurate status code.
   * If confidentiality access fails on an existing resource, yields 404 (hide existence).
   */
  async evaluate(
    user: AuthenticatedUserContext,
    permission: GranularPermission,
    resource?: ResourceContext
  ): Promise<AuthorizationDecision> {
    if (!user || !user.id || !user.workspaceId) {
      return { allowed: false, statusCode: 401, reason: 'Unauthenticated' };
    }

    const meta = this.extractResourceMetadata(resource);

    // 1. Tenant boundary enforcement
    if (meta.workspaceId && meta.workspaceId !== user.workspaceId) {
      // Cross-organization boundary: return 404 to avoid leaking existence across tenants
      return { allowed: false, statusCode: 404, reason: 'Resource not found in tenant' };
    }

    // 2. Resolve user's effective roles and direct permissions across scopes
    const { effectiveRoles, directPermissions } = await this.resolveEffectiveRolesAndPerms(user, meta);

    // 3. Technical Admin Content Separation:
    // Technical Admin alone does NOT grant access to confidential business content
    const isTechnicalAdmin = effectiveRoles.includes('ADMIN');

    // 4. Confidentiality Evaluation
    const classification = meta.classification || CONFIDENTIALITY_LEVELS.INTERNAL;
    const isHighConfidentiality =
      classification === CONFIDENTIALITY_LEVELS.RESTRICTED ||
      classification === CONFIDENTIALITY_LEVELS.CONFIDENTIAL ||
      classification === CONFIDENTIALITY_LEVELS.HIGHLY_CONFIDENTIAL;

    if (isHighConfidentiality && meta.id) {
      const hasDirectAccessGrant = await this.hasValidAccessGrant(user, meta.id);
      const isDirectOwnerOrManager =
        user.id === meta.ownerId ||
        user.id === meta.responsibleManagerId ||
        user.id === meta.responsibleLeadId ||
        user.id === meta.assigneeId;

      if (!hasDirectAccessGrant && !isDirectOwnerOrManager) {
        // High confidentiality: user has neither explicit access grant nor ownership
        // Strictly return 404 to prevent revealing that the confidential initiative exists!
        return {
          allowed: false,
          statusCode: 404,
          reason: 'Project not found or unauthorized under confidentiality classification',
        };
      }
    }

    // 5. Evaluate Direct Granted Permissions
    if (directPermissions.has(permission)) {
      return { allowed: true, statusCode: 200 };
    }

    // 6. Evaluate Permission by Role
    const hasRolePerm = this.checkRolePermissions(effectiveRoles, permission, resource, user.id);
    if (hasRolePerm) {
      return { allowed: true, statusCode: 200 };
    }

    // 7. Explicit Access Grant for Edit/View
    if (meta.id && (permission === GRANULAR_PERMISSIONS.PROJECT_VIEW || permission === GRANULAR_PERMISSIONS.PROJECT_EDIT)) {
      const grant = await this.hasValidAccessGrant(user, meta.id);
      if (grant) {
        if (permission === GRANULAR_PERMISSIONS.PROJECT_VIEW) {
          return { allowed: true, statusCode: 200 };
        }
        if (permission === GRANULAR_PERMISSIONS.PROJECT_EDIT && grant.accessLevel === 'edit') {
          return { allowed: true, statusCode: 200 };
        }
      }
    }

    // Deny by default
    return {
      allowed: false,
      statusCode: isHighConfidentiality ? 404 : 403,
      reason: `Unauthorized: User lacks required permission ${permission}`,
    };
  }

  /**
   * Asserts permission, throwing NotFoundException (for confidential hiding) or ForbiddenException.
   */
  async enforce(
    user: AuthenticatedUserContext,
    permission: GranularPermission,
    resource?: ResourceContext
  ): Promise<void> {
    const decision = await this.evaluate(user, permission, resource);
    if (!decision.allowed) {
      if (decision.statusCode === 404) {
        throw new NotFoundException(decision.reason || 'Resource not found');
      }
      throw new ForbiddenException(decision.reason || 'Forbidden');
    }
  }

  /**
   * Resolves all applicable roles and direct permissions for this user in the current resource context.
   */
  async resolveEffectiveRolesAndPerms(
    user: AuthenticatedUserContext,
    meta: ReturnType<typeof this.extractResourceMetadata>
  ): Promise<{ effectiveRoles: string[]; directPermissions: Set<string> }> {
    const roles: Set<string> = new Set();
    const directPermissions: Set<string> = new Set();

    // 1. Organization / Workspace membership baseline
    if (user.role) {
      roles.add(user.role.toUpperCase());
    } else if (this.prisma.membership) {
      const m = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: user.workspaceId, userId: user.id } },
      });
      if (m?.role) {
        roles.add(m.role.toUpperCase());
      }
    }

    // 2. Direct resource ownership roles
    if (meta.ownerId && meta.ownerId === user.id) roles.add('PROJECT_OWNER');
    if (meta.responsibleManagerId && meta.responsibleManagerId === user.id) roles.add('RESPONSIBLE_MANAGER');
    if (meta.responsibleLeadId && meta.responsibleLeadId === user.id) roles.add('RESPONSIBLE_LEAD');
    if (meta.assigneeId && meta.assigneeId === user.id) roles.add('ASSIGNEE');

    // 3. Query ScopedRoleAssignment table
    try {
      const scopedAssignments = await (this.prisma as any).scopedRoleAssignment?.findMany({
        where: {
          workspaceId: user.workspaceId,
          userId: user.id,
        },
      });

      if (Array.isArray(scopedAssignments)) {
        for (const sa of scopedAssignments) {
          const scope = (sa.roleScope || sa.scope || '').toLowerCase();
          const scopeId = sa.scopeId || sa.resourceId;
          const roleName = (sa.roleName || sa.role || '').toUpperCase();

          let applies = false;
          if (scope === 'organization' || scope === ROLE_SCOPES.ORGANIZATION) {
            applies = true;
          } else if (scope === 'project' || scope === ROLE_SCOPES.PROJECT) {
            applies = scopeId === meta.projectId;
          } else if (scope === 'department' || scope === ROLE_SCOPES.DEPARTMENT) {
            applies = scopeId === meta.departmentId;
          } else if (scope === 'team' || scope === ROLE_SCOPES.TEAM) {
            applies = scopeId === meta.teamId;
          } else if (scope === 'task' || scope === ROLE_SCOPES.TASK) {
            applies = scopeId === meta.id;
          }

          if (applies) {
            if (roleName) roles.add(roleName);
            if (roleName === 'PROJECTMANAGER') roles.add('PROJECT_MANAGER');
            if (roleName === 'DEPARTMENTHEAD') roles.add('MANAGER');

            if (Array.isArray(sa.permissions)) {
              for (const p of sa.permissions) {
                directPermissions.add(p);
              }
            }
          }
        }
      }
    } catch {
      // Fallback if table not queried in mock tests
    }

    return { effectiveRoles: Array.from(roles), directPermissions };
  }

  async resolveEffectiveRoles(
    user: AuthenticatedUserContext,
    resource?: ResourceContext
  ): Promise<string[]> {
    const meta = this.extractResourceMetadata(resource);
    const { effectiveRoles } = await this.resolveEffectiveRolesAndPerms(user, meta);
    return effectiveRoles;
  }

  /**
   * Checks whether the user has a valid unexpired, unrevoked AccessGrant for the given resource.
   */
  async hasValidAccessGrant(
    user: AuthenticatedUserContext,
    resourceIdOrContext: string | ResourceContext
  ): Promise<{ accessLevel: string } | null> {
    const resourceId =
      typeof resourceIdOrContext === 'string'
        ? resourceIdOrContext
        : this.extractResourceMetadata(resourceIdOrContext).id;

    if (!resourceId) return null;

    try {
      const now = new Date();
      const grants = await (this.prisma as any).accessGrant?.findMany({
        where: {
          workspaceId: user.workspaceId,
          resourceId: resourceId,
          OR: [
            { userId: user.id },
            { granteeId: user.id },
          ],
        },
      });

      if (!Array.isArray(grants) || grants.length === 0) return null;

      const activeGrant = grants.find((g: any) => {
        if (g.isRevoked) return false;
        if (g.revokedAt) return false;
        if (g.expiresAt && new Date(g.expiresAt) <= now) return false;
        if (g.validUntil && new Date(g.validUntil) <= now) return false;
        return true;
      });

      return activeGrant ? { accessLevel: activeGrant.accessLevel || 'view' } : null;
    } catch {
      return null;
    }
  }

  /**
   * Core permission lookup table per role.
   */
  private checkRolePermissions(
    roles: string[],
    permission: GranularPermission,
    resource?: ResourceContext,
    userId?: string
  ): boolean {
    for (const role of roles) {
      switch (role) {
        case 'ADMIN':
          // Technical administrator permissions
          if (
            [
              GRANULAR_PERMISSIONS.PROJECT_CREATE,
              GRANULAR_PERMISSIONS.PROJECT_ARCHIVE,
              GRANULAR_PERMISSIONS.PROJECT_RESTORE,
              GRANULAR_PERMISSIONS.PROJECT_DELETE,
              GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
              GRANULAR_PERMISSIONS.PERMISSIONS_GRANT,
              GRANULAR_PERMISSIONS.AUDIT_VIEW,
            ].includes(permission as any)
          ) {
            return true;
          }
          // Note: ADMIN does NOT automatically get business content view/edit on confidential resources!
          if (
            (!resource?.classification || resource.classification === CONFIDENTIALITY_LEVELS.PUBLIC_INTERNAL) &&
            [GRANULAR_PERMISSIONS.PROJECT_VIEW, GRANULAR_PERMISSIONS.TASK_CREATE].includes(permission as any)
          ) {
            return true;
          }
          break;

        case 'MANAGER':
        case 'PROJECT_MANAGER':
        case 'RESPONSIBLE_MANAGER':
          // Managers have full project and task management
          if (
            [
              GRANULAR_PERMISSIONS.PROJECT_CREATE,
              GRANULAR_PERMISSIONS.PROJECT_VIEW,
              GRANULAR_PERMISSIONS.PROJECT_EDIT,
              GRANULAR_PERMISSIONS.PROJECT_ARCHIVE,
              GRANULAR_PERMISSIONS.TASK_CREATE,
              GRANULAR_PERMISSIONS.TASK_ASSIGN,
              GRANULAR_PERMISSIONS.TASK_UPDATE,
              GRANULAR_PERMISSIONS.WORK_SUBMIT,
              GRANULAR_PERMISSIONS.REVIEW_PERFORM,
              GRANULAR_PERMISSIONS.APPROVE_TASK,
              GRANULAR_PERMISSIONS.APPROVE_PRIVILEGED,
              GRANULAR_PERMISSIONS.CONFIDENTIALITY_CHANGE,
              GRANULAR_PERMISSIONS.AUDIT_VIEW,
            ].includes(permission as any)
          ) {
            // Cannot approve own work
            if (permission === GRANULAR_PERMISSIONS.APPROVE_TASK && resource?.assigneeId === userId) {
              return false;
            }
            return true;
          }
          break;

        case 'PROJECT_OWNER':
          // Project owner: governance over project metadata, but NOT auto-approver for tasks
          if (
            [
              GRANULAR_PERMISSIONS.PROJECT_VIEW,
              GRANULAR_PERMISSIONS.PROJECT_EDIT,
              GRANULAR_PERMISSIONS.PROJECT_ARCHIVE,
              GRANULAR_PERMISSIONS.TASK_CREATE,
              GRANULAR_PERMISSIONS.TASK_ASSIGN,
              GRANULAR_PERMISSIONS.TASK_UPDATE,
              GRANULAR_PERMISSIONS.WORK_SUBMIT,
              GRANULAR_PERMISSIONS.AUDIT_VIEW,
            ].includes(permission as any)
          ) {
            return true;
          }
          break;

        case 'TEAM_LEAD':
        case 'RESPONSIBLE_LEAD':
          if (
            [
              GRANULAR_PERMISSIONS.PROJECT_VIEW,
              GRANULAR_PERMISSIONS.TASK_CREATE,
              GRANULAR_PERMISSIONS.TASK_ASSIGN,
              GRANULAR_PERMISSIONS.TASK_UPDATE,
              GRANULAR_PERMISSIONS.WORK_SUBMIT,
              GRANULAR_PERMISSIONS.REVIEW_PERFORM,
              GRANULAR_PERMISSIONS.APPROVE_TASK,
            ].includes(permission as any)
          ) {
            if (permission === GRANULAR_PERMISSIONS.APPROVE_TASK && resource?.assigneeId === userId) {
              return false;
            }
            return true;
          }
          break;

        case 'MEMBER':
        case 'ASSIGNEE':
          if (
            [
              GRANULAR_PERMISSIONS.PROJECT_VIEW,
              GRANULAR_PERMISSIONS.TASK_UPDATE,
              GRANULAR_PERMISSIONS.WORK_SUBMIT,
            ].includes(permission as any)
          ) {
            return true;
          }
          break;

        case 'GUEST':
          if (permission === GRANULAR_PERMISSIONS.PROJECT_VIEW) {
            return true;
          }
          break;
      }
    }

    return false;
  }

  /**
   * Generates a Prisma WHERE visibility filter for projects to hide confidential items (404 policy).
   */
  getProjectVisibilityFilter(user: AuthenticatedUserContext): Record<string, any> {
    const isDirectMatch = {
      workspaceId: user.workspaceId,
      deletedAt: null,
      OR: [
        { classification: CONFIDENTIALITY_LEVELS.PUBLIC_INTERNAL },
        { classification: CONFIDENTIALITY_LEVELS.INTERNAL },
        { ownerId: user.id },
        { responsibleManagerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    };

    return isDirectMatch;
  }

  /**
   * Designated backup approver delegation check.
   */
  async canActAsBackupApprover(
    primaryReviewerId: string,
    backupUserId: string,
    workspaceId?: string
  ): Promise<boolean> {
    let user: any = null;
    if (this.prisma.user?.findUnique) {
      user = await this.prisma.user.findUnique({
        where: { id: primaryReviewerId },
        select: { backupReviewerId: true },
      });
    } else if (this.prisma.user?.findFirst) {
      user = await this.prisma.user.findFirst({
        where: { id: primaryReviewerId, deletedAt: null },
        select: { backupReviewerId: true },
      });
    }

    return Boolean(user && user.backupReviewerId === backupUserId);
  }

  /**
   * Personnel Departure & Reassignment Engine:
   * Transfers all active task assignments, project manager responsibilities, and positions from departing user.
   */
  async reassignUserWork(
    workspaceId: string,
    fromUserId: string,
    toUserId: string,
    actorId?: string
  ): Promise<{ reassignedTasks: number; reassignedReviews: number; reassignedProjects: number }> {
    // 1. Reassign Project Management
    const projectsUpdated = await this.prisma.project.updateMany({
      where: { workspaceId, responsibleManagerId: fromUserId },
      data: { responsibleManagerId: toUserId },
    });

    // 2. Reassign Task Ownership
    const nodesUpdated = await this.prisma.node.updateMany({
      where: { workspaceId, ownerId: fromUserId, deletedAt: null },
      data: { ownerId: toUserId, assignedById: actorId || null, assignedAt: new Date() },
    });

    // 3. Reassign Task Reviewer Responsibilities
    const reviewsUpdated = await this.prisma.node.updateMany({
      where: { workspaceId, reviewerId: fromUserId, deletedAt: null },
      data: { reviewerId: toUserId },
    });

    this.logger.log(
      `Reassigned work from user ${fromUserId} to ${toUserId}: ${nodesUpdated?.count || 0} tasks, ${reviewsUpdated?.count || 0} reviews, ${projectsUpdated?.count || 0} projects.`
    );

    return {
      reassignedTasks: nodesUpdated?.count || 0,
      reassignedReviews: reviewsUpdated?.count || 0,
      reassignedProjects: projectsUpdated?.count || 0,
    };
  }
}
