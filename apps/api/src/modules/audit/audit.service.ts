import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'jwt',
]);

export function sanitizeAuditData(data: any): any {
  if (data === null || data === undefined) {
    return null;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeAuditData);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeAuditData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a business audit log event with sanitized before/after values.
   */
  async log(params: {
    workspaceId: string;
    projectId?: string | null;
    entityName: string;
    entityId: string;
    actorId: string;
    action: string;
    oldValues?: any;
    newValues?: any;
  }) {
    try {
      const sanitizedOld = params.oldValues ? sanitizeAuditData(params.oldValues) : null;
      const sanitizedNew = params.newValues ? sanitizeAuditData(params.newValues) : null;

      return await this.prisma.auditLog.create({
        data: {
          workspaceId: params.workspaceId,
          projectId: params.projectId || null,
          entityName: params.entityName,
          entityId: params.entityId,
          actorId: params.actorId,
          action: params.action,
          oldValues: sanitizedOld,
          newValues: sanitizedNew,
        },
        include: {
          actor: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to record audit log: ${err.message}`, err.stack);
      // Audit failure should not crash the primary transaction, but is visibly logged
      return null;
    }
  }

  /**
   * Retrieves audit logs for a specific node/task.
   */
  async getNodeHistory(nodeId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { entityId: nodeId },
      include: {
        actor: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Retrieves audit logs for an entire project.
   */
  async getProjectHistory(projectId: string, options?: { limit?: number; offset?: number; action?: string }) {
    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;

    const where: any = { projectId };
    if (options?.action) {
      where.action = options.action;
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * Retrieves audit logs for an entire workspace with optional entityName, action, and pagination filters.
   */
  async getWorkspaceHistory(
    workspaceId: string,
    actorId?: string,
    options?: { limit?: number; offset?: number; entityName?: string; action?: string }
  ) {
    if (actorId) {
      const membership = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: actorId } },
      });
      if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'MANAGER')) {
        throw new ForbiddenException('Forbidden: Only Admins and Managers can inspect workspace audit logs.');
      }
    }

    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;

    const where: any = { workspaceId };
    if (options?.entityName) {
      where.entityName = options.entityName;
    }
    if (options?.action) {
      where.action = options.action;
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }
}
