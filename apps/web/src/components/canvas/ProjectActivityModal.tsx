import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../services/api';
import {
  X,
  History,
  User,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  RefreshCw,
  Filter,
} from 'lucide-react';

interface ProjectActivityModalProps {
  isOpen: boolean;
  projectId: string;
  projectName?: string;
  onClose: () => void;
}

export const ProjectActivityModal: React.FC<ProjectActivityModalProps> = ({
  isOpen,
  projectId,
  projectName,
  onClose,
}) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [total, setTotal] = useState(0);

  const loadHistory = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const res = await ApiClient.getProjectHistory(projectId, {
        limit: 50,
        action: actionFilter || undefined,
      });
      if (res && res.items) {
        setLogs(res.items);
        setTotal(res.total || 0);
      }
    } catch (err) {
      console.error('Failed to load project activity', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, projectId, actionFilter]);

  if (!isOpen) return null;

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'STATUS_CHANGE':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Status Changed</span>;
      case 'ASSIGNMENT_CHANGE':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">Assignment Updated</span>;
      case 'DEADLINE_CHANGE':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Deadline Adjusted</span>;
      case 'MANAGER_APPROVAL':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Manager Sign-Off</span>;
      case 'APPROVAL_DECISION':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">Gate Decision</span>;
      case 'BLOCKER_REPORTED':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">Blocker Raised</span>;
      case 'EVIDENCE_SUBMISSION':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Evidence Uploaded</span>;
      case 'EVIDENCE_APPROVED':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Evidence Verified</span>;
      case 'EVIDENCE_REWORK_REQUESTED':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Evidence Rework</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{action}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <span>Project Audit &amp; Activity Stream</span>
                <span className="text-[11px] font-normal text-slate-400">({total} total events)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {projectName ? `Chronological history for "${projectName}"` : 'Tamper-evident audit trail'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadHistory}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Refresh Stream"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Filter */}
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-500">Filter Event:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Events</option>
            <option value="STATUS_CHANGE">Status Changes</option>
            <option value="ASSIGNMENT_CHANGE">Assignments</option>
            <option value="DEADLINE_CHANGE">Deadline Extensions</option>
            <option value="MANAGER_APPROVAL">Manager Sign-Offs</option>
            <option value="APPROVAL_DECISION">Gate Decisions</option>
            <option value="BLOCKER_REPORTED">Blockers</option>
            <option value="EVIDENCE_SUBMISSION">Evidence Submissions</option>
            <option value="EVIDENCE_APPROVED">Evidence Approvals</option>
          </select>
        </div>

        {/* Audit Logs Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && logs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              Loading audit logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16">
              <History className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-semibold text-slate-500">No audit activity recorded yet.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs space-y-2 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {getActionBadge(log.action)}
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {log.actor?.fullName || 'Collaborator'}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      on {log.entityName}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(log.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                {/* Formatted Diff Preview */}
                {log.newValues && (
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                    {log.action === 'DEADLINE_CHANGE' ? (
                      <div className="space-y-0.5">
                        <div className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Revised Due Date: {log.newValues.dueDate ? new Date(log.newValues.dueDate).toLocaleDateString() : 'None'}</span>
                        </div>
                        {log.oldValues?.dueDate && (
                          <div className="text-[10px] text-slate-400 line-through">
                            Previous: {new Date(log.oldValues.dueDate).toLocaleDateString()}
                          </div>
                        )}
                        {log.newValues.reason && (
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                            &quot;{log.newValues.reason}&quot;
                          </div>
                        )}
                      </div>
                    ) : log.action === 'BLOCKER_REPORTED' ? (
                      <div className="space-y-0.5">
                        <div className="font-bold text-rose-600 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Blocker Reason:</span>
                        </div>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300">
                          {log.newValues.reason}
                        </p>
                      </div>
                    ) : log.action === 'MANAGER_APPROVAL' ? (
                      <div className="space-y-0.5">
                        <div className="font-bold text-emerald-600 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Sign-Off Note:</span>
                        </div>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 italic">
                          &quot;{log.newValues.note}&quot;
                        </p>
                      </div>
                    ) : log.action === 'EVIDENCE_SUBMISSION' ? (
                      <div className="space-y-0.5">
                        <div className="font-bold text-indigo-600 flex items-center gap-1">
                          <FileCheck className="w-3.5 h-3.5" />
                          <span>Submitted Deliverable:</span>
                        </div>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 font-semibold">
                          {log.newValues.name} (v{log.newValues.version})
                        </p>
                      </div>
                    ) : log.action === 'EVIDENCE_APPROVED' || log.action === 'EVIDENCE_REWORK_REQUESTED' ? (
                      <div className="space-y-0.5">
                        <div className={`font-bold flex items-center gap-1 ${log.action === 'EVIDENCE_APPROVED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Review Decision: {log.newValues.decision}</span>
                        </div>
                        {log.newValues.feedback && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                            &quot;{log.newValues.feedback}&quot;
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                        {Object.entries(log.newValues).map(([key, val]) => (
                          <span key={key}>
                            <span className="text-slate-400">{key}:</span> {String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
