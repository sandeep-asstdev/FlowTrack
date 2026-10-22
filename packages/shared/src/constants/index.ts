export const BUILTIN_NODE_TYPES = {
  TASK: 'task',
  STAGE: 'stage',
  APPROVAL: 'approval',
  DOCUMENT_REQUEST: 'doc_request',
  MILESTONE: 'milestone',
  NOTE: 'note',
} as const;

export const STATUS_CATEGORIES = {
  NOT_STARTED: 'not_started',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const;

export const DEFAULT_STATUSES = [
  { key: 'not_started', label: 'Not Started', colour: '#94a3b8', icon: 'Circle', category: STATUS_CATEGORIES.NOT_STARTED },
  { key: 'in_progress', label: 'In Progress', colour: '#3b82f6', icon: 'Clock', category: STATUS_CATEGORIES.ACTIVE },
  { key: 'waiting', label: 'Waiting', colour: '#f59e0b', icon: 'AlertTriangle', category: STATUS_CATEGORIES.BLOCKED },
  { key: 'done', label: 'Done', colour: '#10b981', icon: 'CheckCircle2', category: STATUS_CATEGORIES.DONE },
  { key: 'cancelled', label: 'Cancelled', colour: '#ef4444', icon: 'XCircle', category: STATUS_CATEGORIES.CANCELLED },
] as const;

export const MEMBERSHIP_ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  TEAM_LEAD: 'TEAM_LEAD',
  MEMBER: 'MEMBER',
  GUEST: 'GUEST',
} as const;

export const EDGE_KINDS = {
  SEQUENCE: 'sequence',
  DEPENDENCY: 'dependency',
  RELATED: 'related',
} as const;
