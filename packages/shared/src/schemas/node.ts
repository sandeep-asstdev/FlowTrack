import { z } from 'zod';

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
  statusId: z.string().uuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  weight: z.number().positive().default(1.0),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  progressPct: z.number().min(0).max(100).default(0),
  customData: z.record(z.any()).default({}),
  collapsed: z.boolean().default(false),
});

export const updateNodeSchema = createNodeSchema.partial().extend({
  version: z.number().int(),
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

export type CreateNodeDto = z.infer<typeof createNodeSchema>;
export type UpdateNodeDto = z.infer<typeof updateNodeSchema>;
export type BatchUpdateNodePositionsDto = z.infer<typeof batchUpdateNodePositionsSchema>;
