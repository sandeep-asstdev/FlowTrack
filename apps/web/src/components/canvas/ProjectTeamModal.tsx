import React, { useState, useEffect } from 'react';
import { X, Users, UserPlus, Mail, Shield, Check } from 'lucide-react';
import { ApiClient } from '../../services/api';

interface ProjectTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  projectName: string;
}

export const ProjectTeamModal: React.FC<ProjectTeamModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  projectName,
}) => {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const loadMembers = async () => {
    try {
      setLoading(true);
      const wsId = workspaceId || ApiClient.getActiveWorkspaceId();
      if (wsId) {
        const data = await ApiClient.getWorkspaceMembers(wsId);
        setMembers(data || []);
      }
    } catch (e) {
      console.error('Failed to load team members', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMembers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      setInviting(true);
      setFeedback('');
      const wsId = workspaceId || ApiClient.getActiveWorkspaceId();
      if (wsId) {
        await ApiClient.inviteWorkspaceMember(wsId, inviteEmail.trim(), inviteRole);
        setInviteEmail('');
        setFeedback(`Invitation sent to ${inviteEmail}!`);
        await loadMembers();
      }
    } catch (e: any) {
      setFeedback(e?.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[95] flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                Project Collaborators & Team
              </h3>
              <p className="text-[11px] text-slate-400">
                Manage multi-user access for "{projectName}"
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invite Form */}
        <form onSubmit={handleInvite} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            Invite New Collaborator
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1 p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
            >
              <option value="MEMBER">Member</option>
              <option value="TEAM_LEAD">Team Lead</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Super Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{inviting ? 'Inviting...' : 'Invite'}</span>
            </button>
          </div>
          {feedback && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>{feedback}</span>
            </p>
          )}
        </form>

        {/* Members List */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Active Members ({members.length})
          </span>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="text-center py-6 text-xs text-slate-400">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">No members found.</div>
            ) : (
              members.map((m: any) => (
                <div
                  key={m.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {m.user?.fullName?.[0] || 'U'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {m.user?.fullName}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{m.user?.email}</div>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    {m.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-2 flex justify-end border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
