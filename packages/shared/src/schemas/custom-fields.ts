import { z } from 'zod';

export const FIELD_TYPES = [
  'text',
  'longtext',
  'number',
  'currency',
  'date',
  'boolean',
  'checkbox', // alias for boolean
  'select',
  'multiselect',
  'user',
  'team',
  'link',
  'url', // alias for link
  'file',
  'document', // alias for file
] as const;

export type FieldType = typeof FIELD_TYPES[number];

export const TARGET_TYPES = ['project', 'stage', 'task', 'node'] as const;
export type TargetType = typeof TARGET_TYPES[number];

export const VISIBILITY_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
] as const;

export type VisibilityOperator = typeof VISIBILITY_OPERATORS[number];

export const visibilityRuleSchema = z.object({
  dependsOnField: z.string().min(1),
  operator: z.enum(VISIBILITY_OPERATORS).default('equals'),
  value: z.any().optional(),
});

export type VisibilityRuleDto = z.input<typeof visibilityRuleSchema>;

export const fieldValidationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  pattern: z.string().optional(),
  patternMessage: z.string().optional(),
  decimalPlaces: z.number().int().min(0).max(6).optional(),
  minDate: z.string().optional(),
  maxDate: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type FieldValidationDto = z.infer<typeof fieldValidationSchema>;

export const fieldSelectOptionSchema = z.union([
  z.string(),
  z.object({
    value: z.string(),
    label: z.string(),
    colour: z.string().optional(),
  }),
]);

export const fieldOptionsSchema = z.object({
  choices: z.array(fieldSelectOptionSchema).optional(),
  defaultCurrency: z.string().optional(),
  allowCustom: z.boolean().optional(),
  minItems: z.number().int().nonnegative().optional(),
  maxItems: z.number().int().nonnegative().optional(),
}).passthrough();

export type FieldOptionsDto = z.infer<typeof fieldOptionsSchema>;

export const fieldDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  nodeTypeId: z.string().uuid().nullable().optional(),
  targetType: z.enum(TARGET_TYPES).default('node'),
  fieldKey: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Field key must be lowercase alphanumeric and underscores'),
  label: z.string().min(1),
  labelI18n: z.record(z.string()).optional().default({}),
  description: z.string().nullable().optional(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  defaultValue: z.any().optional(),
  options: fieldOptionsSchema.optional().default({}),
  validation: fieldValidationSchema.optional().default({}),
  visibilityRules: z.array(visibilityRuleSchema).optional().default([]),
  groupName: z.string().optional().default('General'),
  displayOrder: z.number().int().default(0),
  editableRoles: z.array(z.string()).optional().default([]),
  isActive: z.boolean().default(true),
  version: z.number().int().default(1),
});

export type FieldDefinitionDto = z.input<typeof fieldDefinitionSchema>;

export const createFieldDefinitionSchema = fieldDefinitionSchema.omit({
  id: true,
  version: true,
}).extend({
  workspaceId: z.string().uuid().optional(),
});

export type CreateFieldDefinitionDto = z.input<typeof createFieldDefinitionSchema>;

export const updateFieldDefinitionSchema = fieldDefinitionSchema.partial().omit({
  id: true,
  fieldKey: true, // Field keys are immutable to prevent record corruption
  workspaceId: true,
});

export type UpdateFieldDefinitionDto = z.input<typeof updateFieldDefinitionSchema>;

export const createNodeTypeSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  icon: z.string().default('Box'),
  colour: z.string().default('#3b82f6'),
  defaultStatusSetId: z.string().uuid().optional(),
  isGroup: z.boolean().default(false),
  fields: z.array(fieldDefinitionSchema).default([]),
});

export type CreateNodeTypeDto = z.infer<typeof createNodeTypeSchema>;
