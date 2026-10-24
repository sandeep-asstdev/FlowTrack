import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentsService } from './documents.service';
import { BadRequestException } from '@nestjs/common';

describe('DocumentsService & Security Validation', () => {
  let service: DocumentsService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockNotifications: any;
  let mockGateway: any;

  beforeEach(() => {
    mockPrisma = {
      node: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'node-1',
          workspaceId: 'ws-1',
          projectId: 'proj-1',
          title: 'Foundation Design',
          reviewerId: 'reviewer-1',
        }),
      },
      membership: {
        findUnique: vi.fn().mockResolvedValue({
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: 'ADMIN',
        }),
      },
      document: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        create: vi.fn().mockImplementation((args) => Promise.resolve({
          id: 'doc-1',
          ...args.data,
          fileSize: BigInt(args.data.fileSize),
        })),
        update: vi.fn().mockImplementation((args) => Promise.resolve({
          id: args.where.id,
          ...args.data,
          fileSize: BigInt(1024),
        })),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    mockNotifications = {
      sendNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    mockGateway = {
      broadcastToProject: vi.fn(),
    };

    service = new DocumentsService(
      mockPrisma,
      mockAudit as any,
      mockNotifications as any,
      mockGateway as any
    );
  });

  describe('Security Constraints (Requirements 3 & 4)', () => {
    it('rejects forbidden executable and script files (.exe, .bat, .sh)', async () => {
      await expect(
        service.addDocument('node-1', 'user-1', {
          name: 'malicious_script.bat',
          mimeType: 'text/plain',
          fileSize: 1024,
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.addDocument('node-1', 'user-1', {
          name: 'payload.exe',
          mimeType: 'application/x-msdownload',
          fileSize: 1024,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects files exceeding maximum size limit (25MB)', async () => {
      const oversizedBytes = 26 * 1024 * 1024; // 26MB

      await expect(
        service.addDocument('node-1', 'user-1', {
          name: 'huge_archive.zip',
          mimeType: 'application/zip',
          fileSize: oversizedBytes,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Versioning & Evidence Verification (Requirement 4)', () => {
    it('increments version number when uploading a revised document with the same name', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce({
        id: 'doc-v1',
        name: 'Technical_Spec.pdf',
        version: 1,
      });

      const result = await service.addDocument('node-1', 'user-1', {
        name: 'Technical_Spec.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        category: 'deliverable',
      });

      expect(mockPrisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 2,
            category: 'deliverable',
          }),
        })
      );
      expect(result.version).toBe(2);
    });

    it('records evidence review verification decision and notifies uploader', async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce({
        id: 'evidence-doc-1',
        workspaceId: 'ws-1',
        name: 'Site_Inspection_Photo.png',
        uploadedBy: 'engineer-1',
        metadata: {},
        node: {
          id: 'node-1',
          projectId: 'proj-1',
          title: 'Site Prep',
          reviewerId: 'reviewer-1',
        },
      });

      mockPrisma.membership.findUnique.mockResolvedValueOnce({
        role: 'MANAGER',
      });

      const review = await service.verifyEvidence('evidence-doc-1', 'reviewer-1', {
        decision: 'APPROVED',
        feedback: 'Quality inspection passed with no defects.',
      });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EVIDENCE_APPROVED',
        })
      );
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'engineer-1',
          type: 'APPROVAL_DECISION',
        })
      );
    });
  });
});
