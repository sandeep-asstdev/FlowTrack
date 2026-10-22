import { z } from 'zod';

export const FIELD_TYPES = [
  'text',
  'longtext',
  'number',
  'currency',
  'date',
  'select',
  'multiselect',
  'checkbox',
  'user',
  'file',
  'link',
] as const;

export const fieldDefinitionSchema = z.object({
  fieldKey: z.string().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.record(z.any()).optional(),
  displayOrder: z.number().int().default(0),
});

export const createNodeTypeSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  icon: z.string().default('Box'),
  colour: z.string().default('#3b82f6'),
  defaultStatusSetId: z.string().uuid().optional(),
  isGroup: z.boolean().default(false),
  fields: z.array(fieldDefinitionSchema).default([]),
});

export type FieldDefinitionDto = z.infer<typeof fieldDefinitionSchema>;
export type CreateNodeTypeDto = z.infer<typeof createNodeTypeSchema>;
