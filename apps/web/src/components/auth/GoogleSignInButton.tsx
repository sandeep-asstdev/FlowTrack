import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiClient } from '../../services/api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: (notificationCallback?: (notification: any) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  mode: 'login' | 'register';
  onSuccess: (authResponse: any) => void;
  onError: (errorMessage: string) => void;
  disabled?: boolean;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  mode,
  onSuccess,
  onError,
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const googleButtonContainerRef = useRef<HTMLDivElement>(null);
  const clientId =
    (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
    '954853707879-khbiv8su3of67ih08vfflpj2vanqbj2j.apps.googleusercontent.com';
  const isDev = Boolean((import.meta as any).env?.DEV);

  const isPlaceholderClientId = useCallback((id: string) => {
    if (!id || id.trim() === '') return true;
    return (
      id.includes('test-flowtrack-google-client-id') ||
      id.includes('your-google-client-id') ||
      id.includes('placeholder')
    );
  }, []);

  const handleCredentialResponse = useCallback(
    async (response: { credential?: string }) => {
      const idToken = response?.credential;
      if (!idToken) {
        setLoading(false);
        onError('No credential received from Google sign-in.');
        return;
      }

      try {
        setLoading(true);
        const authData = await ApiClient.loginWithGoogle(idToken);
        onSuccess(authData);
      } catch (err: any) {
        console.error('Google authentication failed:', err);
        onError(err.message || 'Google authentication failed. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onError]
  );

  const renderGoogleButton = useCallback(() => {
    if (!googleButtonContainerRef.current || !window.google?.accounts?.id || !clientId) {
      return;
    }

    try {
      const isDark = document.documentElement.classList.contains('dark');
      const containerWidth = googleButtonContainerRef.current.parentElement?.clientWidth || 360;
      const targetWidth = Math.min(380, Math.max(240, containerWidth - 4));

      googleButtonContainerRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonContainerRef.current, {
        type: 'standard',
        theme: isDark ? 'filled_black' : 'outline',
        size: 'large',
        text: mode === 'register' ? 'signup_with' : 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: targetWidth,
      });
      setGisReady(true);
    } catch (err) {
      console.warn('Failed to render Google Identity Services button:', err);
    }
  }, [clientId, mode]);

  useEffect(() => {
    let isMounted = true;

    if (isPlaceholderClientId(clientId)) {
      setGisReady(false);
      return;
    }

    const initGis = () => {
      if (window.google?.accounts?.id && clientId) {
        if (!isMounted) return;
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true, // FedCM opt-in to eliminate migration warning
          });

          renderGoogleButton();
        } catch (e) {
          console.warn('Failed to initialize Google Identity Services:', e);
        }
      }
    };

    if (window.google?.accounts?.id) {
      initGis();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initGis();
        }
      }, 150);

      const timeout = setTimeout(() => {
        clearInterval(interval);
      }, 5000);

      return () => {
        isMounted = false;
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [clientId, isPlaceholderClientId, handleCredentialResponse, renderGoogleButton]);

  const handleDevMockLogin = async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      const devToken = `dev-mock-google-token:alex.rivera@flowtrack.dev:Alex Rivera`;
      const authData = await ApiClient.loginWithGoogle(devToken);
      onSuccess(authData);
    } catch (err: any) {
      onError(err.message || 'Dev mock Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomButtonClick = async () => {
    if (loading || disabled) return;

    if (isPlaceholderClientId(clientId)) {
      if (isDev) {
        return handleDevMockLogin();
      }
      onError('Google Client ID is not configured. Please set a valid VITE_GOOGLE_CLIENT_ID in .env.');
      return;
    }

    if (!window.google?.accounts?.id) {
      onError('Google Identity Services is still loading or was blocked by a browser extension. Please check your network or ad-blocker.');
      return;
    }

    // Trigger FedCM-compliant prompt fallback
    setLoading(true);
    try {
      window.google.accounts.id.prompt((notification: any) => {
        // FedCM compliant notification handling without deprecated isNotDisplayed() / isSkippedMoment()
        if (notification.isDismissedMoment && notification.isDismissedMoment()) {
          setLoading(false);
          const reason = notification.getDismissedReason?.();
          if (reason === 'suppressed_by_user' || reason === 'tap_outside') {
            onError('Google sign-in was dismissed.');
          }
        }
      });
    } catch (err: any) {
      setLoading(false);
      onError(err.message || 'Could not launch Google sign-in prompt.');
    }
  };

  const buttonText = loading
    ? 'Connecting to Google...'
    : mode === 'register'
    ? 'Sign up with Google'
    : 'Continue with Google';

  const showCustomButton = !gisReady || isPlaceholderClientId(clientId);

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* Container for Google Identity Services official rendered button */}
      <div
        ref={googleButtonContainerRef}
        className={`w-full flex justify-center items-center min-h-[44px] ${
          showCustomButton ? 'hidden' : 'block'
        }`}
      />

      {/* Fallback custom button when GIS is loading, blocked, or in mock dev mode */}
      {showCustomButton && (
        <button
          id={`google-${mode}-btn`}
          type="button"
          onClick={handleCustomButtonClick}
          disabled={loading || disabled}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-100 text-xs font-bold shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
          ) : (
            <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          )}
          <span>{buttonText}</span>
        </button>
      )}

      {/* Dev mode instant mock login shortcut */}
      {isDev && (
        <button
          type="button"
          onClick={handleDevMockLogin}
          disabled={loading || disabled}
          className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors underline cursor-pointer"
        >
          Dev Quick Sign-In (Alex Rivera)
        </button>
      )}
    </div>
  );
};
