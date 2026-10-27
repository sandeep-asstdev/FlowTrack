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
  const hiddenButtonRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    let isMounted = true;

    // Only initialize Google Identity Services if a real, non-placeholder Client ID is configured.
    // Suppresses Google's 403 "The given client ID is not found" network error in development.
    if (isPlaceholderClientId(clientId)) {
      setGisReady(true);
      return;
    }

    const checkGis = () => {
      if (window.google?.accounts?.id && clientId) {
        if (!isMounted) return;
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          // Render hidden Google button for programmatic click trigger
          if (hiddenButtonRef.current) {
            hiddenButtonRef.current.innerHTML = '';
            window.google.accounts.id.renderButton(hiddenButtonRef.current, {
              type: 'standard',
              theme: 'outline',
              size: 'large',
              width: 380,
            });
          }

          setGisReady(true);
        } catch (e) {
          console.warn('Failed to initialize Google Identity Services:', e);
        }
      }
    };

    if (window.google?.accounts?.id) {
      checkGis();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          checkGis();
        }
      }, 200);

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
  }, [clientId, isPlaceholderClientId, handleCredentialResponse]);

  const handleCustomButtonClick = async () => {
    if (loading || disabled) return;

    // In development mode with placeholder Client ID, provide smooth local mock Google Sign In
    if (isPlaceholderClientId(clientId)) {
      if (isDev) {
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
        return;
      }

      onError('Google Client ID is not configured. Please set a valid VITE_GOOGLE_CLIENT_ID in .env.');
      return;
    }

    setLoading(true);

    // Try finding the native rendered button inside hidden container to trigger Google popup
    if (hiddenButtonRef.current) {
      const nativeBtn = hiddenButtonRef.current.querySelector('div[role=button], button') as HTMLElement;
      if (nativeBtn) {
        nativeBtn.click();
        // Reset loading state if user cancels or closes the popup without authenticating
        setTimeout(() => {
          setLoading(false);
        }, 12000);
        return;
      }
    }

    // Fallback to Google prompt
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setLoading(false);
            if (notification.getNotDisplayedReason() === 'suppressed_by_user') {
              onError('Google sign-in was dismissed.');
            }
          }
        });
      } catch (err: any) {
        setLoading(false);
        onError(err.message || 'Could not launch Google sign-in prompt.');
      }
    } else {
      setLoading(false);
      onError('Google Identity Services is still loading. Please check your internet connection.');
    }
  };


  const buttonText = loading
    ? 'Connecting to Google...'
    : mode === 'register'
    ? 'Sign up with Google'
    : 'Continue with Google';

  return (
    <div className="w-full">
      {/* Hidden container for Google Identity Services native button */}
      <div
        ref={hiddenButtonRef}
        aria-hidden="true"
        style={{ position: 'absolute', top: -9999, left: -9999, opacity: 0, pointerEvents: 'none' }}
      />

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
    </div>
  );
};
