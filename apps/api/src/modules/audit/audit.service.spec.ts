import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService, sanitizeAuditData } from './audit.service';

describe('AuditService & Data Sanitization', () => {
  let auditService: AuditService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: 'audit-1', ...args.data })),
        findMany: vi.fn().mockResolvedValue([
          { id: 'log-1', action: 'STATUS_CHANGE', entityName: 'Node' },
          { id: 'log-2', action: 'ASSIGNMENT_CHANGE', entityName: 'Node' },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
    };

    auditService = new AuditService(mockPrisma);
  });

  describe('sanitizeAuditData()', () => {
    it('redacts sensitive credentials, tokens, and keys from audit payloads', () => {
      const input = {
        title: 'Launch Preparation',
        password: 'SuperSecretPassword123!',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        apiKey: 'sk-proj-998877665544',
        nested: {
          authorization: 'Bearer secret_access_token',
          safeField: 'This should stay unchanged',
        },
        regularArray: [1, 2, { secret: 'do-not-leak' }],
      };

      const sanitized = sanitizeAuditData(input);

      expect(sanitized.title).toBe('Launch Preparation');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.passwordHash).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.nested.authorization).toBe('[REDACTED]');
      expect(sanitized.nested.safeField).toBe('This should stay unchanged');
      expect(sanitized.regularArray[2].secret).toBe('[REDACTED]');
    });

    it('handles null, undefined, and non-object values safely', () => {
      expect(sanitizeAuditData(null)).toBeNull();
      expect(sanitizeAuditData(undefined)).toBeNull();
      expect(sanitizeAuditData('plain string')).toBe('plain string');
      expect(sanitizeAuditData(42)).toBe(42);
    });
  });

  describe('AuditService.log()', () => {
    it('sanitizes oldValues and newValues before writing to database', async () => {
      await auditService.log({
        workspaceId: 'ws-100',
        projectId: 'proj-100',
        entityName: 'User',
        entityId: 'user-100',
        actorId: 'admin-1',
        action: 'USER_UPDATE',
        oldValues: { email: 'old@test.com', password: 'oldPassword' },
        newValues: { email: 'new@test.com', password: 'newPassword' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
      const callArgs = mockPrisma.auditLog.create.mock.calls[0][0];

      expect(callArgs.data.workspaceId).toBe('ws-100');
      expect(callArgs.data.oldValues.password).toBe('[REDACTED]');
      expect(callArgs.data.newValues.password).toBe('[REDACTED]');
      expect(callArgs.data.newValues.email).toBe('new@test.com');
    });
  });

  describe('AuditService history queries', () => {
    it('retrieves project audit history with pagination', async () => {
      const history = await auditService.getProjectHistory('proj-100', { limit: 10, offset: 0 });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: 'proj-100' },
          take: 10,
          skip: 0,
        })
      );
      expect(history.total).toBe(2);
      expect(history.items).toHaveLength(2);
    });
  });
});
