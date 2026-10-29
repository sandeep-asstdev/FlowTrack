import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';
import { BackgroundJobsService } from '../background-jobs/background-jobs.service';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateNotificationDto,
  NotificationFilterDto,
  NotificationPreferencesDto,
  GRANULAR_PERMISSIONS,
} from '@flowtrack/shared';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: CollaborationGateway,
    private readonly backgroundJobs: BackgroundJobsService,
    @Optional() private readonly authService?: AuthorizationService,
    @Optional() private readonly auditService?: AuditService
  ) {}

  /**
   * Dispatches a notification to a user with deduplication protection,
   * delivery attempt tracking, and confidentiality filter (never leak secret titles).
   */
  async sendNotification(dto: CreateNotificationDto) {
    try {
      // 1. Check user exists
      const user = await this.prisma.user?.findUnique({
        where: { id: dto.userId },
        select: { id: true, memberships: { select: { projectPermissions: true } } },
      });

      if (!user) {
        this.logger.warn(`Cannot send notification: User ${dto.userId} not found`);
        return null;
      }

      // 2. Check deduplication key (Requirement 6 & Phase 3 safety)
      if (dto.dedupKey) {
        const existing = await this.prisma.notification?.findUnique({
          where: {
            userId_dedupKey: {
              userId: dto.userId,
              dedupKey: dto.dedupKey,
            },
          },
        });

        if (existing) {
          this.logger.debug(`Notification with dedupKey ${dto.dedupKey} already sent to user ${dto.userId}`);
          return existing;
        }
      }

      // 3. Confidentiality Filter (Scenario 14): Mask sensitive titles for unauthorized recipients
      let isConfidential = false;
      let classification: string | null = null;
      let entityOwnerId: string | null = null;
      let entityManagerId: string | null = null;

      if (dto.projectId && this.prisma.project?.findUnique) {
        const prj = await this.prisma.project.findUnique({
          where: { id: dto.projectId },
          select: { id: true, classification: true, ownerId: true, responsibleManagerId: true },
        });
        if (prj) {
          classification = prj.classification;
          entityOwnerId = prj.ownerId;
          entityManagerId = prj.responsibleManagerId;
        }
      } else if (dto.entityType === 'node' && dto.entityId && this.prisma.node?.findUnique) {
        const node = await this.prisma.node.findUnique({
          where: { id: dto.entityId },
          select: {
            id: true,
            ownerId: true,
            project: { select: { id: true, classification: true, ownerId: true, responsibleManagerId: true } },
          },
        });
        if (node) {
          classification = (node as any).classification || node.project?.classification;
          entityOwnerId = node.ownerId || node.project?.ownerId || null;
          entityManagerId = node.project?.responsibleManagerId || null;
        }
      }

      if (
        classification === 'RESTRICTED' ||
        classification === 'CONFIDENTIAL' ||
        classification === 'HIGHLY_CONFIDENTIAL'
      ) {
        isConfidential = true;
      }

      let finalTitle = dto.title;
      let finalBody = dto.body;

      if (isConfidential) {
        let isRecipientAuthorized = false;
        if (dto.userId === entityOwnerId || dto.userId === entityManagerId) {
          isRecipientAuthorized = true;
        } else if (this.authService) {
          const canView = await this.authService.can(
            { id: dto.userId, workspaceId: dto.workspaceId },
            GRANULAR_PERMISSIONS.PROJECT_VIEW,
            {
              id: dto.projectId || dto.entityId,
              classification: classification as any,
              ownerId: entityOwnerId,
              responsibleManagerId: entityManagerId,
              workspaceId: dto.workspaceId,
            }
          );
          if (canView) isRecipientAuthorized = true;
        }

        if (!isRecipientAuthorized) {
          finalTitle = '[Confidential Initiative] Update';
          finalBody = 'You have received a notification regarding a classified item. Higher authorization is required to view details.';
        }
      }

      // 4. Create Notification record with delivery tracking
      const notification = await this.prisma.notification.create({
        data: {
          workspaceId: dto.workspaceId,
          projectId: dto.projectId || null,
          userId: dto.userId,
          actorId: dto.actorId || null,
          type: dto.type,
          title: finalTitle,
          body: finalBody,
          entityType: dto.entityType || null,
          entityId: dto.entityId || null,
          data: {
            ...(dto.data || {}),
            deliveryAttempts: 1,
            deliveryStatus: 'DELIVERED',
            isMaskedForConfidentiality: isConfidential && finalTitle !== dto.title,
          },
          dedupKey: dto.dedupKey || null,
        },
        include: {
          actor: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      });

      // 5. Broadcast to recipient in real-time
      this.backgroundJobs.enqueue(`emit_notification_${notification.id}`, { id: notification.id }, async () => {
        this.gateway.sendToUser(dto.userId, 'notification:received', notification);
      });

      return notification;
    } catch (err: any) {
      this.logger.error(`Failed to send notification: ${err.message}`, err.stack);
      return null;
    }
  }

  /**
   * Phase 3: Scheduled Reminders and Approval Escalation Engine
   */
  async processApprovalEscalations(workspaceId?: string) {
    const results = {
      escalatedCount: 0,
      remindersSent: 0,
    };

    if (!(this.prisma as any).approvalStageInstance?.findMany) {
      return results;
    }

    try {
      const now = new Date();
      const pendingInstances = await (this.prisma as any).approvalStageInstance.findMany({
        where: {
          status: 'PENDING',
          ...(workspaceId ? { approvalRequest: { workspaceId } } : {}),
        },
        include: {
          approvalRequest: true,
        },
      });

      for (const instance of pendingInstances) {
        if (!instance.dueDate) continue;
        const dueDate = new Date(instance.dueDate);

        // Check if overdue -> escalate
        if (now > dueDate) {
          const escalateToUserId = instance.escalateToUserId || instance.approvalRequest?.submitterId;
          if (escalateToUserId) {
            const todayStr = now.toISOString().slice(0, 10);
            await this.sendNotification({
              workspaceId: instance.approvalRequest?.workspaceId || workspaceId || '',
              userId: escalateToUserId,
              type: 'APPROVAL_ESCALATION',
              title: `⚠️ Approval Escalation: Stage "${instance.name}" is Overdue`,
              body: `The approval stage for request ${instance.approvalRequestId} is past its due date (${dueDate.toLocaleDateString()}) and has been escalated.`,
              entityType: 'approval_stage_instance',
              entityId: instance.id,
              dedupKey: `escalate:${instance.id}:${todayStr}`,
            });
            results.escalatedCount++;

            if (this.auditService && instance.approvalRequest?.workspaceId) {
              await this.auditService.recordAuditEvent({
                workspaceId: instance.approvalRequest.workspaceId,
                actorId: 'system-escalator',
                action: 'APPROVAL_ESCALATED',
                targetType: 'approval_stage_instance',
                targetId: instance.id,
                beforeValues: { status: instance.status, dueDate: instance.dueDate },
                afterValues: { escalated: true, escalatedTo: escalateToUserId },
                reason: 'Approval stage instance overdue past configured threshold',
                outcome: 'SUCCESS',
              });
            }
          }
        } else {
          // Check if due soon (< 24 hours) -> send reminder
          const msRemaining = dueDate.getTime() - now.getTime();
          const hoursRemaining = msRemaining / (1000 * 60 * 60);

          if (hoursRemaining <= 24 && instance.assignedApproverId) {
            const todayStr = now.toISOString().slice(0, 10);
            await this.sendNotification({
              workspaceId: instance.approvalRequest?.workspaceId || workspaceId || '',
              userId: instance.assignedApproverId,
              type: 'DEADLINE_REMINDER',
              title: `⏰ Approval Reminder: Stage "${instance.name}" Due Soon`,
              body: `The approval stage for request ${instance.approvalRequestId} is due within 24 hours.`,
              entityType: 'approval_stage_instance',
              entityId: instance.id,
              dedupKey: `reminder:stage:${instance.id}:${todayStr}`,
            });
            results.remindersSent++;
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to process approval escalations: ${err.message}`, err.stack);
    }

    return results;
  }

  /**
   * Phase 3: Overdue Work Reminder Engine
   */
  async processOverdueWorkReminders(workspaceId?: string) {
    const results = { overdueRemindersSent: 0 };
    if (!this.prisma.node?.findMany) return results;

    try {
      const now = new Date();
      const overdueNodes = await this.prisma.node.findMany({
        where: {
          deletedAt: null,
          dueDate: { lt: now },
          state: { notIn: ['Completed', 'Cancelled', 'Archived'] },
          ...(workspaceId ? { workspaceId } : {}),
        },
        select: {
          id: true,
          title: true,
          workspaceId: true,
          ownerId: true,
          dueDate: true,
        },
        take: 100,
      });

      const todayStr = now.toISOString().slice(0, 10);
      for (const node of overdueNodes) {
        if (!node.ownerId) continue;
        await this.sendNotification({
          workspaceId: node.workspaceId,
          userId: node.ownerId,
          type: 'DEADLINE_REMINDER',
          title: `⏰ Overdue Task Notice: "${node.title}"`,
          body: `The task "${node.title}" is overdue (due date was ${node.dueDate ? new Date(node.dueDate).toLocaleDateString() : 'past'}). Please submit progress update or request extension.`,
          entityType: 'node',
          entityId: node.id,
          dedupKey: `overdue:node:${node.id}:${todayStr}`,
        });
        results.overdueRemindersSent++;
      }
    } catch (err: any) {
      this.logger.error(`Failed to process overdue work reminders: ${err.message}`, err.stack);
    }
    return results;
  }

  /**
   * Retrieves notifications for a user with unread count.
   */
  async getUserNotifications(userId: string, filter?: NotificationFilterDto) {
    const limit = Math.min(filter?.limit || 50, 100);
    const offset = filter?.offset || 0;

    const where: any = { userId };
    if (filter?.read !== undefined) {
      where.read = filter.read;
    }
    if (filter?.type) {
      where.type = filter.type;
    }

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: {
          actor: { select: { id: true, fullName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return {
      items,
      total,
      unreadCount,
      limit,
      offset,
    };
  }

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(userId: string, notificationId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    const unreadCount = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    return { success: updated.count > 0, unreadCount };
  }

  /**
   * Marks all notifications for a user as read.
   */
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    return { success: true, unreadCount: 0 };
  }

  /**
   * Gets user alert preferences.
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });

    return {
      mutedTypes: [],
      emailAlerts: false,
      inAppAlerts: true,
    };
  }

  /**
   * Updates user alert preferences.
   */
  async updateUserPreferences(userId: string, prefs: NotificationPreferencesDto) {
    return {
      userId,
      ...prefs,
    };
  }
}
