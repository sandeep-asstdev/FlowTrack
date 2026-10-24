import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../services/api';
import { socketService } from '../../services/socket';

describe('Collaboration, Evidence & Realtime Notifications Frontend', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  describe('ApiClient Document & Notification Endpoints', () => {
    it('generates secure authenticated download URL without raw file paths', () => {
      const url = ApiClient.getDocumentDownloadUrl('node-100', 'doc-555');
      expect(url).toContain('/nodes/node-100/documents/doc-555/download');
      expect(url).not.toContain('C:');
      expect(url).not.toContain('vault_storage');
    });

    it('dispatches evidence verification review payload correctly', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'doc-1',
          metadata: { evidenceVerification: { status: 'APPROVED', feedback: 'Verified by Lead' } },
        }),
      } as any);

      const res = await ApiClient.verifyEvidence('doc-1', {
        decision: 'APPROVED',
        feedback: 'Verified by Lead',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/documents/doc-1/verify-evidence'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ decision: 'APPROVED', feedback: 'Verified by Lead' }),
        })
      );
      expect(res.metadata.evidenceVerification.status).toBe('APPROVED');
    });

    it('queries project audit history with action filters', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ id: 'audit-1', action: 'STATUS_CHANGE' }],
          total: 1,
        }),
      } as any);

      await ApiClient.getProjectHistory('proj-1', { limit: 20, action: 'STATUS_CHANGE' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/projects/proj-1/history?limit=20&action=STATUS_CHANGE'),
        expect.anything()
      );
    });

    it('marks notification as read', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, unreadCount: 0 }),
      } as any);

      await ApiClient.markNotificationRead('notif-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/notifications/notif-1/read'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('Real-Time Socket Service', () => {
    it('provides project and user room subscription handlers', () => {
      const mockSocket = {
        connected: true,
        emit: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        disconnect: vi.fn(),
      };

      (socketService as any).socket = mockSocket;

      socketService.joinProject('project-alpha');
      expect(mockSocket.emit).toHaveBeenCalledWith('join:project', { projectId: 'project-alpha' });

      socketService.joinUser('user-alpha');
      expect(mockSocket.emit).toHaveBeenCalledWith('join:user', { userId: 'user-alpha' });

      const callback = vi.fn();
      const unsub = socketService.on('node:updated', callback);
      expect(mockSocket.on).toHaveBeenCalledWith('node:updated', callback);

      unsub();
      expect(mockSocket.off).toHaveBeenCalledWith('node:updated', callback);
    });
  });
});
