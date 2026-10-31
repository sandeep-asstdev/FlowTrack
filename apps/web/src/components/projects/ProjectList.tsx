import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Clock,
  AlertTriangle,
  Calendar,
  FolderKanban,
  Plus,
  Trash2,
  Search,
  X,
  RefreshCw,
  Users,
  Filter,
  ArrowUpDown,
  User as UserIcon,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getRolePermissions } from '../../utils/permissions';
import { ProjectDeleteImpactModal } from './ProjectDeleteImpactModal';
import { TrashProjectsModal } from './TrashProjectsModal';

interface ProjectListProps {
  projects: any[];
  onSelectProject: (project: any) => void;
  onOpenCreateModal: () => void;
  onCloneProject?: (project: any) => void;
  loading: boolean;
  onRefresh?: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onSelectProject,
  onOpenCreateModal,
  onCloneProject,
  loading,
  onRefresh,
}) => {
  const { t } = useTranslation();

  const [deleteTargetProject, setDeleteTargetProject] = useState<any>(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'WAITING' | 'OVERDUE' | 'COMPLETED'>('ALL');
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'progress' | 'targetDate'>('updated');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const workspaces = useAuthStore((s) => s.workspaces);
  const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const userRole = useAuthStore((s) => s.getActiveRole());
  const permissions = getRolePermissions(userRole);

  const totalOverdue = projects.reduce((acc, p) => acc + (p.metrics?.overdueNodes || 0), 0);
  const totalWaiting = projects.reduce((acc, p) => acc + (p.metrics?.waitingNodes || 0), 0);
  const activeCount = projects.filter((p) => p.status === 'ACTIVE' || !p.status).length;
  const completedCount = projects.filter((p) => p.metrics?.avgProgress === 100 || p.status === 'COMPLETED').length;

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  };

  const filteredProjects = useMemo(() => {
    return projects
      .filter((project) => {
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const nameMatch = project.name?.toLowerCase().includes(q);
          const keyMatch = project.key?.toLowerCase().includes(q);
          const descMatch = project.description?.toLowerCase().includes(q);
          if (!nameMatch && !keyMatch && !descMatch) return false;
        }

        // Status filter
        if (statusFilter === 'ACTIVE') {
          return project.status === 'ACTIVE' || !project.status;
        }
        if (statusFilter === 'WAITING') {
          return (project.metrics?.waitingNodes || 0) > 0;
        }
        if (statusFilter === 'OVERDUE') {
          return (project.metrics?.overdueNodes || 0) > 0;
        }
        if (statusFilter === 'COMPLETED') {
          return project.metrics?.avgProgress === 100 || project.status === 'COMPLETED';
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return (a.name || '').localeCompare(b.name || '');
        }
        if (sortBy === 'progress') {
          return (b.metrics?.avgProgress || 0) - (a.metrics?.avgProgress || 0);
        }
        if (sortBy === 'targetDate') {
          const dateA = a.targetDate ? new Date(a.targetDate).getTime() : 0;
          const dateB = b.targetDate ? new Date(b.targetDate).getTime() : 0;
          return dateA - dateB;
        }
        // Default: recently updated
        const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return updatedB - updatedA;
      });
  }, [projects, searchQuery, statusFilter, sortBy]);

  if (loading && projects.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 text-center text-slate-400">
        <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium">Loading workspace projects...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Overview Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t('projects')} {t('overview')}
            </h1>
            {currentWorkspace && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                {currentWorkspace.name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Visual node canvases across your team • {projects.length} Total Projects • Role: <span className="font-semibold text-slate-700 dark:text-slate-300">{userRole}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
              title="Refresh projects list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || loading ? 'animate-spin text-blue-600' : 'text-slate-400'}`} />
              <span>Refresh</span>
            </button>
          )}

          <button
            onClick={() => setIsTrashOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            title="View soft-deleted projects"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Trash</span>
          </button>

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

      {/* Metric Cards (Interactive Filters) */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 mb-6">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 rounded-xl border text-left transition-all ${
            statusFilter === 'ALL'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
          } shadow-sm`}
        >
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {t('allProjects')}
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {projects.length}
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('ACTIVE')}
          className={`p-4 rounded-xl border text-left transition-all ${
            statusFilter === 'ACTIVE'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
          } shadow-sm`}
        >
          <div className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">
            {t('inProgress')}
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {activeCount}
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('WAITING')}
          className={`p-4 rounded-xl border text-left transition-all ${
            statusFilter === 'WAITING'
              ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/30 dark:bg-amber-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
          } shadow-sm`}
        >
          <div className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider">
            {t('waiting')} Blockers
          </div>
          <div className="text-2xl font-black text-amber-500 mt-1">
            {totalWaiting}
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('OVERDUE')}
          className={`p-4 rounded-xl border text-left transition-all ${
            statusFilter === 'OVERDUE'
              ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/30 dark:bg-rose-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
          } shadow-sm`}
        >
          <div className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider">
            {t('overdue')} Nodes
          </div>
          <div className="text-2xl font-black text-rose-500 mt-1">
            {totalOverdue}
          </div>
        </button>
      </div>

      {/* Dynamic Search, Filter Pills & Sort Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 mb-6 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects by name, key, or description..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(['ALL', 'ACTIVE', 'WAITING', 'OVERDUE', 'COMPLETED'] as const).map((filter) => {
            const isSelected = statusFilter === filter;
            const labels: Record<string, string> = {
              ALL: `All (${projects.length})`,
              ACTIVE: `Active (${activeCount})`,
              WAITING: `Waiting (${totalWaiting})`,
              OVERDUE: `Overdue (${totalOverdue})`,
              COMPLETED: `Done (${completedCount})`,
            };
            return (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {labels[filter]}
              </button>
            );
          })}
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="updated">Recently Updated</option>
            <option value="name">Name (A–Z)</option>
            <option value="progress">Progress (High–Low)</option>
            <option value="targetDate">Target Date</option>
          </select>
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
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 mb-4">
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
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-16 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-8">
          <Filter className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-60" />
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            No matching projects found
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 mb-4">
            No projects match &ldquo;{searchQuery || statusFilter}&rdquo;. Try adjusting your search term or active filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
            }}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => {
            const m = project.metrics || {};
            const progress = m.avgProgress || 0;
            const isCompleted = progress === 100 || project.status === 'COMPLETED';
            const memberCount = project._count?.members || (project.members ? project.members.length : 1);
            const ownerName = project.owner?.fullName || project.owner?.name;

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project)}
                className="group p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {project.key && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/50">
                            {project.key}
                          </span>
                        )}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          isCompleted
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : m.overdueNodes > 0
                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                            : m.waitingNodes > 0
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {isCompleted ? 'COMPLETED' : project.status || 'ACTIVE'}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug break-words-safe line-clamp-2">
                        {project.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        v{project.version}
                      </span>
                      {permissions.canDeleteProject && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTargetProject(project);
                          }}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Delete project..."
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 leading-relaxed break-words-safe">
                    {project.description || 'No description provided.'}
                  </p>

                  {/* Progress Bar with Percentage */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-500 dark:text-slate-400">Progress</span>
                      <span className={isCompleted ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-blue-600 dark:text-blue-400 font-bold'}>
                        {progress}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isCompleted ? 'bg-emerald-500' : 'bg-blue-600'
                        }`}
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

                    <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {memberCount} {memberCount === 1 ? 'Member' : 'Members'}
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
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    {ownerName && (
                      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <UserIcon className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[90px]">{ownerName}</span>
                        <span>•</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>
                        {project.targetDate
                          ? new Date(project.targetDate).toLocaleDateString()
                          : 'No target date'}
                      </span>
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

      {/* Phase 3 Deletion Impact Modal */}
      <ProjectDeleteImpactModal
        project={deleteTargetProject}
        isOpen={!!deleteTargetProject}
        onClose={() => setDeleteTargetProject(null)}
        onDeleted={() => onRefresh ? onRefresh() : window.location.reload()}
      />

      {/* Phase 3 Trash Projects Recovery Modal */}
      <TrashProjectsModal
        isOpen={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
        onProjectRestored={() => onRefresh ? onRefresh() : window.location.reload()}
      />
    </div>
  );
};
