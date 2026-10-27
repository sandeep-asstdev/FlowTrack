import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { ApiClient } from '../../services/api';
import {
  X,
  Mail,
  Lock,
  Phone,
  User,
  KeyRound,
  Sparkles,
  Eye,
  EyeOff,
  Building2,
  Shield,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { setAuth } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register' | 'otp' | 'forgot'>('login');
  const [email, setEmail] = useState('admin@flowtrack.dev');
  const [password, setPassword] = useState('Password123!');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Registration specific fields
  const [fullName, setFullName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('9876543210');
  const [requestedRole, setRequestedRole] = useState<'MEMBER' | 'TEAM_LEAD' | 'MANAGER'>('MEMBER');
  const [workspaceName, setWorkspaceName] = useState('');

  // Password Recovery specific fields
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'reset'>('request');
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  // OTP
  const [phone, setPhone] = useState('+919876543210');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSuccess = (authData: any) => {
    setAuth(authData.user, authData.accessToken, authData.activeWorkspaceId, authData.workspaces);
    onClose();
  };

  const handleGoogleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.login({ email: email.trim(), password });
      setAuth(res.user, res.accessToken, res.activeWorkspaceId, res.workspaces);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Invalid credentials or account inaccessible.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Frontend validation
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Full name must be at least 2 characters');
      setLoading(false);
      return;
    }

    const cleanPhoneDigits = phoneDigits.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhoneDigits)) {
      setError('Please provide a valid 10-digit Indian mobile number (must start with 6, 7, 8, or 9).');
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
      const fullPhone = `+91${cleanPhoneDigits}`;
      const res = await ApiClient.register({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        phone: fullPhone,
        requestedRole,
        workspaceName: workspaceName.trim() || undefined,
      });

      setAuth(res.user, res.accessToken, res.activeWorkspaceId, [
        {
          id: res.activeWorkspaceId,
          name: workspaceName.trim() || `${res.user.fullName}'s Workspace`,
          slug: 'my-workspace',
          role: res.role || requestedRole,
        },
      ]);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
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
      const res = await ApiClient.forgotPassword(recoveryEmail.trim());
      setRecoveryNotice(res.message);
      if (res.resetToken) {
        setRecoveryToken(res.resetToken);
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
        email: recoveryEmail.trim(),
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

  const handleSendOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      await ApiClient.requestOtp(phone);
      setOtpSent(true);
      setOtp('123456'); // pre-fill dev mock OTP
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.verifyOtp(phone, otp);
      setAuth(res.user, res.accessToken, res.activeWorkspaceId, res.workspaces);
      onClose();
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Header */}
        <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
              {mode === 'login' && t('login')}
              {mode === 'register' && t('signup')}
              {mode === 'otp' && 'Fast Phone OTP Sign In'}
              {mode === 'forgot' && 'Password Recovery'}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Access your visual node canvas workspace
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Close dialog"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (min 44px touch targets) */}
        {mode !== 'forgot' ? (
          <div className="flex border-b border-slate-100 dark:border-slate-800 p-1.5 bg-slate-50 dark:bg-slate-950 gap-1">
            <button
              id="tab-auth-login"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2.5 min-h-[44px] flex items-center justify-center text-xs font-semibold rounded-xl transition-all ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {t('login')}
            </button>
            <button
              id="tab-auth-register"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2.5 min-h-[44px] flex items-center justify-center text-xs font-semibold rounded-xl transition-all ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {t('signup')}
            </button>
            <button
              id="tab-auth-otp"
              onClick={() => {
                setMode('otp');
                setError(null);
              }}
              className={`flex-1 py-2.5 min-h-[44px] flex items-center justify-center text-xs font-semibold rounded-xl transition-all gap-1 ${
                mode === 'otp'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>OTP</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <button
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5 py-1.5 min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Sign In</span>
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

          {/* LOGIN VIEW */}
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
                      placeholder="admin@flowtrack.dev"
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
                  <div className="text-[11px] text-slate-400 mt-1">
                    Default seed admin:{' '}
                    <code className="text-blue-600 dark:text-blue-400">admin@flowtrack.dev</code> /{' '}
                    <code className="text-blue-600 dark:text-blue-400">Password123!</code>
                  </div>
                </div>

                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? 'Signing In...' : t('login')}
                </button>
              </form>
            </div>
          )}

          {/* REGISTRATION VIEW */}
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
                    or register with email & mobile
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

                {/* Indian Mobile Number with Fixed +91 Prefix */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Indian Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                      <span className="text-base leading-none">🇮🇳</span>
                      <span>+91</span>
                    </div>
                    <input
                      id="register-phone-input"
                      type="tel"
                      maxLength={10}
                      value={phoneDigits}
                      onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      required
                      className="flex-1 px-3 py-2.5 min-h-[44px] text-xs bg-transparent focus:outline-none font-mono"
                      placeholder="9876543210"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Fixed +91 prefix followed by 10 digits starting with 6, 7, 8, or 9
                  </p>
                </div>

                {/* Requested Role & Organization */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Requested Role
                    </label>
                    <select
                      id="register-role-select"
                      value={requestedRole}
                      onChange={(e) => setRequestedRole(e.target.value as any)}
                      className="w-full px-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="MEMBER">Member (Contributor / Assignee)</option>
                      <option value="TEAM_LEAD">Team Lead (Approver)</option>
                      <option value="MANAGER">Manager (Approver)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Organization / Workspace
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                      <input
                        id="register-workspace-input"
                        type="text"
                        value={workspaceName}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Apex Enterprises"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-[11px] text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Security Policy:</strong> Public signup allows registering as Member, Team Lead, or Manager. Platform Admin roles require explicit authorization by existing administrators.
                  </span>
                </div>

                {/* Password & Confirm Password */}
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

                <button
                  id="register-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 mt-3 flex items-center justify-center"
                >
                  {loading ? 'Registering Account...' : 'Complete Registration'}
                </button>
              </form>
            </div>
          )}

          {/* FORGOT PASSWORD VIEW */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              {recoveryNotice && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{recoveryNotice}</span>
                </div>
              )}

              {recoveryStep === 'request' ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Enter the email associated with your FlowTrack account. We will issue a secure,
                    single-use recovery token.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Account Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                      <input
                        type="email"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        required
                        className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? 'Dispatching Token...' : 'Send Recovery Instructions'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Recovery Token
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                      <input
                        type="text"
                        value={recoveryToken}
                        onChange={(e) => setRecoveryToken(e.target.value)}
                        required
                        className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter token from email"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Min 8 characters"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? 'Updating Password...' : 'Save New Password & Sign In'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* OTP VIEW */}
          {mode === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('phone')}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      placeholder="+919876543210"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={loading}
                    className="px-3.5 py-2 min-h-[44px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center justify-center"
                  >
                    Send OTP
                  </button>
                </div>
              </div>

              {otpSent && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Enter 6-Digit OTP
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center text-sm"
                      placeholder="123456"
                    />
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                    {t('otpHint')}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !otpSent}
                className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? 'Verifying...' : 'Verify & Enter Workspace'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
