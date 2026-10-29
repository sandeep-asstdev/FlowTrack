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
  'credential',
  'privatekey',
  'private_key',
  'filecontent',
  'file_content',
  'filebuffer',
  'file_buffer',
  'buffer',
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
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'string' && val.startsWith('data:') && val.length > 200) {
      sanitized[key] = '[BASE64_PAYLOAD_REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeAuditData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export interface RecordAuditEventParams {
  workspaceId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeValues?: any;
  afterValues?: any;
  reason?: string | null;
  requestId?: string | null;
  policyReference?: string | null;
  outcome?: 'SUCCESS' | 'FAILURE' | 'REJECTED' | 'BLOCKED' | 'OVERRIDDEN' | string;
}

export interface SearchAuditEventsOptions {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  outcome?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append-only event recorder for Phase 2 Immutable Audit Trail.
   */
  async recordAuditEvent(params: RecordAuditEventParams) {
    try {
      const sanitizedBefore = params.beforeValues ? sanitizeAuditData(params.beforeValues) : null;
      const sanitizedAfter = params.afterValues ? sanitizeAuditData(params.afterValues) : null;

      if (!this.prisma.auditEvent?.create) {
        return null;
      }

      return await this.prisma.auditEvent.create({
        data: {
          workspaceId: params.workspaceId,
          actorId: params.actorId,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          beforeValues: sanitizedBefore,
          afterValues: sanitizedAfter,
          reason: params.reason || null,
          requestId: params.requestId || null,
          policyReference: params.policyReference || null,
          outcome: params.outcome || 'SUCCESS',
        },
        include: {
          actor: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to append audit event: ${err.message}`, err.stack);
      return null;
    }
  }

  /**
   * Strictly forbids UPDATE operations on audit events.
   */
  async updateAuditEvent() {
    throw new ForbiddenException('Audit events are strictly append-only: UPDATE operations are forbidden.');
  }

  /**
   * Strictly forbids DELETE operations on audit events.
   */
  async deleteAuditEvent() {
    throw new ForbiddenException('Audit events are strictly append-only: DELETE operations are forbidden.');
  }

  /**
   * Searches and filters immutable audit events with confidentiality masking.
   */
  async searchAuditEvents(
    workspaceId: string,
    viewerId: string,
    options?: SearchAuditEventsOptions
  ) {
    // Verify viewer membership in workspace
    if (this.prisma.membership?.findUnique) {
      const membership = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: viewerId } },
      });
      if (!membership) {
        throw new ForbiddenException('Forbidden: You are not a member of this workspace.');
      }
    }

    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;

    const where: any = { workspaceId };
    if (options?.actorId) where.actorId = options.actorId;
    if (options?.action) where.action = options.action;
    if (options?.targetType) where.targetType = options.targetType;
    if (options?.targetId) where.targetId = options.targetId;
    if (options?.outcome) where.outcome = options.outcome;

    if (options?.startDate || options?.endDate) {
      where.timestamp = {};
      if (options.startDate) where.timestamp.gte = new Date(options.startDate);
      if (options.endDate) where.timestamp.lte = new Date(options.endDate);
    }

    if (!this.prisma.auditEvent?.findMany) {
      return { items: [], total: 0, limit, offset };
    }

    const [events, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        include: {
          actor: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditEvent.count ? this.prisma.auditEvent.count({ where }) : Promise.resolve(0),
    ]);

    // Mask confidential titles for unauthorized viewers
    const maskedEvents = await Promise.all(
      events.map(async (event: any) => {
        return this.redactConfidentialEvent(event, viewerId);
      })
    );

    return {
      items: maskedEvents,
      total,
      limit,
      offset,
    };
  }

  /**
   * Redacts titles and details from audit event if target is a confidential resource
   * that the viewing user is not authorized to see.
   */
  private async redactConfidentialEvent(event: any, viewerId: string) {
    try {
      if (event.targetType === 'task' || event.targetType === 'node') {
        if (this.prisma.node?.findUnique) {
          const node = await this.prisma.node.findUnique({
            where: { id: event.targetId },
            select: { classification: true, ownerId: true, responsibleLeadId: true },
          });
          if (node && (node.classification === 'CONFIDENTIAL' || node.classification === 'HIGHLY_CONFIDENTIAL')) {
            const isAuthorized = node.ownerId === viewerId || node.responsibleLeadId === viewerId;
            if (!isAuthorized) {
              return {
                ...event,
                beforeValues: event.beforeValues ? { [Object.keys(event.beforeValues)[0]]: '[RESTRICTED CONTENT]' } : null,
                afterValues: event.afterValues ? { [Object.keys(event.afterValues)[0]]: '[RESTRICTED CONTENT]' } : null,
                reason: '[RESTRICTED REASON]',
              };
            }
          }
        }
      } else if (event.targetType === 'project') {
        if (this.prisma.project?.findUnique) {
          const prj = await this.prisma.project.findUnique({
            where: { id: event.targetId },
            select: { classification: true, ownerId: true, responsibleManagerId: true },
          });
          if (prj && (prj.classification === 'CONFIDENTIAL' || prj.classification === 'HIGHLY_CONFIDENTIAL')) {
            const isAuthorized = prj.ownerId === viewerId || prj.responsibleManagerId === viewerId;
            if (!isAuthorized) {
              return {
                ...event,
                beforeValues: event.beforeValues ? { [Object.keys(event.beforeValues)[0]]: '[RESTRICTED CONTENT]' } : null,
                afterValues: event.afterValues ? { [Object.keys(event.afterValues)[0]]: '[RESTRICTED CONTENT]' } : null,
                reason: '[RESTRICTED REASON]',
              };
            }
          }
        }
      }
    } catch {
      // Fallback
    }
    return event;
  }

  /**
   * Exports audit events in CSV or JSON format for authorized compliance auditors.
   */
  async exportAuditEvents(
    workspaceId: string,
    viewerId: string,
    format: 'csv' | 'json' = 'json',
    options?: SearchAuditEventsOptions
  ): Promise<{ contentType: string; data: string; filename: string }> {
    const result = await this.searchAuditEvents(workspaceId, viewerId, {
      ...options,
      limit: 1000,
      offset: 0,
    });

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'csv') {
      const headers = ['id', 'timestamp', 'actorId', 'actorName', 'action', 'targetType', 'targetId', 'outcome', 'reason'];
      const rows = result.items.map((e: any) => [
        e.id,
        new Date(e.timestamp).toISOString(),
        e.actorId,
        `"${(e.actor?.fullName || '').replace(/"/g, '""')}"`,
        e.action,
        e.targetType,
        e.targetId,
        e.outcome,
        `"${(e.reason || '').replace(/"/g, '""')}"`,
      ]);

      const csvData = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
      return {
        contentType: 'text/csv',
        data: csvData,
        filename: `audit_events_${workspaceId}_${timestampStr}.csv`,
      };
    }

    return {
      contentType: 'application/json',
      data: JSON.stringify(result.items, null, 2),
      filename: `audit_events_${workspaceId}_${timestampStr}.json`,
    };
  }

  /**
   * Records a business audit log event with sanitized before/after values (legacy audit_log table).
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

      // Also append to audit_events for complete immutable record if available
      if (this.prisma.auditEvent && typeof this.prisma.auditEvent.create === 'function') {
        await this.prisma.auditEvent.create({
          data: {
            workspaceId: params.workspaceId,
            actorId: params.actorId,
            action: params.action,
            targetType: params.entityName.toLowerCase(),
            targetId: params.entityId,
            beforeValues: sanitizedOld,
            afterValues: sanitizedNew,
            outcome: 'SUCCESS',
          },
        }).catch(() => null);
      }

      if (!this.prisma.auditLog?.create) {
        return null;
      }

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
      return null;
    }
  }

  /**
   * Retrieves audit logs for a specific node/task.
   */
  async getNodeHistory(nodeId: string, limit = 50) {
    if (!this.prisma.auditLog?.findMany) return [];
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

    if (!this.prisma.auditLog?.findMany) {
      return { items: [], total: 0, limit, offset };
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
      this.prisma.auditLog.count ? this.prisma.auditLog.count({ where }) : Promise.resolve(0),
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
    if (actorId && this.prisma.membership?.findUnique) {
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

    if (!this.prisma.auditLog?.findMany) {
      return { items: [], total: 0, limit, offset };
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
      this.prisma.auditLog.count ? this.prisma.auditLog.count({ where }) : Promise.resolve(0),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }
}
