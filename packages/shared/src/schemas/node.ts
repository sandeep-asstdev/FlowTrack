import { z } from 'zod';

// Robust ISO datetime schema accepting Date objects, valid date strings, empty strings, and null
const isoDateTimeSchema = z.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return val;
}, z.string().datetime().nullable().optional());

export const createNodeSchema = z.object({
  projectId: z.string().uuid(),
  parentNodeId: z.string().uuid().nullable().optional(),
  nodeTypeId: z.string().uuid(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
  width: z.number().optional().default(280),
  height: z.number().optional().default(160),
  ownerId: z.string().uuid().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  assignedById: z.string().uuid().nullable().optional(),
  assignedAt: isoDateTimeSchema,
  submitterId: z.string().uuid().nullable().optional(),
  submittedAt: isoDateTimeSchema,
  statusId: z.string().uuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  weight: z.number().positive().default(1.0),
  isMilestone: z.boolean().default(false),
  milestoneDueDate: isoDateTimeSchema,
  startDate: isoDateTimeSchema,
  dueDate: isoDateTimeSchema,
  progressPct: z.number().min(0).max(100).default(0),
  estimatedCost: z.number().nullable().optional(),
  actualCost: z.number().nullable().optional(),
  allocatedHours: z.number().nullable().optional(),
  actualHours: z.number().nullable().optional(),
  currency: z.string().default('USD'),
  approvalStatus: z.enum(['not_required', 'pending', 'approved', 'rejected']).default('not_required'),
  approvedAt: isoDateTimeSchema,
  approvalFeedback: z.string().nullable().optional(),
  customData: z.record(z.any()).default({}),
  collapsed: z.boolean().default(false),
});

export const updateNodeSchema = createNodeSchema.partial().extend({
  version: z.number().int().optional(),
});

export const batchUpdateNodePositionsSchema = z.object({
  positions: z.array(
    z.object({
      id: z.string().uuid(),
      positionX: z.number(),
      positionY: z.number(),
      version: z.number().int(),
    })
  ),
});

export const approveTaskSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  feedback: z.string().optional(),
});

export const reportBlockerSchema = z.object({
  reason: z.string().min(1, 'Blocker reason is required'),
  blockerStatusId: z.string().uuid().optional(),
});

export const requestDeadlineExtensionSchema = z.object({
  newDueDate: z.string().min(1, 'New due date is required'),
  justification: z.string().min(1, 'Justification is required'),
});

export const taskApprovalSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  nodeId: z.string().uuid(),
  submitterId: z.string().uuid().nullable().optional(),
  submittedAt: isoDateTimeSchema,
  reviewerId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  feedback: z.string().nullable().optional(),
  decidedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});

export type CreateNodeDto = z.input<typeof createNodeSchema>;
export type CreateNodeOutput = z.infer<typeof createNodeSchema>;
export type UpdateNodeDto = z.infer<typeof updateNodeSchema>;
export type BatchUpdateNodePositionsDto = z.infer<typeof batchUpdateNodePositionsSchema>;
export type ApproveTaskDto = z.infer<typeof approveTaskSchema>;
export type ReportBlockerDto = z.infer<typeof reportBlockerSchema>;
export type RequestDeadlineExtensionDto = z.infer<typeof requestDeadlineExtensionSchema>;
export type TaskApprovalDto = z.infer<typeof taskApprovalSchema>;
