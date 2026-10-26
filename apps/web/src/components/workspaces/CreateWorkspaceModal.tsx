import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { ApiClient } from '../../services/api';
import { X, Briefcase, Hash } from 'lucide-react';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { fetchWorkspaces, setActiveWorkspace } = useAuthStore();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const ws = await ApiClient.createWorkspace({
        name,
        slug: slug || undefined,
      });
      await fetchWorkspaces();
      setActiveWorkspace(ws.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
              {t('createWorkspace')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Workspaces isolate projects, node types, and team members
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 sm:p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto overscroll-contain">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Workspace Name
            </label>
            <div className="relative">
              <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-3" />
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                  }
                }}
                required
                className="w-full pl-9 pr-3 py-2.5 sm:py-2 min-h-[44px] text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Prestige Properties"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Workspace Slug (URL key)
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-3" />
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="w-full pl-9 pr-3 py-2.5 sm:py-2 min-h-[44px] text-sm sm:text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="prestige-properties"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] py-2.5 sm:py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm sm:text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 min-h-[44px] py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm sm:text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
