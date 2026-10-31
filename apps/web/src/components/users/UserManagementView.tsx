import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Shield,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Power,
  Trash2,
  Mail,
  Phone,
  History,
  Clock,
  ArrowRight,
  Activity,
  FileText,
} from 'lucide-react';
import { ApiClient } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { InviteMemberModal } from './InviteMemberModal';

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'ADMIN' | 'MANAGER' | 'TEAM_LEAD' | 'MEMBER' | 'GUEST';
  createdAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    phone?: string;
    avatarUrl?: string;
    isActive: boolean;
  };
}

export const UserManagementView: React.FC = () => {
  const { user: currentUser, activeWorkspaceId, getActiveRole, workspaces } = useAuthStore();
  const isPlatformAdmin =
    currentUser?.email === 'admin@flowtrack.dev' ||
    getActiveRole() === 'ADMIN' ||
    workspaces.some((w) => w.role === 'ADMIN');

  // Scope: 'platform' (default for Platform Admin) vs 'workspace'
  const [scope, setScope] = useState<'platform' | 'workspace'>('platform');
  const [platformStats, setPlatformStats] = useState<any>(null);

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Tabs: Members vs Audit Trail
  const [activeTab, setActiveTab] = useState<'members' | 'audit'>('members');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<WorkspaceMember | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      setError(null);
      if (isPlatformAdmin && scope === 'platform') {
        const [usersRes, statsRes] = await Promise.all([
          ApiClient.getPlatformUsers({
            search: search || undefined,
            role: roleFilter !== 'ALL' ? roleFilter : undefined,
            status: statusFilter !== 'ALL' ? statusFilter.toLowerCase() : undefined,
            limit: 100,
          }),
          ApiClient.getPlatformStats().catch(() => null),
        ]);
        if (statsRes) setPlatformStats(statsRes);
        const mappedMembers = (usersRes?.items || []).map((u: any) => u.workspaceMemberShape || u);
        setMembers(mappedMembers);
      } else if (activeWorkspaceId) {
        const data = await ApiClient.getWorkspaceMembers(activeWorkspaceId);
        setMembers(data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load user records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeWorkspaceId, isPlatformAdmin, scope, search, roleFilter, statusFilter]);

  const fetchAuditLogs = useCallback(async () => {
    try {
      setAuditLoading(true);
      if (isPlatformAdmin && scope === 'platform') {
        const res = await ApiClient.getPlatformAudits({
          action: auditActionFilter !== 'ALL' ? auditActionFilter : undefined,
          limit: 50,
        });
        const normalized = (res?.logs || res?.items || []).map((log: any) => ({
          ...log,
          createdAt: log.createdAt || log.timestamp || new Date().toISOString(),
          entityType: log.entityType || log.targetType || 'User',
          beforeState: log.beforeState || log.beforeValues,
          afterState: log.afterState || log.afterValues,
        }));
        setAuditLogs(normalized);
      } else if (activeWorkspaceId) {
        const res = await ApiClient.getWorkspaceAuditHistory(activeWorkspaceId, {
          limit: 50,
          action: auditActionFilter !== 'ALL' ? auditActionFilter : undefined,
        });
        const normalized = (res?.logs || res?.items || []).map((log: any) => ({
          ...log,
          createdAt: log.createdAt || log.timestamp || new Date().toISOString(),
          entityType: log.entityType || log.targetType || 'Entity',
          beforeState: log.beforeState || log.beforeValues,
          afterState: log.afterState || log.afterValues,
        }));
        setAuditLogs(normalized);
      }
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [activeWorkspaceId, isPlatformAdmin, scope, auditActionFilter]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchAuditLogs]);

  // Statistics
  const stats = useMemo(() => {
    const total = members.length;
    const active = members.filter((m) => m.user.isActive !== false).length;
    const deactivated = total - active;
    const admins = members.filter((m) => m.role === 'ADMIN' && m.user.isActive !== false).length;
    const managers = members.filter((m) => m.role === 'MANAGER' && m.user.isActive !== false).length;
    const teamLeads = members.filter((m) => m.role === 'TEAM_LEAD' && m.user.isActive !== false).length;
    const regulars = members.filter((m) => m.role === 'MEMBER' && m.user.isActive !== false).length;
    const guests = members.filter((m) => m.role === 'GUEST' && m.user.isActive !== false).length;
    return { total, active, deactivated, admins, managers, teamLeads, regulars, guests };
  }, [members]);

  // Filtered members
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Search
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        m.user.fullName?.toLowerCase().includes(q) ||
        m.user.email?.toLowerCase().includes(q);

      // Role filter
      const matchRole = roleFilter === 'ALL' || m.role === roleFilter;

      // Status filter
      const isUserActive = m.user.isActive !== false;
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && isUserActive) ||
        (statusFilter === 'DEACTIVATED' && !isUserActive);

      return matchSearch && matchRole && matchStatus;
    });
  }, [members, search, roleFilter, statusFilter]);

  // Handle Role Change
  const handleRoleChange = async (member: WorkspaceMember, newRole: string) => {
    if (member.userId === currentUser?.id) {
      setError('Self-promotion or altering your own role is not permitted.');
      return;
    }

    if (member.role === 'ADMIN' && newRole !== 'ADMIN' && stats.admins <= 1) {
      setError('Cannot demote the last active Platform Admin in this workspace.');
      return;
    }

    const prevRole = member.role;
    // Optimistic local state update
    setMembers((prev) =>
      prev.map((m) => (m.userId === member.userId ? { ...m, role: newRole as any } : m))
    );

    try {
      if (scope === 'platform') {
        const targetWsId =
          member.workspaceId && member.workspaceId !== 'platform'
            ? member.workspaceId
            : activeWorkspaceId || undefined;
        await ApiClient.updatePlatformUserRole(member.userId, newRole, targetWsId);
      } else if (activeWorkspaceId) {
        await ApiClient.updateMemberRole(activeWorkspaceId, member.userId, newRole);
      }
      setActionSuccess(`Updated role for ${member.user.fullName || member.user.email} to ${newRole}`);
      setTimeout(() => setActionSuccess(null), 3500);
      fetchMembers();
    } catch (err: any) {
      // Revert optimistic update on failure
      setMembers((prev) =>
        prev.map((m) => (m.userId === member.userId ? { ...m, role: prevRole } : m))
      );
      setError(err.message || 'Failed to update member role');
    }
  };

  // Handle Deactivation / Activation
  const handleConfirmDeactivation = async () => {
    if (!deactivateTarget) return;
    const target = deactivateTarget;
    const newStatus = !target.user.isActive;

    try {
      setDeactivating(true);
      if (scope === 'platform') {
        await ApiClient.updatePlatformUserStatus(target.userId, newStatus);
      } else if (activeWorkspaceId) {
        await ApiClient.updateMemberStatus(activeWorkspaceId, target.userId, newStatus);
      }
      setDeactivateTarget(null);
      setActionSuccess(
        `${newStatus ? 'Activated' : 'Deactivated'} ${target.user.fullName} successfully.`
      );
      setTimeout(() => setActionSuccess(null), 3500);
      fetchMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to update member status');
    } finally {
      setDeactivating(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'MANAGER':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'TEAM_LEAD':
        return 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      case 'MEMBER':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
      case 'GUEST':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const isCurrentUser = (userId: string) => currentUser?.id === userId;
  const isLastActiveAdmin = (member: WorkspaceMember) =>
    member.role === 'ADMIN' && member.user.isActive !== false && stats.admins <= 1;

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Platform User & Access Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900">
              Admin Console
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage account lifecycle, role assignments, active status, and access scopes across FlowTrack.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setRefreshing(true);
              fetchMembers();
              if (activeTab === 'audit') fetchAuditLogs();
            }}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            title="Refresh user list"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            id="invite-member-btn"
            onClick={() => setInviteModalOpen(true)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Member</span>
          </button>
        </div>
      </div>

      {/* Scope Selector: Entire Platform vs Current Workspace */}
      {isPlatformAdmin && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/50 rounded-2xl">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
            <span className="text-xs font-bold text-purple-900 dark:text-purple-200">
              Active Scope:
            </span>
            <span className="text-xs text-purple-700/80 dark:text-purple-300">
              {scope === 'platform' ? 'Viewing all registered users & global audit logs across the platform' : 'Viewing members of current active workspace'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 rounded-xl border border-purple-200 dark:border-purple-800 shadow-sm">
            <button
              type="button"
              onClick={() => setScope('platform')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                scope === 'platform'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
              }`}
            >
              🌐 All Platform Users
            </button>
            <button
              type="button"
              onClick={() => setScope('workspace')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                scope === 'workspace'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-300'
              }`}
            >
              🏢 Current Workspace
            </button>
          </div>
        </div>
      )}

      {/* Metric Counters & Role Breakdown */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total Members
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {stats.total}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">
            Active Accounts
          </span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.active}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500">
            Deactivated
          </span>
          <span className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
            {stats.deactivated}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-500">
            Platform Admins
          </span>
          <span className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
            {stats.admins}
          </span>
        </div>
      </div>

      {/* Role Distribution Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <span className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[11px] tracking-wider shrink-0">
          Role Distribution:
        </span>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="px-2.5 py-1 rounded-full font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px]">
            Admins: {stats.admins}
          </span>
          <span className="px-2.5 py-1 rounded-full font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px]">
            Managers: {stats.managers}
          </span>
          <span className="px-2.5 py-1 rounded-full font-bold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[11px]">
            Team Leads: {stats.teamLeads}
          </span>
          <span className="px-2.5 py-1 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px]">
            Members: {stats.regulars}
          </span>
          <span className="px-2.5 py-1 rounded-full font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px]">
            Guests: {stats.guests}
          </span>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center justify-between text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-700 dark:hover:text-red-200 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Tabs: Team Members vs Workspace Audit Trail */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('members')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'members'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          {scope === 'platform' ? 'Platform Users' : 'Team Members'} ({members.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('audit');
            fetchAuditLogs();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          {scope === 'platform' ? 'Global Audit Trail' : 'Workspace Audit Trail'} ({auditLogs.length})
        </button>
      </div>

      {activeTab === 'members' ? (
        <>
          {/* Search and Filters */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="user-search-input"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by user name or email..."
                className="w-full pl-9 pr-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col xs:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 w-full xs:w-auto">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden xs:inline" />
                <select
                  id="role-filter-select"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  aria-label="Filter members by role"
                  className="w-full xs:w-auto px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <option value="ALL">All Roles</option>
                  <option value="ADMIN">Platform Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="TEAM_LEAD">Team Lead</option>
                  <option value="MEMBER">Member</option>
                  <option value="GUEST">Guest</option>
                </select>
              </div>

              <select
                id="status-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter members by account status"
                className="w-full xs:w-auto px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active Accounts</option>
                <option value="DEACTIVATED">Deactivated</option>
              </select>
            </div>
          </div>

          {/* Member List / Table Container */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span className="text-xs font-medium">Loading workspace users...</span>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
                <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  No matching users found
                </span>
                <span className="text-xs text-slate-400">
                  Try adjusting your search query or role/status filters.
                </span>
              </div>
            ) : (
              <>
                {/* Mobile Cards View (< md) */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMembers.map((m) => {
                    const isSelf = isCurrentUser(m.userId);
                    const isLastAdmin = isLastActiveAdmin(m);
                    const isDeactivated = m.user.isActive === false;

                    return (
                      <div key={m.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-sm uppercase shrink-0">
                              {m.user.avatarUrl ? (
                                <img
                                  src={m.user.avatarUrl}
                                  alt={m.user.fullName}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                                m.user.fullName?.slice(0, 2) || m.user.email?.slice(0, 2)
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                <span className="truncate">{m.user.fullName || 'User'}</span>
                                {isSelf && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 break-words-safe">{m.user.email}</div>
                              {m.user.phone && (
                                <div className="text-[11px] text-slate-400 mt-0.5">{m.user.phone}</div>
                              )}
                            </div>
                          </div>
                          <div>
                            {isDeactivated ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                Deactivated
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Active
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${getRoleBadge(
                                m.role
                              )}`}
                            >
                              {m.role}
                            </span>
                            <select
                              disabled={isSelf}
                              value={m.role}
                              onChange={(e) => handleRoleChange(m, e.target.value)}
                              aria-label={`Change role for ${m.user.fullName || m.user.email}`}
                              className="px-2.5 py-1.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <option value="MEMBER">Member</option>
                              <option value="TEAM_LEAD">Team Lead</option>
                              <option value="MANAGER">Manager</option>
                              <option value="ADMIN">Platform Admin</option>
                              <option value="GUEST">Guest</option>
                            </select>
                          </div>

                          <div className="flex items-center justify-end">
                            {isDeactivated ? (
                              <button
                                onClick={() => setDeactivateTarget(m)}
                                className="w-full xs:w-auto px-4 py-2 min-h-[44px] rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                              >
                                <Power className="w-4 h-4" />
                                <span>Activate</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => setDeactivateTarget(m)}
                                disabled={isSelf || isLastAdmin}
                                title={
                                  isSelf
                                    ? 'You cannot deactivate your own account'
                                    : isLastAdmin
                                    ? 'Cannot deactivate the last active Platform Admin'
                                    : 'Deactivate user account'
                                }
                                className="w-full xs:w-auto px-4 py-2 min-h-[44px] rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                <Power className="w-4 h-4" />
                                <span>Deactivate</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Contact</th>
                        <th className="py-3 px-4">Assigned Role</th>
                        <th className="py-3 px-4">Account Status</th>
                        <th className="py-3 px-4 text-right">Lifecycle Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {filteredMembers.map((m) => {
                        const isSelf = isCurrentUser(m.userId);
                        const isLastAdmin = isLastActiveAdmin(m);
                        const isDeactivated = m.user.isActive === false;

                        return (
                          <tr
                            key={m.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            {/* User Info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                  {m.user.avatarUrl ? (
                                    <img
                                      src={m.user.avatarUrl}
                                      alt={m.user.fullName}
                                      className="w-8 h-8 rounded-full object-cover"
                                    />
                                  ) : (
                                    m.user.fullName?.slice(0, 2) || m.user.email?.slice(0, 2)
                                  )}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span>{m.user.fullName || 'User'}</span>
                                    {isSelf && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 break-words-safe">{m.user.email}</div>
                                </div>
                              </div>
                            </td>

                            {/* Contact Info */}
                            <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                              <div className="flex flex-col gap-0.5 text-[11px]">
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="break-words-safe">{m.user.email}</span>
                                </span>
                                {m.user.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{m.user.phone}</span>
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Role Selector */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getRoleBadge(
                                    m.role
                                  )}`}
                                >
                                  {m.role}
                                </span>

                                <select
                                  disabled={isSelf}
                                  value={m.role}
                                  onChange={(e) => handleRoleChange(m, e.target.value)}
                                  aria-label={`Change assigned role for ${m.user.fullName || m.user.email}`}
                                  className="px-2 py-1 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  <option value="MEMBER">Member</option>
                                  <option value="TEAM_LEAD">Team Lead</option>
                                  <option value="MANAGER">Manager</option>
                                  <option value="ADMIN">Platform Admin</option>
                                  <option value="GUEST">Guest</option>
                                </select>
                              </div>
                            </td>

                            {/* Account Status Pill */}
                            <td className="py-3.5 px-4">
                              {isDeactivated ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                  Deactivated
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  Active
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isDeactivated ? (
                                  <button
                                    onClick={() => setDeactivateTarget(m)}
                                    className="px-3 py-1.5 min-h-[36px] rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 font-bold text-[11px] flex items-center gap-1.5 transition-all"
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                    <span>Activate</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setDeactivateTarget(m)}
                                    disabled={isSelf || isLastAdmin}
                                    title={
                                      isSelf
                                        ? 'You cannot deactivate your own account'
                                        : isLastAdmin
                                        ? 'Cannot deactivate the last active Platform Admin'
                                        : 'Deactivate user account'
                                    }
                                    className="px-3 py-1.5 min-h-[36px] rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                    <span>Deactivate</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
    </>
  ) : (
    /* Workspace Audit Trail Tab */
    <div className="space-y-4">
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={auditActionFilter}
            onChange={(e) => setAuditActionFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <option value="ALL">All Event Types</option>
            <option value="ROLE_CHANGE">Role Changes</option>
            <option value="USER_ACTIVATION">User Activation</option>
            <option value="USER_DEACTIVATION">User Deactivation</option>
            <option value="MEMBER_INVITED">Member Invited</option>
            <option value="MEMBER_REMOVED">Member Removed</option>
            <option value="ASSIGNMENT_CHANGE">Task Assignments</option>
            <option value="TASK_SUBMISSION">Task Submissions</option>
            <option value="APPROVAL_DECISION">Approval Decisions</option>
          </select>
        </div>

        <button
          onClick={fetchAuditLogs}
          disabled={auditLoading}
          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 self-end sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
          Refresh Audit Log
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {auditLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs font-medium">Loading audit history...</span>
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <History className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
              No audit events found
            </span>
            <span className="text-xs text-slate-400">
              Audit logs will record user lifecycle, membership, assignment, and approval events.
            </span>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Mobile Audit Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs.map((log: any) => {
                const isDanger = log.action === 'USER_DEACTIVATION' || log.action === 'MEMBER_REMOVED';
                const isSuccess = log.action === 'USER_ACTIVATION' || log.action === 'APPROVAL_DECISION';
                const isRole = log.action === 'ROLE_CHANGE' || log.action === 'MEMBER_INVITED';

                return (
                  <div key={log.id} className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase border ${
                          isDanger
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                            : isSuccess
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
                            : isRole
                            ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900'
                            : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(log.createdAt || log.timestamp || Date.now()).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Actor</span>
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {log.actor?.fullName || 'System'}
                        </div>
                        <div className="text-[10px] text-slate-400 break-words-safe">{log.actor?.email}</div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Entity</span>
                        <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300">
                          {log.entityType}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {log.entityId ? `${log.entityId.slice(0, 10)}...` : '-'}
                        </span>
                      </div>
                    </div>

                    {/* Change Details */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                      {log.beforeState && log.afterState ? (
                        <div className="flex flex-col gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-500 break-words-safe">
                            Before: {typeof log.beforeState === 'object' ? JSON.stringify(log.beforeState) : String(log.beforeState)}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 font-mono text-[10px] text-blue-600 dark:text-blue-400 font-bold break-words-safe">
                            After: {typeof log.afterState === 'object' ? JSON.stringify(log.afterState) : String(log.afterState)}
                          </span>
                        </div>
                      ) : log.afterState ? (
                        <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 break-words-safe block">
                          State: {typeof log.afterState === 'object' ? JSON.stringify(log.afterState) : String(log.afterState)}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No state changes recorded</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Audit Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Event / Action</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Change Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditLogs.map((log: any) => {
                    const isDanger = log.action === 'USER_DEACTIVATION' || log.action === 'MEMBER_REMOVED';
                    const isSuccess = log.action === 'USER_ACTIVATION' || log.action === 'APPROVAL_DECISION';
                    const isRole = log.action === 'ROLE_CHANGE' || log.action === 'MEMBER_INVITED';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap text-[11px]">
                          {new Date(log.createdAt || log.timestamp || Date.now()).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase border ${
                              isDanger
                                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                                : isSuccess
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
                                : isRole
                                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900'
                                : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {log.actor?.fullName || 'System'}
                          </div>
                          <div className="text-[10px] text-slate-400 break-words-safe">{log.actor?.email}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 block">
                            {log.entityType}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {log.entityId ? `${log.entityId.slice(0, 10)}...` : '-'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="max-w-md text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                            {log.beforeState && log.afterState ? (
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-500 break-words-safe">
                                  {typeof log.beforeState === 'object'
                                    ? JSON.stringify(log.beforeState)
                                    : String(log.beforeState)}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 font-mono text-[10px] text-blue-600 dark:text-blue-400 font-bold break-words-safe">
                                  {typeof log.afterState === 'object'
                                    ? JSON.stringify(log.afterState)
                                    : String(log.afterState)}
                                </span>
                              </div>
                            ) : log.afterState ? (
                              <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 break-words-safe">
                                {typeof log.afterState === 'object'
                                  ? JSON.stringify(log.afterState)
                                  : String(log.afterState)}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">No state changes recorded</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )}

      {/* Confirmation Modal for Deactivation / Activation */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 overflow-hidden max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div
                className={`p-2.5 rounded-xl ${
                  deactivateTarget.user.isActive
                    ? 'bg-red-50 dark:bg-red-950/50 text-red-600'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'
                }`}
              >
                {deactivateTarget.user.isActive ? (
                  <ShieldAlert className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-slate-900 dark:text-white truncate">
                  {deactivateTarget.user.isActive ? 'Deactivate User Account' : 'Re-activate Account'}
                </h3>
                <p className="text-xs text-slate-500 break-words-safe">{deactivateTarget.user.email}</p>
              </div>
            </div>

            <div className="py-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {deactivateTarget.user.isActive ? (
                <>
                  Are you sure you want to deactivate{' '}
                  <strong className="break-words-safe">{deactivateTarget.user.fullName || deactivateTarget.user.email}</strong>?
                  <div className="mt-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-[11px] leading-snug">
                    🛡️ <strong>Safety Guarantee:</strong> Deactivated users are blocked from logging in
                    or performing actions. All past tasks, assignments, evidence, and approvals remain
                    intact.
                  </div>
                </>
              ) : (
                <>
                  Are you sure you want to re-activate{' '}
                  <strong className="break-words-safe">{deactivateTarget.user.fullName || deactivateTarget.user.email}</strong>?
                  They will immediately be able to log in and access authorized projects.
                </>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeactivateTarget(null)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivation}
                disabled={deactivating}
                className={`px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-white shadow-md transition-all flex items-center justify-center gap-2 ${
                  deactivateTarget.user.isActive
                    ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                }`}
              >
                {deactivating
                  ? 'Updating...'
                  : deactivateTarget.user.isActive
                  ? 'Confirm Deactivation'
                  : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {activeWorkspaceId && (
        <InviteMemberModal
          isOpen={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          onSuccess={fetchMembers}
          workspaceId={activeWorkspaceId}
        />
      )}
    </div>
  );
};
