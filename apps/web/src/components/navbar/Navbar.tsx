import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import {
  Layers,
  ChevronDown,
  Globe,
  Bell,
  LogOut,
  Plus,
  Moon,
  Sun,
  User as UserIcon,
  Check,
  Shield,
  ShieldAlert,
  Menu,
  X,
  FolderKanban,
  CheckSquare,
  BarChart3,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { getRolePermissions, UserRole } from '../../utils/permissions';
import { NotificationDrawer } from '../notifications/NotificationDrawer';
import { ApiClient } from '../../services/api';
import { socketService } from '../../services/socket';

interface NavbarProps {
  onOpenAuth: () => void;
  onOpenCreateWorkspace: () => void;
  currentView: 'dashboard' | 'canvas' | 'reports' | 'users' | 'approvals' | 'my-work';
  onViewChange: (view: 'dashboard' | 'canvas' | 'reports' | 'users' | 'approvals' | 'my-work') => void;
  projectName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAuth,
  onOpenCreateWorkspace,
  currentView,
  onViewChange,
  projectName,
}) => {
  const { t, i18n } = useTranslation();
  const {
    user,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    logout,
    getActiveRole,
    setSimulatedRole,
    simulatedRole,
  } = useAuthStore();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Close menus on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileDrawerOpen(false);
        setShowWsMenu(false);
        setShowRoleMenu(false);
        setShowLangMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Prevent background scroll and touch bleed when mobile drawer is open
  useEffect(() => {
    if (mobileDrawerOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [mobileDrawerOpen]);

  useEffect(() => {
    if (user) {
      ApiClient.getNotifications({ read: false, limit: 1 })
        .then((res) => {
          if (res && res.unreadCount !== undefined) {
            setUnreadCount(res.unreadCount);
          }
        })
        .catch(() => null);

      const unsub = socketService.on('notification:received', () => {
        setUnreadCount((c) => c + 1);
      });

      return () => {
        unsub();
      };
    }
  }, [user]);

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const currentRole = getActiveRole();
  const permissions = getRolePermissions(currentRole);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.classList.remove('dark');
    }
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setShowLangMenu(false);
  };

  const handleMobileNav = (view: 'dashboard' | 'canvas' | 'reports' | 'users' | 'approvals' | 'my-work') => {
    onViewChange(view);
    setMobileDrawerOpen(false);
  };

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left: Mobile Hamburger, Brand & Desktop Navigation */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        {/* Mobile Hamburger Button (<lg screens, min 44x44px touch target) */}
        <button
          id="mobile-nav-toggle-btn"
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="lg:hidden w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors shrink-0"
          title="Open Navigation Menu"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand Logo & Name */}
        <button
          onClick={() => onViewChange('dashboard')}
          className="flex items-center gap-2 text-blue-600 dark:text-blue-400 group text-left min-w-0 shrink-0"
        >
          <div className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm sm:text-base leading-tight tracking-tight text-slate-900 dark:text-white truncate">
              {t('appName')}
            </div>
            <div className="hidden sm:block text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
              {t('tagline')}
            </div>
          </div>
        </button>

        {/* Workspace Switcher (Desktop >= md screens) */}
        {user && (
          <div className="relative hidden md:block">
            <button
              id="desktop-ws-switcher-btn"
              onClick={() => setShowWsMenu(!showWsMenu)}
              className="flex items-center gap-2 px-3 py-1.5 min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="max-w-[130px] truncate">{activeWs?.name || 'Select Workspace'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {showWsMenu && (
              <div className="absolute top-full left-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  {t('workspace')}
                </div>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      setActiveWorkspace(ws.id);
                      setShowWsMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                  >
                    <span className="truncate">{ws.name}</span>
                    {ws.id === activeWorkspaceId && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                ))}
                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
                <button
                  onClick={() => {
                    setShowWsMenu(false);
                    onOpenCreateWorkspace();
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  {t('createWorkspace')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* View Switcher: Projects / My Tasks / Team / Reports (Desktop >= lg screens) */}
        {user && (
          <nav
            aria-label="Desktop Primary Navigation"
            className="hidden lg:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs font-bold"
          >
            <button
              id="desktop-nav-projects-btn"
              onClick={() => onViewChange('dashboard')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                currentView === 'dashboard'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Projects
            </button>
            <button
              id="desktop-nav-my-work-btn"
              onClick={() => onViewChange('my-work')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                currentView === 'my-work'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              My Tasks
            </button>
            {(currentRole === 'ADMIN' || currentRole === 'MANAGER') && (
              <button
                id="desktop-nav-users-btn"
                onClick={() => onViewChange('users')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  currentView === 'users'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Team
              </button>
            )}
            {(currentRole === 'ADMIN' || currentRole === 'MANAGER') && (
              <button
                id="desktop-nav-reports-btn"
                onClick={() => onViewChange('reports')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  currentView === 'reports'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Reports
              </button>
            )}
          </nav>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Active Role Selector (Desktop/Tablet >= sm screens) */}
        <div className="relative hidden sm:block">
          <button
            id="role-menu-btn"
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-xl border text-xs font-bold transition-all shadow-sm ${permissions.roleBadgeColor}`}
            title="Switch Active Access Role (Admin / Manager / Team Lead / Member)"
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline font-semibold text-[11px]">{permissions.roleLabel}</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Access Control Role
                </span>
                {simulatedRole && (
                  <button
                    onClick={() => {
                      setSimulatedRole(null);
                      setShowRoleMenu(false);
                    }}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div className="mt-1 space-y-1">
                {[
                  {
                    id: 'ADMIN',
                    label: 'Super Admin',
                    icon: '👑',
                    desc: 'Full app & layout design editor, controls all members',
                    color: 'text-purple-600 dark:text-purple-400',
                  },
                  {
                    id: 'MANAGER',
                    label: 'Manager',
                    icon: '👔',
                    desc: 'Creates projects, assigns tasks, approves work & locks confidential assets',
                    color: 'text-blue-600 dark:text-blue-400',
                  },
                  {
                    id: 'TEAM_LEAD',
                    label: 'Team Lead',
                    icon: '🧢',
                    desc: 'Assigns tasks to team members, creates child nodes, restricted from confidential docs',
                    color: 'text-amber-600 dark:text-amber-400',
                  },
                  {
                    id: 'MEMBER',
                    label: 'Member',
                    icon: '💻',
                    desc: 'Creates child tasks, uploads work; requests approval for deadline extensions',
                    color: 'text-emerald-600 dark:text-emerald-400',
                  },
                ].map((item) => {
                  const isSelected = permissions.role === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSimulatedRole(item.id);
                        setShowRoleMenu(false);
                      }}
                      className={`w-full p-2 rounded-xl text-left flex items-start gap-2.5 transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      <span className="text-base shrink-0">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${item.color}`}>{item.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Language Switcher (Desktop >= md screens) */}
        <div className="relative hidden md:block">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="p-2 min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs flex items-center gap-1.5"
            title="Switch Language"
          >
            <Globe className="w-4 h-4" />
            <span className="uppercase font-semibold">{i18n.language}</span>
          </button>

          {showLangMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-36 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1 z-50">
              <button
                onClick={() => changeLanguage('en')}
                className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
              >
                <span>English</span>
                {i18n.language === 'en' && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </button>
              <button
                onClick={() => changeLanguage('hi')}
                className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
              >
                <span>हिन्दी (Hindi)</span>
                {i18n.language === 'hi' && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </button>
              <button
                onClick={() => changeLanguage('kn')}
                className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
              >
                <span>ಕನ್ನಡ (Kannada)</span>
                {i18n.language === 'kn' && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </button>
            </div>
          )}
        </div>

        {/* Theme Toggle (Min 44x44px touch target on mobile) */}
        <button
          onClick={toggleTheme}
          className="w-10 h-10 min-w-[40px] sm:min-w-[36px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          title="Toggle Dark Mode"
          aria-label="Toggle Dark Mode"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications Icon with Live Unread Badge */}
        <button
          id="header-notifications-btn"
          onClick={() => setShowNotifications(true)}
          className="w-10 h-10 min-w-[40px] sm:min-w-[36px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 relative transition-colors"
          title="Open Notifications"
          aria-label="Open Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-extrabold flex items-center justify-center absolute -top-1 -right-1 ring-2 ring-white dark:ring-slate-900 shadow-sm animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Auth User Profile or Login Button */}
        {user ? (
          <div className="flex items-center gap-2 pl-1 sm:pl-2 sm:border-l sm:border-slate-200 sm:dark:border-slate-700">
            <div
              className="w-9 h-9 min-w-[36px] rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm"
              title={`${user.fullName} (${user.email})`}
            >
              {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
            </div>
            <div className="hidden xl:block text-left">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[110px] truncate">
                {user.fullName}
              </div>
              <div className="text-[10px] text-slate-400 max-w-[110px] truncate">{user.email}</div>
            </div>
            <button
              id="header-logout-btn"
              onClick={logout}
              className="hidden sm:flex w-9 h-9 items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            id="header-signin-btn"
            onClick={onOpenAuth}
            className="px-3.5 py-2 min-h-[40px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>{t('login')}</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MOBILE NAVIGATION DRAWER (Full navigation for small screens <lg)            */}
      {/* Rendered via createPortal to break out of header stacking context/blur      */}
      {/* ========================================================================= */}
      {typeof document !== 'undefined' &&
        mobileDrawerOpen &&
        createPortal(
          <div
            id="mobile-nav-portal"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            className="fixed inset-0 z-[9999] lg:hidden flex"
          >
            {/* Backdrop Overlay (covers full screen, tap to close) */}
            <div
              id="mobile-nav-backdrop"
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200"
              onClick={() => setMobileDrawerOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer Sheet */}
            <div
              id="mobile-nav-drawer"
              className="relative w-[85vw] max-w-[340px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-[100dvh] max-h-[100dvh] z-10 pt-safe pb-safe overflow-y-auto overscroll-contain transition-transform duration-200 ease-out"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900 sticky top-0 z-10">
                <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-slate-900 dark:text-white leading-tight">
                      FlowTrack
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">Navigation & Workspace</div>
                  </div>
                </div>
                <button
                  id="mobile-drawer-close-btn"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Close Navigation Drawer"
                  aria-label="Close Navigation Drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Profile Card (if authenticated) */}
              {user ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                      {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {user.fullName}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${permissions.roleBadgeColor}`}>
                      {permissions.roleLabel}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/30 shrink-0">
                  <button
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      onOpenAuth();
                    }}
                    className="w-full py-2.5 px-4 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <UserIcon className="w-4 h-4" />
                    <span>Sign In / Create Account</span>
                  </button>
                </div>
              )}

              {/* Active Role Selector (Mobile Drawer) */}
              {user && (
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Access Control Role
                    </span>
                    {simulatedRole && (
                      <button
                        onClick={() => setSimulatedRole(null)}
                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-bold"
                      >
                        Reset to Default
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'ADMIN', label: 'Admin', icon: '👑' },
                      { id: 'MANAGER', label: 'Manager', icon: '👔' },
                      { id: 'TEAM_LEAD', label: 'Team Lead', icon: '🧢' },
                      { id: 'MEMBER', label: 'Member', icon: '💻' },
                    ].map((roleItem) => {
                      const isSelected = permissions.role === roleItem.id;
                      return (
                        <button
                          key={roleItem.id}
                          onClick={() => setSimulatedRole(roleItem.id)}
                          className={`p-2 min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-between transition-colors border ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-600 dark:text-blue-400'
                              : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>{roleItem.icon}</span>
                            <span>{roleItem.label}</span>
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Workspace Selector (Inside Mobile Drawer) */}
              {user && (
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Current Workspace
                    </span>
                    <button
                      onClick={() => {
                        setMobileDrawerOpen(false);
                        onOpenCreateWorkspace();
                      }}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 min-h-[32px] px-1"
                    >
                      <Plus className="w-3 h-3" />
                      New
                    </button>
                  </div>

                  <div className="space-y-1">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => {
                          setActiveWorkspace(ws.id);
                          setMobileDrawerOpen(false);
                        }}
                        className={`w-full p-2.5 min-h-[44px] rounded-xl text-left text-xs flex items-center justify-between transition-colors ${
                          ws.id === activeWorkspaceId
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-900/40'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              ws.id === activeWorkspaceId ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                          />
                          <span className="truncate">{ws.name}</span>
                        </div>
                        {ws.id === activeWorkspaceId && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Primary Navigation Views */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Views & Canvases
                </div>
                <div className="space-y-1">
                  <button
                    id="mobile-nav-projects-btn"
                    onClick={() => handleMobileNav('dashboard')}
                    className={`w-full p-2.5 min-h-[44px] rounded-xl text-left text-xs font-bold flex items-center gap-3 transition-colors ${
                      currentView === 'dashboard'
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <FolderKanban className="w-4 h-4 shrink-0" />
                    <span>Projects</span>
                  </button>

                  <button
                    id="mobile-nav-my-work-btn"
                    onClick={() => handleMobileNav('my-work')}
                    className={`w-full p-2.5 min-h-[44px] rounded-xl text-left text-xs font-bold flex items-center gap-3 transition-colors ${
                      currentView === 'my-work'
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <CheckSquare className="w-4 h-4 shrink-0" />
                    <span>My Tasks</span>
                  </button>

                  {(currentRole === 'ADMIN' || currentRole === 'MANAGER') && (
                    <button
                      id="mobile-nav-users-btn"
                      onClick={() => handleMobileNav('users')}
                      className={`w-full p-2.5 min-h-[44px] rounded-xl text-left text-xs font-bold flex items-center gap-3 transition-colors ${
                        currentView === 'users'
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <span>Team</span>
                    </button>
                  )}

                  {(currentRole === 'ADMIN' || currentRole === 'MANAGER') && (
                    <button
                      id="mobile-nav-reports-btn"
                      onClick={() => handleMobileNav('reports')}
                      className={`w-full p-2.5 min-h-[44px] rounded-xl text-left text-xs font-bold flex items-center gap-3 transition-colors ${
                        currentView === 'reports'
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4 shrink-0" />
                      <span>Reports</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Language & Theme Controls in Drawer */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 shrink-0">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Language
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'en', label: 'English' },
                      { id: 'hi', label: 'हिन्दी' },
                      { id: 'kn', label: 'ಕನ್ನಡ' },
                    ].map((lang) => (
                      <button
                        key={lang.id}
                        onClick={() => changeLanguage(lang.id)}
                        className={`py-2 px-2 min-h-[44px] rounded-xl text-xs font-bold border transition-colors ${
                          i18n.language === lang.id
                            ? 'bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Theme Appearance
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="w-full py-2.5 px-3 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      {darkMode ? <Moon className="w-4 h-4 text-blue-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                      <span>{darkMode ? 'Dark Mode' : 'Light Mode'}</span>
                    </span>
                    <span className="text-[10px] uppercase text-slate-400 font-semibold">Toggle</span>
                  </button>
                </div>
              </div>

              {/* Logout Footer in Mobile Drawer */}
              {user && (
                <div className="p-4 shrink-0">
                  <button
                    id="mobile-drawer-logout-btn"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      logout();
                    }}
                    className="w-full py-2.5 px-4 min-h-[44px] rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-center gap-2 hover:bg-rose-100 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Slide-out Notification Drawer */}
      <NotificationDrawer
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </header>
  );
};
