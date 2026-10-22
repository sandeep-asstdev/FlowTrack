import React from 'react';
import { X, Printer, Download, FileText, CheckCircle2, Clock, AlertTriangle, ShieldCheck, ThumbsUp } from 'lucide-react';
import { calculateTimeCountdown } from '../../utils/timeTracker';

interface ProjectReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  nodes: any[];
}

export const ProjectReportModal: React.FC<ProjectReportModalProps> = ({
  isOpen,
  onClose,
  project,
  nodes,
}) => {
  if (!isOpen) return null;

  const totalTasks = nodes.length;
  const completedTasks = nodes.filter((n) => n.data?.statusCategory === 'done' || n.data?.progressPct === 100).length;
  const overdueTasks = nodes.filter((n) => {
    if (n.data?.statusCategory === 'done') return false;
    if (!n.data?.dueDate) return false;
    return new Date(n.data.dueDate).getTime() < Date.now();
  }).length;
  const inProgressTasks = totalTasks - completedTasks;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = [
      'Node ID',
      'Title',
      'Status',
      'Progress Pct',
      'Priority',
      'Due Date',
      'Countdown Status',
      'Owner',
      'Documents Count',
      'Remarks Count',
    ];

    const rows = nodes.map((n) => {
      const countdown = calculateTimeCountdown(n.data?.dueDate, n.data?.statusCategory);
      return [
        `"${n.id}"`,
        `"${(n.data?.title || '').replace(/"/g, '""')}"`,
        `"${n.data?.statusName || ''}"`,
        `${n.data?.progressPct || 0}%`,
        `"${n.data?.priority || 'MEDIUM'}"`,
        `"${n.data?.dueDate ? new Date(n.data.dueDate).toLocaleString() : 'None'}"`,
        `"${countdown.formattedText}"`,
        `"${n.data?.ownerName || 'Unassigned'}"`,
        `${n.data?.docCount || 0}`,
        `${n.data?.msgCount || 0}`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${project?.name || 'Project'}-Audit-Report-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[90] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 uppercase">
                Executive Audit Dossier
              </span>
              <span className="text-xs text-slate-400">
                Generated: {new Date().toLocaleDateString(undefined, { dateStyle: 'full' })}
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {project?.name || 'Project'} – Full Extraction & Status Report
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Executive KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Total Tasks
              </span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {totalTasks}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Canvas nodes</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60">
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                Completed & Approved
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {completedTasks}
              </div>
              <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1 block">
                {overallProgress}% completion rate
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60">
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
                Overdue Actions
              </span>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {overdueTasks}
              </div>
              <span className="text-[11px] text-rose-700/80 dark:text-rose-400/80 mt-1 block">
                Exceeded schedule
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60">
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                Active In-Progress
              </span>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {inProgressTasks}
              </div>
              <span className="text-[11px] text-blue-700/80 dark:text-blue-400/80 mt-1 block">
                Under execution
              </span>
            </div>
          </div>

          {/* Node Breakdown Table */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Full Project Task Ledger & Deliverables
            </h3>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4 font-bold">Task Name & Details</th>
                      <th className="py-3 px-3 font-bold">Status</th>
                      <th className="py-3 px-3 font-bold">Priority</th>
                      <th className="py-3 px-3 font-bold">Timeline & Deadline</th>
                      <th className="py-3 px-3 font-bold">Owner</th>
                      <th className="py-3 px-3 font-bold">Docs</th>
                      <th className="py-3 px-3 font-bold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {nodes.map((n) => {
                      const countdown = calculateTimeCountdown(n.data?.dueDate, n.data?.statusCategory);
                      const isDone = n.data?.statusCategory === 'done' || n.data?.progressPct === 100;
                      return (
                        <tr
                          key={n.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white max-w-xs">
                            <div className="truncate">{n.data?.title}</div>
                            {n.data?.description && (
                              <div className="text-[11px] font-normal text-slate-400 line-clamp-1 mt-0.5">
                                {n.data?.description}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-3">
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                              style={{
                                backgroundColor: `${n.data?.statusColour || '#3b82f6'}15`,
                                color: n.data?.statusColour || '#3b82f6',
                              }}
                            >
                              {n.data?.statusName}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {n.data?.priority || 'MEDIUM'}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            <div className="space-y-0.5">
                              <div className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                                {n.data?.dueDate
                                  ? new Date(n.data.dueDate).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : 'No deadline'}
                              </div>
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded-full inline-block font-bold ${countdown.badgeClass}`}
                              >
                                {countdown.formattedText}
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 text-[11px]">
                            {n.data?.ownerName || 'Unassigned'}
                          </td>

                          <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 text-[11px] font-semibold">
                            {n.data?.docCount || 0}
                          </td>

                          <td className="py-3.5 px-3 text-blue-600 dark:text-blue-400 text-[11px] font-semibold">
                            {n.data?.msgCount || 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
