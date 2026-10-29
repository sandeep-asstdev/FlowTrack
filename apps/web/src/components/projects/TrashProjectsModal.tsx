import React, { useState, useEffect } from 'react';
import {
  Trash2,
  RotateCcw,
  ShieldAlert,
  X,
  AlertTriangle,
  Loader2,
  Calendar,
  Layers,
} from 'lucide-react';
import { ApiClient } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

export interface TrashProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectRestored: () => void;
}

export const TrashProjectsModal: React.FC<TrashProjectsModalProps> = ({
  isOpen,
  onClose,
  onProjectRestored,
}) => {
  const [trashedProjects, setTrashedProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Purge modal state
  const [purgeTarget, setPurgeTarget] = useState<any>(null);
  const [confirmationKey, setConfirmationKey] = useState('');
  const [justification, setJustification] = useState('');
  const [forceWaiver, setForceWaiver] = useState(false);
  const [purging, setPurging] = useState(false);

  const userRole = useAuthStore((s) => s.getActiveRole());
  const isAdmin = userRole === 'ADMIN';

  const loadTrash = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ApiClient.getTrashProjects();
      setTrashedProjects(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load deleted projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTrash();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRestore = async (p: any) => {
    try {
      setRestoringId(p.id);
      setError(null);
      await ApiClient.restoreProject(p.id, { reason: 'Restored from trash by user' });
      await loadTrash();
      onProjectRestored();
    } catch (err: any) {
      setError(err.message || 'Failed to restore project');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePurge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purgeTarget) return;

    try {
      setPurging(true);
      setError(null);
      await ApiClient.purgeProject(purgeTarget.id, {
        confirmationKey: confirmationKey.trim(),
        justification: justification.trim(),
        forceRetentionWaiver: forceWaiver,
      });
      setPurgeTarget(null);
      setConfirmationKey('');
      setJustification('');
      setForceWaiver(false);
      await loadTrash();
      onProjectRestored();
    } catch (err: any) {
      setError(err.message || 'Failed to permanently purge project');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Project Trash &amp; Recovery
              </h3>
              <p className="text-xs text-slate-400">Soft-deleted projects recoverable with project.restore</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" />
            <p className="text-xs font-semibold">Loading trash items...</p>
          </div>
        ) : trashedProjects.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-1">
            <Trash2 className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Trash is empty</p>
            <p className="text-xs text-slate-400">No soft-deleted projects found in this workspace.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {trashedProjects.map((p) => {
              const deletedDate = p.deletedAt ? new Date(p.deletedAt).toLocaleDateString() : 'Unknown';
              const reason = (p.settings as any)?.deletionReason || 'No reason specified';

              return (
                <div
                  key={p.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {p.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-400">
                        {p.key || p.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 italic truncate">
                      Deleted on {deletedDate} • Reason: "{reason}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRestore(p)}
                      disabled={restoringId === p.id}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{restoringId === p.id ? 'Restoring...' : 'Restore'}</span>
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => setPurgeTarget(p)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900/60"
                      >
                        Purge...
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Permanent Purge Confirmation Sub-Dialog */}
        {purgeTarget && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-rose-300 dark:border-rose-900 shadow-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-rose-600">
                <ShieldAlert className="w-6 h-6 shrink-0" />
                <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Permanent Purge: {purgeTarget.name}
                </h4>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                This privileged operation will <strong>permanently destroy</strong> all tasks, edges, and documents for this project. Immutable compliance audit events are preserved.
              </p>

              <form onSubmit={handlePurge} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Type project name "{purgeTarget.name}" to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmationKey}
                    onChange={(e) => setConfirmationKey(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Mandatory Audit Justification:
                  </label>
                  <textarea
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Legal mandate, GDPR erasure, or executive signoff..."
                    rows={2}
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={forceWaiver}
                    onChange={(e) => setForceWaiver(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 accent-rose-600"
                  />
                  <span>Administrator retention waiver (override 30-day retention lock)</span>
                </label>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPurgeTarget(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={purging || !confirmationKey.trim() || !justification.trim()}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold"
                  >
                    {purging ? 'Purging...' : 'Permanently Purge'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

