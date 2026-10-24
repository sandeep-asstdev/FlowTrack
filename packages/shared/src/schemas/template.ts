import { z } from 'zod';
import { UNIVERSAL_INDUSTRIES, PROJECT_METHODOLOGIES } from '../constants/industry.js';
import { projectSettingsSchema } from './project.js';

export interface TemplateNodeDto {
  key?: string;
  title: string;
  description?: string;
  nodeTypeKey?: string;
  parentKey?: string;
  positionX?: number;
  positionY?: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  weight?: number;
  progressPct?: number;
  customData?: Record<string, any>;
  subtasks?: TemplateNodeDto[];
}

export const templateNodeSchema: z.ZodType<TemplateNodeDto> = z.lazy(() =>
  z.object({
    key: z.string().optional(),
    title: z.string().min(1, 'Node title is required'),
    description: z.string().optional(),
    nodeTypeKey: z.string().default('task'),
    parentKey: z.string().optional(),
    positionX: z.number().default(0),
    positionY: z.number().default(0),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    weight: z.number().min(0).default(1.0),
    progressPct: z.number().min(0).max(100).default(0),
    customData: z.record(z.any()).optional().default({}),
    subtasks: z.array(templateNodeSchema).optional().default([]),
  })
);

export const templateEdgeSchema = z.object({
  sourceIndex: z.number().int().min(0),
  targetIndex: z.number().int().min(0),
  kind: z.enum(['sequence', 'dependency', 'related']).default('sequence'),
  label: z.string().optional(),
});

export const templateGraphSchema = z.object({
  nodes: z.array(templateNodeSchema),
  edges: z.array(templateEdgeSchema).default([]),
});

export const createTemplateSchema = z.object({
  name: z.string().min(2, 'Template name must be at least 2 characters'),
  description: z.string().optional(),
  category: z.string().default('General'),
  industry: z.enum(UNIVERSAL_INDUSTRIES).default('general'),
  methodology: z.enum(PROJECT_METHODOLOGIES).default('stage_gate'),
  icon: z.string().default('Layers'),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(true),
  defaultSettings: projectSettingsSchema.optional(),
  nodeTypes: z.array(z.record(z.any())).optional().default([]),
  statusSets: z.array(z.record(z.any())).optional().default([]),
  graphJson: templateGraphSchema,
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const instantiateTemplateSchema = z.object({
  projectName: z.string().min(2, 'Project name must be at least 2 characters'),
  projectDescription: z.string().optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
  customSettings: projectSettingsSchema.partial().optional(),
});

export type TemplateEdgeDto = z.infer<typeof templateEdgeSchema>;
export type TemplateGraphDto = z.infer<typeof templateGraphSchema>;
export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateDto = z.infer<typeof updateTemplateSchema>;
export type InstantiateTemplateDto = z.infer<typeof instantiateTemplateSchema>;
