import { z } from 'zod';
import {
  UNIVERSAL_INDUSTRIES,
  PROJECT_METHODOLOGIES,
  DATE_FORMATS,
} from '../constants/industry.js';
import { confidentialityLevelSchema } from '../domain/governance.js';

export const projectSettingsSchema = z.object({
  industry: z.enum(UNIVERSAL_INDUSTRIES).default('general'),
  methodology: z.enum(PROJECT_METHODOLOGIES).default('stage_gate'),
  currency: z.object({
    code: z.string().min(1).default('USD'),
    symbol: z.string().min(1).default('$'),
    name: z.string().optional(),
  }).default({ code: 'USD', symbol: '$' }),
  dateFormat: z.enum(DATE_FORMATS).default('YYYY-MM-DD'),
  timezone: z.string().default('UTC'),
  terminology: z.record(z.string()).default({
    stage: 'Stage',
    task: 'Task',
    subtask: 'Subtask',
    milestone: 'Milestone',
    owner: 'Owner',
    approver: 'Approver',
  }),
  features: z.object({
    budgetTracking: z.boolean().default(true),
    approvals: z.boolean().default(true),
    voiceRemarks: z.boolean().default(true),
    evidenceUpload: z.boolean().default(true),
    confidentialDocs: z.boolean().default(true),
    auditTrail: z.boolean().default(true),
  }).default({
    budgetTracking: true,
    approvals: true,
    voiceRemarks: true,
    evidenceUpload: true,
    confidentialDocs: true,
    auditTrail: true,
  }),
  templateType: z.string().optional(),
  budgetConfig: z.object({
    approvedBudget: z.number().nullable().optional(),
    contractAmount: z.number().nullable().optional(),
    contingencyReserve: z.number().nullable().optional(),
    purchaseOrderAmount: z.number().nullable().optional(),
  }).optional().default({}),
  dashboardConfig: z.object({
    defaultView: z.string().optional().default('overview'),
    enabledViews: z.array(z.string()).optional().default(['overview', 'milestones', 'financials', 'workload', 'approvals', 'blockers']),
    highlightMilestones: z.boolean().optional().default(true),
  }).optional().default({}),
}).passthrough();

export type ProjectSettingsDto = z.infer<typeof projectSettingsSchema>;

export const createProjectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters'),
  key: z.string().min(2).max(16).regex(/^[A-Z0-9_-]+$/i, 'Key must be alphanumeric').optional(),
  description: z.string().optional(),
  objectives: z.string().optional(),
  scope: z.string().optional(),
  deliverables: z.string().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  responsibleManagerId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  classification: confidentialityLevelSchema.optional(),
  accessPolicy: z.record(z.any()).optional(),
  templateId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
  settings: projectSettingsSchema.optional(),
  customData: z.record(z.any()).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  version: z.number().int().optional(),
});

export const cloneProjectSchema = z.object({
  name: z.string().min(2, 'Cloned project name must be at least 2 characters').optional(),
  description: z.string().optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
  resetProgress: z.boolean().default(true),
});

export const saveProjectAsTemplateSchema = z.object({
  name: z.string().min(2, 'Template name must be at least 2 characters'),
  description: z.string().optional(),
  category: z.string().default('General'),
  industry: z.enum(UNIVERSAL_INDUSTRIES).default('general'),
  methodology: z.enum(PROJECT_METHODOLOGIES).default('stage_gate'),
  icon: z.string().default('Layers'),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>;
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
export type CloneProjectDto = z.infer<typeof cloneProjectSchema>;
export type SaveProjectAsTemplateDto = z.infer<typeof saveProjectAsTemplateSchema>;
