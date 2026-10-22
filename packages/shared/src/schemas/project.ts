import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters'),
  description: z.string().optional(),
  templateId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
  settings: z.record(z.any()).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  version: z.number().int().optional(),
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>;
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
