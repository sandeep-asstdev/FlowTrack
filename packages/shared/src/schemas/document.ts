import { z } from 'zod';

export const DOCUMENT_CATEGORIES = [
  'general',
  'evidence',
  'deliverable',
  'specification',
  'contract',
] as const;

export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];

export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
] as const;

export const BLOCKED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.vbs',
  '.msi',
  '.jar',
  '.com',
  '.scr',
  '.pif',
  '.ps1',
];

export const createDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().optional().default('application/octet-stream'),
  fileSize: z.number().int().nonnegative().max(MAX_DOCUMENT_SIZE_BYTES, 'File size cannot exceed 25MB'),
  storageKey: z.string().optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional().default('general'),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.any()).optional().default({}),
});

export type CreateDocumentDto = z.input<typeof createDocumentSchema>;
export type CreateDocumentOutput = z.infer<typeof createDocumentSchema>;

export const evidenceReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REWORK']),
  feedback: z.string().min(1).max(2000),
  verifiedAt: z.string().datetime().optional(),
});

export type EvidenceReviewDto = z.infer<typeof evidenceReviewSchema>;
