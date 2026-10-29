import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Trash2,
  X,
  Layers,
  Paperclip,
  GitFork,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { ApiClient } from '../../services/api';

export interface ProjectDeleteImpactModalProps {
  project: any;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export const ProjectDeleteImpactModal: React.FC<ProjectDeleteImpactModalProps> = ({
  project,
  isOpen,
  onClose,
  onDeleted,
}) => {
  const [impact, setImpact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [force, setForce] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && project?.id) {
      setLoading(true);
      setError(null);
      setReason('');
      setForce(false);
      ApiClient.getProjectDeletionImpact(project.id)
        .then((data) => setImpact(data))
        .catch((err) => setError(err.message || 'Failed to calculate deletion impact'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, project]);

  if (!isOpen || !project) return null;

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A mandatory deletion reason must be provided.');
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await ApiClient.deleteProject(project.id, { reason: reason.trim(), force });
      onDeleted();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 rounded-xl">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Delete Project: {project.name}
              </h3>
              <span className="text-xs text-slate-400 font-mono">{project.key || project.id}</span>
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
            <p className="text-xs font-semibold">Analyzing project dependencies &amp; impact...</p>
          </div>
        ) : (
          <form onSubmit={handleDelete} className="space-y-4">
            {/* Impact Metrics Summary */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Impact Analysis Report
              </span>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="font-extrabold text-slate-900 dark:text-white text-base">
                    {impact?.totalNodesCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">Tasks &amp; Subtasks</div>
                </div>
                <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="font-extrabold text-slate-900 dark:text-white text-base">
                    {impact?.documentCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">Documents</div>
                </div>
                <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="font-extrabold text-slate-900 dark:text-white text-base">
                    {impact?.crossProjectDependenciesCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">External Links</div>
                </div>
              </div>

              {/* External Dependents Warning */}
              {Array.isArray(impact?.dependentProjects) && impact.dependentProjects.length > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Cross-Project Blockers Detected!</span>
                  </div>
                  <p className="text-[11px]">
                    Tasks in this project are required by:{' '}
                    <strong>{impact.dependentProjects.map((p: any) => p.name).join(', ')}</strong>.
                  </p>
                  <label className="flex items-center gap-2 pt-1 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={force}
                      onChange={(e) => setForce(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 accent-amber-600"
                    />
                    <span>Force delete anyway (preserve external edges for audit)</span>
                  </label>
                </div>
              )}
            </div>

            {/* Mandatory Reason Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Mandatory Deletion Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this project is being decommissioned or moved to trash..."
                rows={3}
                required
                className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
              />
              <p className="text-[10px] text-slate-400">
                This project will be moved to the recoverable trash state. Audit logs and compliance records are preserved.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting || !reason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Moving to Trash...' : 'Move to Trash'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

