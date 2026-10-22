import React, { useState } from 'react';
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
} from 'lucide-react';
import { getRolePermissions, UserRole } from '../../utils/permissions';

interface NavbarProps {
  onOpenAuth: () => void;
  onOpenCreateWorkspace: () => void;
  currentView: 'dashboard' | 'canvas';
  onViewChange: (view: 'dashboard' | 'canvas') => void;
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
  const { user, workspaces, activeWorkspaceId, setActiveWorkspace, logout, getActiveRole, setSimulatedRole, simulatedRole } = useAuthStore();
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

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

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left: Brand & Navigation */}
      <div className="flex items-center gap-4 sm:gap-6">
        <button
          onClick={() => onViewChange('dashboard')}
          className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 group text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-base leading-tight tracking-tight text-slate-900 dark:text-white">
              {t('appName')}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              {t('tagline')}
            </div>
          </div>
        </button>

        {/* Workspace Switcher */}
        {user && (
          <div className="relative">
            <button
              onClick={() => setShowWsMenu(!showWsMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="max-w-[140px] truncate">{activeWs?.name || 'Select Workspace'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showWsMenu && (
              <div className="absolute top-full left-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50">
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
                    {ws.id === activeWorkspaceId && <Check className="w-3.5 h-3.5 text-blue-600" />}
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
                  <Plus className="w-3.5 h-3.5" />
                  {t('createWorkspace')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Project Breadcrumb in Canvas view */}
        {currentView === 'canvas' && projectName && (
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <span>/</span>
            <span className="font-semibold text-slate-900 dark:text-white px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md">
              {projectName}
            </span>
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Active Role Selector (Super Admin / Manager / Team Lead / Member) */}
        <div className="relative">
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm ${permissions.roleBadgeColor}`}
            title="Switch Active Access Role (Admin / Manager / Team Lead / Member)"
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline font-semibold text-[11px]">{permissions.roleLabel}</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
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

        {/* Language Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs flex items-center gap-1.5"
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

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          title="Toggle Dark Mode"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications Icon */}
        <button className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 relative">
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 rounded-full bg-blue-500 absolute top-1.5 right-1.5 ring-2 ring-white dark:ring-slate-900"></span>
        </button>

        {/* Auth User Profile or Login Button */}
        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
              {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[100px] truncate">
                {user.fullName}
              </div>
              <div className="text-[10px] text-slate-400">{user.email}</div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-md transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            id="header-signin-btn"
            onClick={onOpenAuth}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
          >
            {t('login')}
          </button>
        )}
      </div>
    </header>
  );
};
