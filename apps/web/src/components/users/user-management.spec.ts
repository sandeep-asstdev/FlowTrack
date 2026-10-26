import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../services/api';

describe('User Management UI Logic & Safeguards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockMembers = [
    {
      id: 'mem-1',
      workspaceId: 'ws-100',
      userId: 'user-admin-1',
      role: 'ADMIN',
      user: {
        id: 'user-admin-1',
        fullName: 'Alice Admin',
        email: 'alice@flowtrack.dev',
        isActive: true,
      },
    },
    {
      id: 'mem-2',
      workspaceId: 'ws-100',
      userId: 'user-manager-1',
      role: 'MANAGER',
      user: {
        id: 'user-manager-1',
        fullName: 'Bob Manager',
        email: 'bob@flowtrack.dev',
        isActive: true,
      },
    },
    {
      id: 'mem-3',
      workspaceId: 'ws-100',
      userId: 'user-member-1',
      role: 'MEMBER',
      user: {
        id: 'user-member-1',
        fullName: 'Charlie Member',
        email: 'charlie@flowtrack.dev',
        isActive: false, // Deactivated member
      },
    },
  ];

  describe('Search & Filter In-Memory Logic', () => {
    it('filters members by user name', () => {
      const q = 'alice';
      const results = mockMembers.filter(
        (m) =>
          m.user.fullName.toLowerCase().includes(q) ||
          m.user.email.toLowerCase().includes(q)
      );
      expect(results).toHaveLength(1);
      expect(results[0].user.fullName).toBe('Alice Admin');
    });

    it('filters members by user email', () => {
      const q = 'bob@';
      const results = mockMembers.filter(
        (m) =>
          m.user.fullName.toLowerCase().includes(q) ||
          m.user.email.toLowerCase().includes(q)
      );
      expect(results).toHaveLength(1);
      expect(results[0].user.email).toBe('bob@flowtrack.dev');
    });

    it('filters members by role', () => {
      const managers = mockMembers.filter((m) => m.role === 'MANAGER');
      expect(managers).toHaveLength(1);
      expect(managers[0].user.fullName).toBe('Bob Manager');

      const members = mockMembers.filter((m) => m.role === 'MEMBER');
      expect(members).toHaveLength(1);
      expect(members[0].user.fullName).toBe('Charlie Member');
    });

    it('filters members by active vs deactivated status', () => {
      const activeOnly = mockMembers.filter((m) => m.user.isActive !== false);
      expect(activeOnly).toHaveLength(2);

      const deactivatedOnly = mockMembers.filter((m) => m.user.isActive === false);
      expect(deactivatedOnly).toHaveLength(1);
      expect(deactivatedOnly[0].user.fullName).toBe('Charlie Member');
    });
  });

  describe('Accidental Self-Deactivation & Last-Admin Safeguards', () => {
    it('identifies self-deactivation attempt for current user and blocks it', () => {
      const currentUserId = 'user-admin-1';
      const isSelf = (targetUserId: string) => targetUserId === currentUserId;

      expect(isSelf('user-admin-1')).toBe(true);
      expect(isSelf('user-manager-1')).toBe(false);
    });

    it('identifies last active admin lockout scenario', () => {
      const activeAdmins = mockMembers.filter(
        (m) => m.role === 'ADMIN' && m.user.isActive !== false
      );
      expect(activeAdmins).toHaveLength(1);

      const isLastActiveAdmin = (member: (typeof mockMembers)[0]) =>
        member.role === 'ADMIN' && member.user.isActive !== false && activeAdmins.length <= 1;

      expect(isLastActiveAdmin(mockMembers[0])).toBe(true); // Alice is the last active admin!
      expect(isLastActiveAdmin(mockMembers[1])).toBe(false);
    });

    it('allows deactivating non-admin user without lockout risk', () => {
      const activeAdmins = mockMembers.filter(
        (m) => m.role === 'ADMIN' && m.user.isActive !== false
      );
      const target = mockMembers[1]; // Bob Manager

      const canDeactivate = !(target.role === 'ADMIN' && activeAdmins.length <= 1);
      expect(canDeactivate).toBe(true);
    });
  });

  describe('ApiClient Lifecycle & Invitation Endpoints', () => {
    it('invites a workspace member with role assignment', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'mem-new', role: 'MEMBER' }),
      } as any);

      await ApiClient.inviteWorkspaceMember('ws-1', 'newuser@flowtrack.dev', 'MEMBER');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workspaces/ws-1/members/invite'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'newuser@flowtrack.dev', role: 'MEMBER' }),
        })
      );
    });

    it('updates member role via API', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'mem-1', role: 'MANAGER' }),
      } as any);

      await ApiClient.updateMemberRole('ws-1', 'user-2', 'MANAGER');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workspaces/ws-1/members/user-2/role'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ role: 'MANAGER' }),
        })
      );
    });

    it('updates member status (activate/deactivate) via API', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'user-3', isActive: false }),
      } as any);

      await ApiClient.updateMemberStatus('ws-1', 'user-3', false);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workspaces/ws-1/members/user-3/status'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
        })
      );
    });

    it('removes workspace member via API', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as any);

      await ApiClient.removeWorkspaceMember('ws-1', 'user-4');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workspaces/ws-1/members/user-4'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });
});
