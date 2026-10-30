import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { ApiClient } from '../../services/api';
import {
  X,
  Mail,
  Lock,
  User,
  Sparkles,
  Eye,
  EyeOff,
  Building2,
  Shield,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Check,
  RotateCw,
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ResendCountdownTimer } from './ResendCountdownTimer';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { setAuth } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register' | 'otp' | 'forgot' | 'google_complete'>('login');
  const [email, setEmail] = useState('admin@flowtrack.dev');
  const [password, setPassword] = useState('Password123!');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Registration specific fields
  const [fullName, setFullName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('9876543210');
  const [phoneProof, setPhoneProof] = useState<string | null>(null);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  // OTP flow state
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(0);
  const [isCooldownActive, setIsCooldownActive] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [canFallbackEmail, setCanFallbackEmail] = useState(false);
  const [devSimulationNotice, setDevSimulationNotice] = useState<string | null>(null);

  // Google completion specific fields
  const [googlePendingData, setGooglePendingData] = useState<{
    signupToken: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
  } | null>(null);

  // Password Recovery specific fields
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'reset'>('request');
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleGoogleSuccess = useCallback((authData: any) => {
    if (authData.status === 'PENDING_REGISTRATION') {
      setGooglePendingData({
        signupToken: authData.signupToken,
        email: authData.email,
        fullName: authData.fullName,
        avatarUrl: authData.avatarUrl,
      });
      setFullName(authData.fullName || '');
      setMode('google_complete');
      setError(null);
      return;
    }
    setAuth(authData.user, authData.accessToken, authData.activeWorkspaceId, authData.workspaces);
    onClose();
  }, [setAuth, onClose]);

  const handleGoogleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.login({ email: email.trim().toLowerCase(), password });
      setAuth(res.user, res.accessToken, res.activeWorkspaceId, res.workspaces);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRegistrationOtp = async (channel: 'whatsapp' | 'email' = 'whatsapp') => {
    const cleanDigits = phoneDigits.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanDigits)) {
      setError('Please provide a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).');
      return;
    }

    setLoading(true);
    setError(null);
    setDevSimulationNotice(null);
    try {
      const fullPhone = `+91${cleanDigits}`;
      const targetEmail = email || googlePendingData?.email;
      const res = await ApiClient.requestOtp(fullPhone, channel, targetEmail);
      if (!res || res.success === false) {
        throw new Error(res?.message || 'Failed to dispatch verification code. Please check configuration.');
      }
      setOtpSent(true);
      setOtpCooldownSeconds(res.resendCooldownSeconds || 45);
      setIsCooldownActive(true);
      if (res.channel === 'email' || channel === 'email') {
        setSuccessMessage('Verification code sent to your email.');
      } else {
        setSuccessMessage('Verification code sent on WhatsApp.');
      }
      if (res.isDevSimulation) {
        setDevSimulationNotice(
          res.devOtpCode
            ? `Dev Mode: OTP is ${res.devOtpCode} (logged to API server terminal)`
            : 'Dev Mode: Verification code is logged in the API server terminal.'
        );
      }
      if (res.canFallbackToEmail) {
        setCanFallbackEmail(true);
      }
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please try again.');
      setCanFallbackEmail(true);
      setOtpSent(false);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegistrationOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setVerifyingOtp(true);
    setError(null);
    try {
      const cleanDigits = phoneDigits.replace(/\D/g, '');
      const fullPhone = `+91${cleanDigits}`;
      const res = await ApiClient.verifyOtp(fullPhone, otpCode);

      if (res.phoneProof) {
        setPhoneProof(res.phoneProof);
        setIsPhoneVerified(true);
        setSuccessMessage('Mobile number verified successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Incorrect verification code. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Full name must be at least 2 characters');
      setLoading(false);
      return;
    }

    if (!isPhoneVerified || !phoneProof) {
      setError('Please verify your mobile number via OTP before creating your account.');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const cleanDigits = phoneDigits.replace(/\D/g, '');
      const fullPhone = `+91${cleanDigits}`;
      const res = await ApiClient.register({
        email: email.trim().toLowerCase(),
        password,
        fullName: fullName.trim(),
        phone: fullPhone,
        phoneProof,
      });

      setAuth(res.user, res.accessToken, res.activeWorkspaceId, [
        {
          id: res.activeWorkspaceId,
          name: `${res.user.fullName}'s Workspace`,
          slug: 'my-workspace',
          role: res.role || 'MEMBER',
        },
      ]);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteGoogleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googlePendingData?.signupToken) return;

    if (!isPhoneVerified || !phoneProof) {
      setError('Please verify your mobile number with OTP to finalize registration.');
      return;
    }

    if (password && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const cleanDigits = phoneDigits.replace(/\D/g, '');
      const fullPhone = `+91${cleanDigits}`;

      const res = await ApiClient.completeGoogleRegistration({
        signupToken: googlePendingData.signupToken,
        fullName: fullName.trim() || googlePendingData.fullName,
        phone: fullPhone,
        phoneProof,
        password: password || undefined,
      });

      setAuth(res.user, res.accessToken, res.activeWorkspaceId, res.workspaces);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to complete Google registration.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRecoveryNotice(null);

    try {
      const res = await ApiClient.forgotPassword(recoveryEmail.trim().toLowerCase());
      setRecoveryNotice(res.message);
      if (res.resetToken || res.devResetToken) {
        setRecoveryToken(res.resetToken || res.devResetToken);
        setRecoveryStep('reset');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch password recovery.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const res = await ApiClient.resetPassword({
        email: recoveryEmail.trim().toLowerCase(),
        token: recoveryToken.trim(),
        newPassword,
      });
      setSuccessMessage(res.message);
      setTimeout(() => {
        setMode('login');
        setSuccessMessage(null);
        setError(null);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div
        className="w-full max-w-[440px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {mode === 'login'
                ? t('login')
                : mode === 'register'
                ? 'Create an Account'
                : mode === 'google_complete'
                ? 'Finish Registration'
                : 'Account Recovery'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {mode === 'login'
                ? 'Access your visual project workflow workspace'
                : mode === 'register'
                ? 'Join your team on FlowTrack as a Member'
                : mode === 'google_complete'
                ? 'Verify your mobile number to complete setup'
                : 'Recover your password safely'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher (Login vs Sign Up) */}
        {mode !== 'forgot' && mode !== 'google_complete' && (
          <div className="p-1 mx-4 sm:mx-6 mt-4 bg-slate-100 dark:bg-slate-800 rounded-2xl flex text-xs font-semibold">
            <button
              id="tab-login-btn"
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl transition-all ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              id="tab-register-btn"
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl transition-all ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Form Body */}
        <div className="p-4 sm:p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words-safe">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* 1. SIGN IN VIEW */}
          {mode === 'login' && (
            <div className="space-y-4">
              <GoogleSignInButton
                mode="login"
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                disabled={loading}
              />

              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-white dark:bg-slate-900 px-2.5 text-slate-400 font-semibold tracking-wider">
                    or continue with email
                  </span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('email')}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      id="login-email-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="name@organization.com"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {t('password')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setRecoveryEmail(email);
                        setError(null);
                      }}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      id="login-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-9 pr-10 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer"
                >
                  {loading ? 'Signing In...' : t('login')}
                </button>

                <div className="pt-2 text-center text-xs text-slate-500">
                  New here?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError(null);
                    }}
                    className="font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Create an account
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 2. SIGN UP VIEW (MOBILE-FIRST WITH VERIFIED PHONE PROOF) */}
          {mode === 'register' && (
            <div className="space-y-4">
              <GoogleSignInButton
                mode="register"
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                disabled={loading}
              />

              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-white dark:bg-slate-900 px-2.5 text-slate-400 font-semibold tracking-wider">
                    or register with email & phone
                  </span>
                </div>
              </div>

              <form onSubmit={handleRegister} className="space-y-3.5">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      id="register-fullname-input"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Ramesh Kumar"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      id="register-email-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="ramesh@organization.in"
                    />
                  </div>
                </div>

                {/* Indian Mobile Number with Fixed +91 Prefix & OTP Verification */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    {isPhoneVerified && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <Check className="w-3.5 h-3.5" /> Verified
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                      <div className="flex items-center gap-1.5 px-2.5 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                        <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">IN</span>
                        <span>+91</span>
                      </div>
                      <input
                        id="register-phone-input"
                        type="tel"
                        maxLength={10}
                        value={phoneDigits}
                        onChange={(e) => {
                          setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10));
                          if (isPhoneVerified) {
                            setIsPhoneVerified(false);
                            setPhoneProof(null);
                            setOtpSent(false);
                          }
                        }}
                        disabled={isPhoneVerified}
                        required
                        className="flex-1 px-3 py-2 min-h-[44px] text-xs bg-transparent focus:outline-none font-mono"
                        placeholder="9876543210"
                      />
                    </div>

                    {!isPhoneVerified && (
                      <ResendCountdownTimer
                        initialCooldownSeconds={isCooldownActive ? otpCooldownSeconds : 0}
                        onCooldownEnd={() => setIsCooldownActive(false)}
                        onResend={() => handleSendRegistrationOtp('whatsapp')}
                        isSending={loading}
                        disabled={phoneDigits.length !== 10}
                        variant="button"
                      />
                    )}

                    {isPhoneVerified && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPhoneVerified(false);
                          setPhoneProof(null);
                          setOtpSent(false);
                          setOtpCode('');
                        }}
                        className="text-xs font-semibold text-slate-500 hover:text-blue-600 underline py-2 shrink-0 cursor-pointer"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    We'll send a 6-digit code to this number on WhatsApp.
                  </p>

                  {/* 6-Digit OTP verification inputs */}
                  {otpSent && !isPhoneVerified && (
                    <div className="mt-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Enter 6-Digit Verification Code
                        </span>
                        <ResendCountdownTimer
                          initialCooldownSeconds={isCooldownActive ? otpCooldownSeconds : 0}
                          onCooldownEnd={() => setIsCooldownActive(false)}
                          onResend={() => handleSendRegistrationOtp('whatsapp')}
                          isSending={loading}
                          variant="text"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="register-otp-input"
                          type="text"
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="flex-1 px-3 py-2 text-center text-sm font-mono tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[40px]"
                          placeholder="••••••"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyRegistrationOtp}
                          disabled={verifyingOtp || otpCode.length !== 6}
                          className="px-4 py-2 min-h-[40px] text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                        >
                          {verifyingOtp ? 'Verifying...' : 'Verify'}
                        </button>
                      </div>

                      {devSimulationNotice && (
                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                          {devSimulationNotice}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setOtpCode('');
                            setError(null);
                          }}
                          className="text-slate-500 hover:text-blue-600 underline cursor-pointer"
                        >
                          Change number
                        </button>
                        {(canFallbackEmail || email) && (
                          <button
                            type="button"
                            onClick={() => handleSendRegistrationOtp('email')}
                            disabled={loading || isCooldownActive}
                            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Get code via email
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Password & Confirm */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      id="register-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-9 pr-10 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Min 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Confirm Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      id="register-confirm-password-input"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full pl-9 pr-10 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Repeat password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Friendly Role Policy Notice */}
                <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <Shield className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                  <span>
                    You will join as a <strong>Member</strong>. Your organization administrator can adjust your role after onboarding.
                  </span>
                </div>

                <button
                  id="register-submit-btn"
                  type="submit"
                  disabled={loading || !isPhoneVerified}
                  className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 mt-2 flex items-center justify-center cursor-pointer"
                >
                  {loading ? 'Creating Account...' : 'Complete Registration'}
                </button>
              </form>
            </div>
          )}

          {/* 3. GOOGLE REGISTRATION COMPLETION VIEW */}
          {mode === 'google_complete' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300">
                <span className="font-bold">Google Identity Verified:</span> {googlePendingData?.email}
              </div>

              <form onSubmit={handleCompleteGoogleRegistration} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Mobile Phone Verification */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    {isPhoneVerified && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                        <Check className="w-3.5 h-3.5" /> Verified
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                      <div className="flex items-center gap-1.5 px-2.5 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                        <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">IN</span>
                        <span>+91</span>
                      </div>
                      <input
                        type="tel"
                        maxLength={10}
                        value={phoneDigits}
                        onChange={(e) => {
                          setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10));
                          if (isPhoneVerified) {
                            setIsPhoneVerified(false);
                            setPhoneProof(null);
                          }
                        }}
                        disabled={isPhoneVerified}
                        required
                        className="flex-1 px-3 py-2 min-h-[44px] text-xs bg-transparent focus:outline-none font-mono"
                        placeholder="9876543210"
                      />
                    </div>
                    {!isPhoneVerified && (
                      <ResendCountdownTimer
                        initialCooldownSeconds={isCooldownActive ? otpCooldownSeconds : 0}
                        onCooldownEnd={() => setIsCooldownActive(false)}
                        onResend={() => handleSendRegistrationOtp('whatsapp')}
                        isSending={loading}
                        disabled={phoneDigits.length !== 10}
                        variant="button"
                      />
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    We'll send a 6-digit code to this number on WhatsApp.
                  </p>

                  {otpSent && !isPhoneVerified && (
                    <div className="mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="flex-1 px-3 py-2 text-center text-sm font-mono tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="••••••"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyRegistrationOtp}
                          disabled={verifyingOtp || otpCode.length !== 6}
                          className="px-4 py-2 min-h-[38px] text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer"
                        >
                          Verify
                        </button>
                      </div>
                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setOtpCode('');
                            setError(null);
                          }}
                          className="text-slate-500 hover:text-blue-600 underline cursor-pointer"
                        >
                          Change number
                        </button>
                        {googlePendingData?.email && (
                          <button
                            type="button"
                            onClick={() => handleSendRegistrationOtp('email')}
                            disabled={loading || otpCooldown > 0}
                            className="text-blue-600 hover:underline cursor-pointer"
                          >
                            Get code via email
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Optional Fallback Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Set a Password <span className="text-slate-400 font-normal">(Optional fallback)</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Min 8 characters"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
                  <Shield className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                  <span>
                    You will join as a <strong>Member</strong>. Your administrator can promote you later.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading || !isPhoneVerified}
                  className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Finalizing Setup...' : 'Finish Registration'}
                </button>
              </form>
            </div>
          )}

          {/* 4. PASSWORD RECOVERY VIEW */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setRecoveryNotice(null);
                }}
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 flex items-center gap-1.5 py-1 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Sign In</span>
              </button>

              {recoveryStep === 'request' ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Enter your account's email address. If an account is found, instructions will be dispatched.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                      <input
                        type="email"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        required
                        className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="name@organization.com"
                      />
                    </div>
                  </div>

                  {recoveryNotice && (
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300">
                      {recoveryNotice}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Sending Instructions...' : 'Send Recovery Instructions'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Reset Token
                    </label>
                    <input
                      type="text"
                      value={recoveryToken}
                      onChange={(e) => setRecoveryToken(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 min-h-[44px] text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter the token received"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Min 8 characters"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Updating Password...' : 'Reset Password'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
