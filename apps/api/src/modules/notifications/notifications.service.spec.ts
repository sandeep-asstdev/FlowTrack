import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from './notifications.service';

describe('NotificationsService & Deduplication', () => {
  let service: NotificationsService;
  let mockPrisma: any;
  let mockGateway: any;
  let mockBackgroundJobs: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-1' }),
      },
      notification: {
        findUnique: vi.fn(),
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'notif-1', ...args.data })),
        findMany: vi.fn().mockResolvedValue([
          { id: 'notif-1', title: 'Task assigned', read: false },
          { id: 'notif-2', title: 'Blocker reported', read: true },
        ]),
        count: vi.fn().mockImplementation((args) => {
          if (args?.where?.read === false) return Promise.resolve(1);
          return Promise.resolve(2);
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockGateway = {
      sendToUser: vi.fn(),
    };

    mockBackgroundJobs = {
      enqueue: vi.fn().mockImplementation((_name, _data, handler) => handler()),
    };

    service = new NotificationsService(mockPrisma, mockGateway as any, mockBackgroundJobs as any);
  });

  describe('sendNotification() with Deduplication (Requirement 6)', () => {
    it('creates notification and triggers real-time broadcast when dedupKey is new', async () => {
      mockPrisma.notification.findUnique.mockResolvedValueOnce(null);

      const result = await service.sendNotification({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        userId: 'user-1',
        actorId: 'actor-1',
        type: 'ASSIGNMENT',
        title: 'Task Assigned',
        body: 'You have been assigned to task 1',
        dedupKey: 'assign:task-1:user-1',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(result?.title).toBe('Task Assigned');
      expect(mockGateway.sendToUser).toHaveBeenCalledWith('user-1', 'notification:received', expect.anything());
    });

    it('suppresses duplicate notifications if dedupKey already exists for the recipient', async () => {
      const existingNotif = {
        id: 'existing-notif-1',
        userId: 'user-1',
        dedupKey: 'assign:task-1:user-1',
        title: 'Task Assigned',
      };
      mockPrisma.notification.findUnique.mockResolvedValueOnce(existingNotif);

      const result = await service.sendNotification({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        userId: 'user-1',
        actorId: 'actor-1',
        type: 'ASSIGNMENT',
        title: 'Task Assigned',
        body: 'You have been assigned to task 1',
        dedupKey: 'assign:task-1:user-1',
      });

      // Does not create a duplicate
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(result?.id).toBe('existing-notif-1');
    });
  });

  describe('Read / Unread State Tracking', () => {
    it('marks a notification as read and computes unread count', async () => {
      const result = await service.markAsRead('user-1', 'notif-1');

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
        data: { read: true, readAt: expect.any(Date) },
      });
      expect(result.success).toBe(true);
      expect(result.unreadCount).toBe(1);
    });

    it('marks all notifications as read for a user', async () => {
      const result = await service.markAllAsRead('user-1');

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
        data: { read: true, readAt: expect.any(Date) },
      });
      expect(result.unreadCount).toBe(0);
    });
  });
});
