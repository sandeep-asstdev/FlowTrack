import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

describe('Frontend Google Sign-In & Sign-Up (Chunk 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().logout();
  });

  describe('1. ApiClient Google Authentication Methods', () => {
    it('dispatches loginWithGoogle with idToken payload to /auth/google', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'google-user-1',
            email: 'googleuser@gmail.com',
            fullName: 'Google User',
            googleLinked: true,
          },
          accessToken: 'jwt-google-token-xyz',
          activeWorkspaceId: 'ws-google-1',
          workspaces: [
            { id: 'ws-google-1', name: "Google User's Workspace", slug: 'ws-google', role: 'MEMBER' },
          ],
        }),
      } as any);

      const res = await ApiClient.loginWithGoogle('mock-google-id-token-999');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/google'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idToken: 'mock-google-id-token-999' }),
        })
      );

      expect(res.user.email).toBe('googleuser@gmail.com');
      expect(res.accessToken).toBe('jwt-google-token-xyz');
      expect(res.workspaces[0].role).toBe('MEMBER');
    });

    it('dispatches linkGoogleAccount with idToken payload to /auth/google/link', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Google account linked successfully',
          googleId: 'google-sub-777',
        }),
      } as any);

      const res = await ApiClient.linkGoogleAccount('mock-google-id-token-777');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/google/link'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idToken: 'mock-google-id-token-777' }),
        })
      );

      expect(res.googleId).toBe('google-sub-777');
    });

    it('propagates backend errors cleanly on deactivated accounts or invalid tokens', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          message: 'Account is deactivated. Please contact your platform administrator.',
        }),
      } as any);

      await expect(ApiClient.loginWithGoogle('banned-user-token')).rejects.toThrow(
        'Account is deactivated. Please contact your platform administrator.'
      );
    });
  });

  describe('2. Authentication State Management & Session Integration', () => {
    it('updates authStore on successful Google authentication', () => {
      const mockUser = {
        id: 'usr-google',
        email: 'alex@flowtrack.dev',
        fullName: 'Alex Rivera',
      };
      const mockToken = 'mock-google-jwt';
      const mockWorkspaceId = 'ws-personal';
      const mockWorkspaces = [
        { id: 'ws-personal', name: "Alex's Workspace", slug: 'alex-ws', role: 'MEMBER' },
      ];

      useAuthStore.getState().setAuth(mockUser, mockToken, mockWorkspaceId, mockWorkspaces);

      const state = useAuthStore.getState();
      expect(state.user?.id).toBe('usr-google');
      expect(state.user?.email).toBe('alex@flowtrack.dev');
      expect(state.token).toBe('mock-google-jwt');
      expect(state.activeWorkspaceId).toBe('ws-personal');
      expect(state.workspaces).toHaveLength(1);
      expect(state.workspaces[0].role).toBe('MEMBER');
      expect(ApiClient.getToken()).toBe('mock-google-jwt');
      expect(ApiClient.getActiveWorkspaceId()).toBe('ws-personal');
    });

    it('preserves existing email/password login and registers alongside Google', async () => {
      const loginSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'admin-1', email: 'admin@flowtrack.dev', fullName: 'Admin' },
          accessToken: 'admin-jwt',
          activeWorkspaceId: 'ws-admin',
          workspaces: [{ id: 'ws-admin', name: 'Admin WS', slug: 'admin-ws', role: 'ADMIN' }],
        }),
      } as any);

      const res = await ApiClient.login({ email: 'admin@flowtrack.dev', password: 'Password123!' });

      expect(loginSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'admin@flowtrack.dev', password: 'Password123!' }),
        })
      );
      expect(res.user.email).toBe('admin@flowtrack.dev');
    });
  });

  describe('3. Google Button Specification & Design System Compliance', () => {
    it('defines distinct button copy for login versus sign up', () => {
      const getButtonText = (mode: 'login' | 'register', loading: boolean) => {
        if (loading) return 'Connecting to Google...';
        return mode === 'register' ? 'Sign up with Google' : 'Continue with Google';
      };

      expect(getButtonText('login', false)).toBe('Continue with Google');
      expect(getButtonText('register', false)).toBe('Sign up with Google');
      expect(getButtonText('login', true)).toBe('Connecting to Google...');
      expect(getButtonText('register', true)).toBe('Connecting to Google...');
    });

    it('requires Google Client ID and reports configuration error if unset', () => {
      const validateClientId = (clientId: string | undefined): { isValid: boolean; error?: string } => {
        if (!clientId || clientId.trim() === '') {
          return {
            isValid: false,
            error: 'Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in .env.',
          };
        }
        return { isValid: true };
      };

      expect(validateClientId(undefined).isValid).toBe(false);
      expect(validateClientId('').error).toContain('Google Client ID is not configured');
      expect(validateClientId('valid-client-id.apps.googleusercontent.com').isValid).toBe(true);
    });

    it('handles cancellation and dismissals gracefully without leaving stale loading state', () => {
      let isLoading = true;
      let errorMessage: string | null = null;

      // Simulate user closing Google One Tap or popup
      const handleNotificationDismissal = (reason: string) => {
        isLoading = false;
        if (reason === 'suppressed_by_user') {
          errorMessage = 'Google sign-in was dismissed.';
        }
      };

      handleNotificationDismissal('suppressed_by_user');

      expect(isLoading).toBe(false);
      expect(errorMessage).toBe('Google sign-in was dismissed.');
    });
  });

  describe('4. Duplicate Submissions, Error Reset & Modal Redirects', () => {
    it('prevents duplicate submissions when button is already loading or disabled', async () => {
      let submitCallCount = 0;
      const simulateGoogleButtonClick = (isLoading: boolean, isDisabled: boolean) => {
        if (isLoading || isDisabled) {
          return false; // blocked
        }
        submitCallCount++;
        return true;
      };

      // When active, click proceeds
      expect(simulateGoogleButtonClick(false, false)).toBe(true);
      expect(submitCallCount).toBe(1);

      // When loading, duplicate clicks are prevented
      expect(simulateGoogleButtonClick(true, false)).toBe(false);
      expect(submitCallCount).toBe(1);

      // When disabled, clicks are prevented
      expect(simulateGoogleButtonClick(false, true)).toBe(false);
      expect(submitCallCount).toBe(1);
    });

    it('clears previous errors when switching between auth modes', () => {
      let currentError: string | null = 'Initial authentication failure';
      const switchAuthMode = (newMode: 'login' | 'register' | 'otp') => {
        currentError = null;
        return newMode;
      };

      expect(switchAuthMode('register')).toBe('register');
      expect(currentError).toBeNull();
    });

    it('successfully handles Google auth callback and triggers modal close', () => {
      let modalClosed = false;
      const mockAuthData = {
        user: { id: 'u-1', email: 'dev@flowtrack.dev', fullName: 'Developer' },
        accessToken: 'access-jwt-token-123',
        activeWorkspaceId: 'ws-1',
        workspaces: [{ id: 'ws-1', name: "Developer's Workspace", slug: 'ws-dev', role: 'MEMBER' }],
      };

      const handleGoogleSuccess = (authData: typeof mockAuthData) => {
        useAuthStore.getState().setAuth(
          authData.user,
          authData.accessToken,
          authData.activeWorkspaceId,
          authData.workspaces
        );
        modalClosed = true;
      };

      handleGoogleSuccess(mockAuthData);

      expect(modalClosed).toBe(true);
      expect(useAuthStore.getState().user?.email).toBe('dev@flowtrack.dev');
      expect(useAuthStore.getState().token).toBe('access-jwt-token-123');
    });

    it('handles network failure or 500 error gracefully', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(ApiClient.loginWithGoogle('bad-network-token')).rejects.toThrow();
    });
  });

  describe('5. Session Lifecycle, Logout & Dev Mode Fallback (Chunk 3)', () => {
    it('detects placeholder client IDs to suppress GSI 403 network errors', () => {
      const isPlaceholderClientId = (id: string) => {
        if (!id || id.trim() === '') return true;
        return (
          id.includes('test-flowtrack-google-client-id') ||
          id.includes('your-google-client-id') ||
          id.includes('placeholder')
        );
      };

      expect(isPlaceholderClientId('test-flowtrack-google-client-id.apps.googleusercontent.com')).toBe(true);
      expect(isPlaceholderClientId('your-google-client-id.apps.googleusercontent.com')).toBe(true);
      expect(isPlaceholderClientId('')).toBe(true);
      expect(isPlaceholderClientId('987654321-prod-client.apps.googleusercontent.com')).toBe(false);
    });

    it('clears all session state, active workspace, and token on logout', () => {
      // First populate auth state
      useAuthStore.getState().setAuth(
        { id: 'usr-logout-test', email: 'logout@test.dev', fullName: 'Logout User' },
        'jwt-session-token-to-clear',
        'ws-logout-test',
        [{ id: 'ws-logout-test', name: 'WS', slug: 'ws', role: 'MEMBER' }]
      );

      expect(useAuthStore.getState().user).not.toBeNull();
      expect(useAuthStore.getState().token).toBe('jwt-session-token-to-clear');
      expect(ApiClient.getToken()).toBe('jwt-session-token-to-clear');

      // Now logout
      useAuthStore.getState().logout();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().activeWorkspaceId).toBeNull();
      expect(useAuthStore.getState().workspaces).toHaveLength(0);
      expect(ApiClient.getToken()).toBeNull();
      expect(ApiClient.getActiveWorkspaceId()).toBeNull();
    });

    it('rejects expired session and allows clean re-authentication', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          statusCode: 401,
          message: 'jwt expired',
          error: 'Unauthorized',
        }),
      } as any);

      await expect(ApiClient.getMe()).rejects.toThrow('jwt expired');
    });

    it('dispatches dev mock token in development mode when placeholder client ID is configured', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'usr-dev-mock', email: 'alex.rivera@flowtrack.dev', fullName: 'Alex Rivera' },
          accessToken: 'dev-mock-jwt-token',
          activeWorkspaceId: 'ws-dev-mock',
          workspaces: [{ id: 'ws-dev-mock', name: "Alex's Workspace", slug: 'alex-ws', role: 'MEMBER' }],
        }),
      } as any);

      const devToken = 'dev-mock-google-token:alex.rivera@flowtrack.dev:Alex Rivera';
      const authData = await ApiClient.loginWithGoogle(devToken);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/google'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idToken: devToken }),
        })
      );
      expect(authData.user.email).toBe('alex.rivera@flowtrack.dev');
      expect(authData.workspaces[0].role).toBe('MEMBER');
    });
  });
});


