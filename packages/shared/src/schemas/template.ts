import { z } from 'zod';
import { UNIVERSAL_INDUSTRIES, PROJECT_METHODOLOGIES } from '../constants/industry.js';
import { projectSettingsSchema } from './project.js';

export interface TemplateChecklistItem {
  id?: string;
  text: string;
  isRequired?: boolean;
}

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
  offsetDays?: number;
  durationDays?: number;
  isMilestone?: boolean;
  isRequired?: boolean;
  classification?: 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL' | 'HIGHLY_CONFIDENTIAL';
  rolePlaceholder?: string;
  checklist?: Array<TemplateChecklistItem | string>;
  requiredEvidenceTypes?: string[];
  approvalPolicyLink?: 'Normal' | 'Important' | 'Critical' | string;
  customData?: Record<string, any>;
  subtasks?: TemplateNodeDto[];
}

export const templateChecklistItemSchema = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    text: z.string().min(1),
    isRequired: z.boolean().optional().default(true),
  }),
]);

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
    offsetDays: z.number().int().min(0).default(0),
    durationDays: z.number().int().min(1).default(1),
    isMilestone: z.boolean().default(false),
    isRequired: z.boolean().default(true),
    classification: z.enum(['INTERNAL', 'RESTRICTED', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL']).default('INTERNAL'),
    rolePlaceholder: z.string().optional(),
    checklist: z.array(templateChecklistItemSchema).optional().default([]),
    requiredEvidenceTypes: z.array(z.string()).optional().default([]),
    approvalPolicyLink: z.string().optional(),
    customData: z.record(z.any()).optional().default({}),
    subtasks: z.array(templateNodeSchema).optional().default([]),
  })
);

export const templateEdgeSchema = z.object({
  sourceIndex: z.number().int().min(0).optional(),
  targetIndex: z.number().int().min(0).optional(),
  sourceKey: z.string().optional(),
  targetKey: z.string().optional(),
  kind: z.enum(['sequence', 'dependency', 'related', 'blocked_by']).default('sequence'),
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
  projectKey: z.string().optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  ownerId: z.string().optional(),
  responsibleManagerId: z.string().optional(),
  classification: z.enum(['INTERNAL', 'RESTRICTED', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL']).default('CONFIDENTIAL'),
  budget: z.number().optional(),
  currency: z.object({
    code: z.string().default('INR'),
    symbol: z.string().default('₹'),
  }).optional(),
  taskDurations: z.record(z.number()).optional(),
  roleAssignments: z.record(z.string()).optional(),
  approvalsPack: z.record(z.any()).optional(),
  customSettings: projectSettingsSchema.partial().optional(),
});

export type TemplateEdgeDto = z.infer<typeof templateEdgeSchema>;
export type TemplateGraphDto = z.infer<typeof templateGraphSchema>;
export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateDto = z.infer<typeof updateTemplateSchema>;
export type InstantiateTemplateDto = z.infer<typeof instantiateTemplateSchema>;

/**
 * Calculates start and due dates given a project start date, offset in days, and duration in days.
 */
export function calculateTaskDates(
  projectStartDate: Date,
  offsetDays: number = 0,
  durationDays: number = 1
): { startDate: Date; dueDate: Date } {
  const startDate = new Date(projectStartDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const safeDuration = Math.max(1, durationDays);
  const dueDate = new Date(startDate.getTime() + safeDuration * 24 * 60 * 60 * 1000);
  return { startDate, dueDate };
}
