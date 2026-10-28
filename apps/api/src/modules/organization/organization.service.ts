import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationService } from '../auth/authorization.service';
import {
  GRANULAR_PERMISSIONS,
  validateHierarchyCycle,
  ROLE_SCOPES,
} from '@flowtrack/shared';
import { RoleScopeType } from '@prisma/client';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthorizationService
  ) {}

  // ==========================================
  // DEPARTMENTS
  // ==========================================

  async listDepartments(workspaceId: string) {
    return this.prisma.department.findMany({
      where: { workspaceId },
      include: {
        manager: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        parentDepartment: { select: { id: true, name: true, code: true } },
        subDepartments: { select: { id: true, name: true, code: true } },
        _count: { select: { users: true, positions: true, projects: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createDepartment(
    workspaceId: string,
    actorId: string,
    dto: { name: string; code?: string; parentId?: string; leaderId?: string }
  ) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
      { workspaceId }
    );

    if (dto.parentId) {
      const existingDepts = await this.prisma.department.findMany({
        where: { workspaceId },
        select: { id: true, parentDepartmentId: true },
      });
      const cycleCheck = validateHierarchyCycle(
        existingDepts.map((d) => ({ id: d.id, parentId: d.parentDepartmentId })),
        'new-dept',
        dto.parentId
      );
      if (!cycleCheck.isValid) {
        throw new BadRequestException(cycleCheck.error);
      }
    }

    return this.prisma.department.create({
      data: {
        workspaceId,
        name: dto.name,
        code: dto.code || null,
        parentDepartmentId: dto.parentId || null,
        managerId: dto.leaderId || null,
      },
    });
  }

  async updateDepartment(
    workspaceId: string,
    departmentId: string,
    actorId: string,
    dto: { name?: string; code?: string; parentId?: string | null; leaderId?: string | null }
  ) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
      { workspaceId }
    );

    const existing = await this.prisma.department.findFirst({
      where: { id: departmentId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Department not found');
    }

    if (dto.parentId !== undefined && dto.parentId !== existing.parentDepartmentId) {
      if (dto.parentId) {
        const existingDepts = await this.prisma.department.findMany({
          where: { workspaceId },
          select: { id: true, parentDepartmentId: true },
        });
        const cycleCheck = validateHierarchyCycle(
          existingDepts.map((d) => ({ id: d.id, parentId: d.parentDepartmentId })),
          departmentId,
          dto.parentId
        );
        if (!cycleCheck.isValid) {
          throw new BadRequestException(cycleCheck.error);
        }
      }
    }

    return this.prisma.department.update({
      where: { id: departmentId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.parentId !== undefined && { parentDepartmentId: dto.parentId }),
        ...(dto.leaderId !== undefined && { managerId: dto.leaderId }),
      },
    });
  }

  async deleteDepartment(workspaceId: string, departmentId: string, actorId: string) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
      { workspaceId }
    );

    const dept = await this.prisma.department.findFirst({
      where: { id: departmentId, workspaceId },
    });
    if (!dept) {
      throw new NotFoundException('Department not found');
    }

    return this.prisma.department.delete({ where: { id: departmentId } });
  }

  // ==========================================
  // POSITIONS & REPORTING HIERARCHY
  // ==========================================

  async listPositions(workspaceId: string, departmentId?: string) {
    return this.prisma.position.findMany({
      where: {
        workspaceId,
        ...(departmentId && { departmentId }),
      },
      include: {
        department: { select: { id: true, name: true } },
        reportsTo: { select: { id: true, title: true } },
        subordinates: { select: { id: true, title: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { title: 'asc' },
    });
  }

  async createPosition(
    workspaceId: string,
    actorId: string,
    dto: { title: string; departmentId: string; reportsToPositionId?: string }
  ) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
      { workspaceId }
    );

    if (dto.reportsToPositionId) {
      const positions = await this.prisma.position.findMany({
        where: { workspaceId },
        select: { id: true, reportsToPositionId: true },
      });
      const cycleCheck = validateHierarchyCycle(
        positions.map((p) => ({ id: p.id, parentId: p.reportsToPositionId })),
        'new-pos',
        dto.reportsToPositionId
      );
      if (!cycleCheck.isValid) {
        throw new BadRequestException(`Reporting relationship cycle detected: ${cycleCheck.error}`);
      }
    }

    return this.prisma.position.create({
      data: {
        workspaceId,
        title: dto.title,
        departmentId: dto.departmentId,
        reportsToPositionId: dto.reportsToPositionId || null,
      },
    });
  }

  async updatePosition(
    workspaceId: string,
    positionId: string,
    actorId: string,
    dto: { title?: string; departmentId?: string; reportsToPositionId?: string | null }
  ) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
      { workspaceId }
    );

    const existing = await this.prisma.position.findFirst({
      where: { id: positionId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Position not found');
    }

    if (dto.reportsToPositionId !== undefined && dto.reportsToPositionId !== existing.reportsToPositionId) {
      if (dto.reportsToPositionId) {
        const positions = await this.prisma.position.findMany({
          where: { workspaceId },
          select: { id: true, reportsToPositionId: true },
        });
        const cycleCheck = validateHierarchyCycle(
          positions.map((p) => ({ id: p.id, parentId: p.reportsToPositionId })),
          positionId,
          dto.reportsToPositionId
        );
        if (!cycleCheck.isValid) {
          throw new BadRequestException(`Reporting relationship cycle detected: ${cycleCheck.error}`);
        }
      }
    }

    return this.prisma.position.update({
      where: { id: positionId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.reportsToPositionId !== undefined && { reportsToPositionId: dto.reportsToPositionId }),
      },
    });
  }

  // ==========================================
  // SCOPED ROLES & PRIVILEGE ESCALATION CHECKS
  // ==========================================

  async assignScopedRole(
    workspaceId: string,
    actorId: string,
    dto: {
      userId: string;
      roleScope: RoleScopeType;
      scopeId: string;
      roleName: string;
      permissions?: string[];
    }
  ) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.PERMISSIONS_GRANT,
      { workspaceId }
    );

    // Verify target user belongs to this organization
    const member = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: dto.userId } },
    });
    if (!member) {
      throw new BadRequestException('Target user is not a member of this organization');
    }

    // Privilege escalation prevention:
    // Actor cannot grant permissions they do not have themselves unless they have system-level PERMISSIONS_GRANT
    const actorCanGrant = await this.authService.can(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.PERMISSIONS_GRANT,
      { workspaceId }
    );
    if (!actorCanGrant) {
      throw new ForbiddenException('Privilege escalation attempt: Insufficient authority to grant scoped permissions');
    }

    // Check if assignment already exists
    const existing = await this.prisma.scopedRoleAssignment.findFirst({
      where: {
        workspaceId,
        userId: dto.userId,
        scope: dto.roleScope,
        resourceId: dto.scopeId,
      },
    });

    if (existing) {
      return this.prisma.scopedRoleAssignment.update({
        where: { id: existing.id },
        data: {
          role: dto.roleName,
        },
      });
    }

    return this.prisma.scopedRoleAssignment.create({
      data: {
        workspaceId,
        userId: dto.userId,
        scope: dto.roleScope,
        resourceId: dto.scopeId,
        role: dto.roleName,
        grantedById: actorId,
      },
    });
  }

  async listScopedRoles(workspaceId: string, userId?: string, scopeId?: string) {
    return this.prisma.scopedRoleAssignment.findMany({
      where: {
        workspaceId,
        ...(userId && { userId }),
        ...(scopeId && { resourceId: scopeId }),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeScopedRole(workspaceId: string, roleAssignmentId: string, actorId: string) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.PERMISSIONS_GRANT,
      { workspaceId }
    );

    const assignment = await this.prisma.scopedRoleAssignment.findFirst({
      where: { id: roleAssignmentId, workspaceId },
    });
    if (!assignment) {
      throw new NotFoundException('Scoped role assignment not found');
    }

    return this.prisma.scopedRoleAssignment.delete({ where: { id: roleAssignmentId } });
  }

  // ==========================================
  // CONFIDENTIALITY ACCESS GRANTS (EXPLICIT)
  // ==========================================

  async createAccessGrant(
    workspaceId: string,
    actorId: string,
    dto: {
      resourceType: string;
      resourceId: string;
      granteeType: string;
      granteeId: string;
      expiresAt?: string;
    }
  ) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.CONFIDENTIALITY_CHANGE,
      { workspaceId }
    );

    return this.prisma.accessGrant.create({
      data: {
        workspaceId,
        userId: dto.granteeId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        grantedById: actorId,
        validUntil: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async revokeAccessGrant(workspaceId: string, grantId: string, actorId: string) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.CONFIDENTIALITY_CHANGE,
      { workspaceId }
    );

    const grant = await this.prisma.accessGrant.findFirst({
      where: { id: grantId, workspaceId },
    });
    if (!grant) {
      throw new NotFoundException('Access grant not found');
    }

    return this.prisma.accessGrant.update({
      where: { id: grantId },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async listAccessGrants(workspaceId: string, resourceType?: string, resourceId?: string) {
    return this.prisma.accessGrant.findMany({
      where: {
        workspaceId,
        ...(resourceType && { resourceType }),
        ...(resourceId && { resourceId }),
        revokedAt: null,
      },
      include: {
        grantedBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================
  // BACKUP APPROVER DELEGATION & WORK REASSIGNMENT
  // ==========================================

  async setBackupReviewer(
    workspaceId: string,
    targetUserId: string,
    backupReviewerId: string | null,
    actorId: string
  ) {
    if (actorId !== targetUserId) {
      await this.authService.enforce(
        { id: actorId, workspaceId },
        GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
        { workspaceId }
      );
    }

    if (backupReviewerId) {
      const backupMember = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: backupReviewerId } },
      });
      if (!backupMember) {
        throw new BadRequestException('Designated backup reviewer does not belong to this organization');
      }
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { backupReviewerId },
      select: { id: true, fullName: true, email: true, backupReviewerId: true },
    });
  }

  async reassignUserWork(
    workspaceId: string,
    departingUserId: string,
    targetUserId: string,
    actorId: string
  ) {
    await this.authService.enforce(
      { id: actorId, workspaceId },
      GRANULAR_PERMISSIONS.MEMBERS_MANAGE,
      { workspaceId }
    );

    return this.authService.reassignUserWork(workspaceId, departingUserId, targetUserId);
  }
}
