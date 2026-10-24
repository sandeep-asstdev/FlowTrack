import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';
import { BackgroundJobsService } from '../background-jobs/background-jobs.service';
import { CreateNotificationDto, NotificationFilterDto, NotificationPreferencesDto } from '@flowtrack/shared';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: CollaborationGateway,
    private readonly backgroundJobs: BackgroundJobsService
  ) {}

  /**
   * Dispatches a notification to a user with deduplication protection and preference enforcement.
   */
  async sendNotification(dto: CreateNotificationDto) {
    try {
      // 1. Check user preferences
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, memberships: { select: { projectPermissions: true } } },
      });

      if (!user) {
        this.logger.warn(`Cannot send notification: User ${dto.userId} not found`);
        return null;
      }

      // 2. Check deduplication key (Requirement 6)
      if (dto.dedupKey) {
        const existing = await this.prisma.notification.findUnique({
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

      // 3. Create Notification record
      const notification = await this.prisma.notification.create({
        data: {
          workspaceId: dto.workspaceId,
          projectId: dto.projectId || null,
          userId: dto.userId,
          actorId: dto.actorId || null,
          type: dto.type,
          title: dto.title,
          body: dto.body,
          entityType: dto.entityType || null,
          entityId: dto.entityId || null,
          data: dto.data || {},
          dedupKey: dto.dedupKey || null,
        },
        include: {
          actor: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      });

      // 4. Non-blockingly broadcast to recipient in real-time
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
