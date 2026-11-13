import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api';
import {
  X,
  Layers,
  Copy,
  Trash2,
  Building2,
  BookmarkPlus,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';

interface TemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject?: any;
  onTemplateCreated?: () => void;
}

export const TemplateManagerModal: React.FC<TemplateManagerModalProps> = ({
  isOpen,
  onClose,
  activeProject,
  onTemplateCreated,
}) => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Save current project as template state
  const [showSaveCurrentForm, setShowSaveCurrentForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveCategory, setSaveCategory] = useState('Real Estate & Construction');
  const [savingCurrent, setSavingCurrent] = useState(false);

  // Template preview expansion
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await ApiClient.getTemplates();
      setTemplates(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setShowSaveCurrentForm(false);
      setSuccessMessage(null);
      setError(null);
      if (activeProject) {
        setSaveName(`${activeProject.name} Blueprint`);
        setSaveDescription(activeProject.description || '');
      }
    }
  }, [isOpen, activeProject]);

  if (!isOpen) return null;

  const handleDuplicate = async (tmplId: string) => {
    try {
      setLoading(true);
      await ApiClient.request(`/templates/${tmplId}/duplicate`, { method: 'POST' });
      setSuccessMessage('Template duplicated successfully');
      fetchTemplates();
      if (onTemplateCreated) onTemplateCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to duplicate template');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tmplId: string) => {
    if (!window.confirm('Are you sure you want to delete this custom template?')) return;
    try {
      setLoading(true);
      await ApiClient.deleteTemplate(tmplId);
      setSuccessMessage('Template deleted');
      fetchTemplates();
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCurrentAsTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !saveName.trim()) return;
    setSavingCurrent(true);
    setError(null);
    try {
      await ApiClient.saveProjectAsTemplate(activeProject.id, {
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        category: saveCategory,
        isPublic: false,
      });
      setSuccessMessage('Current project successfully saved as template (people, dates and files stripped)');
      setShowSaveCurrentForm(false);
      fetchTemplates();
      if (onTemplateCreated) onTemplateCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to save project as template');
    } finally {
      setSavingCurrent(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)] overscroll-contain animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-manager-title"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 id="template-manager-title" className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                Project Template Manager
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Manage, duplicate, and save governance blueprints
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-10 h-10 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-5 mt-3 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs rounded-xl shrink-0">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mx-5 mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Action Bar: Save Current Project as Template */}
          {activeProject && (
            <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <BookmarkPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Save Active Project as Template
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Strips assignees, converts dates to relative offsets, and purges files
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveCurrentForm((prev) => !prev)}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shrink-0 text-center"
              >
                {showSaveCurrentForm ? 'Hide Form' : 'Save As Template'}
              </button>
            </div>
          )}

          {/* Form to Save Current */}
          {showSaveCurrentForm && (
            <form onSubmit={handleSaveCurrentAsTemplate} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  Template Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Turnkey Plotted Development Blueprint"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Starter checklist - verify with your legal and liaison team..."
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSaveCurrentForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCurrent}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                >
                  {savingCurrent && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Blueprint</span>
                </button>
              </div>
            </form>
          )}

          {/* Templates List */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Installed Templates ({templates.length})
            </h3>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading template catalog...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((tmpl) => {
                  const isExpanded = expandedTemplateId === tmpl.id;
                  const nodes: any[] = tmpl.graphJson?.nodes || [];
                  const edges: any[] = tmpl.graphJson?.edges || [];
                  const isBuiltin = !tmpl.workspaceId;

                  return (
                    <div
                      key={tmpl.id}
                      className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden"
                    >
                      <div className="p-3.5 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                {tmpl.name}
                              </h4>
                              {isBuiltin ? (
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold px-2 py-0.5 rounded">
                                  System Built-in
                                </span>
                              ) : (
                                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded">
                                  Workspace Custom
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                              {tmpl.description}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1.5 flex-wrap">
                              <span>{nodes.length} nodes</span>
                              <span>•</span>
                              <span>{edges.length} dependencies</span>
                              <span>•</span>
                              <span>{tmpl.category}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            title="Duplicate Template"
                            onClick={() => handleDuplicate(tmpl.id)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {!isBuiltin && (
                            <button
                              type="button"
                              title="Delete Custom Template"
                              onClick={() => handleDelete(tmpl.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedTemplateId(isExpanded ? null : tmpl.id)}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Expanded View of Template Nodes */}
                      {isExpanded && (
                        <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs">
                          <div className="max-h-40 overflow-y-auto space-y-1 py-1">
                            {nodes.map((n: any, idx: number) => (
                              <div
                                key={n.key || idx}
                                className="flex items-center justify-between py-1 px-2 rounded bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 text-[11px]"
                              >
                                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {n.title}
                                </span>
                                <div className="flex items-center gap-2 shrink-0 text-slate-400 font-mono text-[10px]">
                                  <span>Offset: +{n.offsetDays ?? 0}d</span>
                                  <span>Duration: {n.durationDays ?? 1}d</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
