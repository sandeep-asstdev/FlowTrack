import { z } from 'zod';

export const createEdgeSchema = z.object({
  projectId: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  kind: z.enum(['sequence', 'dependency', 'related']).default('sequence'),
  label: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateEdgeSchema = createEdgeSchema.partial();

export const insertNodeOnEdgeSchema = z.object({
  edgeId: z.string().uuid(),
  nodeData: z.object({
    nodeTypeId: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
  }),
});

export type CreateEdgeDto = z.infer<typeof createEdgeSchema>;
export type UpdateEdgeDto = z.infer<typeof updateEdgeSchema>;
export type InsertNodeOnEdgeDto = z.infer<typeof insertNodeOnEdgeSchema>;
