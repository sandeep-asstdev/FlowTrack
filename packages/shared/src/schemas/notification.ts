import { z } from 'zod';

export const NOTIFICATION_TYPES = [
  'ASSIGNMENT',
  'DEADLINE_REMINDER',
  'BLOCKER',
  'APPROVAL_REQUEST',
  'APPROVAL_DECISION',
  'COMMENT_MENTION',
  'EVIDENCE_SUBMITTED',
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

export const createNotificationSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string().nullable().optional(),
  userId: z.string(),
  actorId: z.string().nullable().optional(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  data: z.record(z.any()).optional(),
  dedupKey: z.string().nullable().optional(),
});

export type CreateNotificationDto = z.infer<typeof createNotificationSchema>;

export const notificationFilterSchema = z.object({
  read: z.boolean().optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type NotificationFilterDto = z.infer<typeof notificationFilterSchema>;

export const notificationPreferencesSchema = z.object({
  mutedTypes: z.array(z.enum(NOTIFICATION_TYPES)).default([]),
  emailAlerts: z.boolean().default(false),
  inAppAlerts: z.boolean().default(true),
});

export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesSchema>;
