import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  FolderKanban,
  ArrowRight,
  Plus,
  Sparkles,
  Copy,
  Sliders,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getRolePermissions } from '../../utils/permissions';

interface ProjectListProps {
  projects: any[];
  onSelectProject: (project: any) => void;
  onOpenCreateModal: () => void;
  onCloneProject?: (project: any) => void;
  loading: boolean;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onSelectProject,
  onOpenCreateModal,
  onCloneProject,
  loading,
}) => {
  const { t } = useTranslation();

  const userRole = useAuthStore((s) => s.getActiveRole());
  const permissions = getRolePermissions(userRole);

  const totalOverdue = projects.reduce((acc, p) => acc + (p.metrics?.overdueNodes || 0), 0);
  const totalWaiting = projects.reduce((acc, p) => acc + (p.metrics?.waitingNodes || 0), 0);
  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center text-slate-400">
        <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium">Loading workspace projects...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Overview Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('projects')} {t('overview')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Visual node canvases across your team • {projects.length} Total Projects
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {permissions.canCreateProject && (
            <button
              id="dashboard-new-project-btn"
              onClick={onOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" />
              {t('newProject')}
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 mb-8">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {t('allProjects')}
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {projects.length}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">
            {t('inProgress')}
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {activeCount}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider">
            {t('waiting')} Blockers
          </div>
          <div className="text-2xl font-black text-amber-500 mt-1">
            {totalWaiting}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider">
            {t('overdue')} Nodes
          </div>
          <div className="text-2xl font-black text-rose-500 mt-1">
            {totalOverdue}
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white/50 dark:bg-slate-900/50 p-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <FolderKanban className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            No projects found in this workspace
          </h3>          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 mb-4">
            Create your first project canvas to start tracking tasks and dependencies.
          </p>
          {permissions.canCreateProject ? (
            <button
              onClick={onOpenCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20"
            >
              + Create New Project
            </button>
          ) : (
            <div className="text-xs text-slate-400 italic">
              Contact your Manager or Super Admin to create a project.
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => {
            const m = project.metrics || {};
            const progress = m.avgProgress || 0;

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project)}
                className="group p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug break-words-safe line-clamp-2">
                      {project.name}
                    </h3>
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      v{project.version}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 leading-relaxed break-words-safe">
                    {project.description || 'No description provided.'}
                  </p>

                  {/* Progress Bar with Percentage */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-500 dark:text-slate-400">Progress</span>
                      <span className="text-blue-600 dark:text-blue-400">{progress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Badges / Metrics Row */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-4">
                    <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      {m.totalNodes || 0} Nodes
                    </span>
                    {m.waitingNodes > 0 && (
                      <span className="px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 flex items-center gap-1 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        {m.waitingNodes} Waiting
                      </span>
                    )}
                    {m.overdueNodes > 0 && (
                      <span className="px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center gap-1 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-rose-500" />
                        {m.overdueNodes} Overdue
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>
                      {project.targetDate
                        ? new Date(project.targetDate).toLocaleDateString()
                        : 'No target date'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 min-h-[44px] group-hover:translate-x-1 transition-transform">
                      {t('openCanvas')} &rarr;
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
