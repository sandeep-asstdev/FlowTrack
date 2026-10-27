import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from './stores/authStore';
import { ApiClient } from './services/api';
import { Navbar } from './components/navbar/Navbar';
import { ProjectList } from './components/projects/ProjectList';
import { CanvasStudio } from './components/canvas/CanvasStudio';
import { AuthModal } from './components/auth/AuthModal';
import { CreateWorkspaceModal } from './components/workspaces/CreateWorkspaceModal';
import { CreateProjectModal } from './components/projects/CreateProjectModal';
import { UniversalDashboard } from './components/reports/UniversalDashboard';
import { UserManagementView } from './components/users/UserManagementView';
import { ReviewQueueView } from './components/approvals/ReviewQueueView';
import { MyWorkView } from './components/dashboard/MyWorkView';
import {
  AppRoute,
  AppView,
  parseCurrentRoute,
  routeToUrl,
  navigateToRoute,
  subscribeToRoute,
} from './utils/router';
import { Loader2, AlertCircle, ArrowLeft, ShieldAlert } from 'lucide-react';

export function App() {
  const { user, activeWorkspaceId, setActiveWorkspace, loadInitialAuth, isLoading: isAuthLoading } = useAuthStore();
  const initialRoute = parseCurrentRoute();

  const [currentView, setCurrentView] = useState<AppView>(initialRoute.view);
  const [targetProjectId, setTargetProjectId] = useState<string | undefined>(initialRoute.projectId);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingInitialProject, setLoadingInitialProject] = useState(false);
  const [routeError, setRouteError] = useState<{
    type: 'not_found' | 'unauthorized' | 'session_expired' | 'generic';
    message: string;
  } | null>(null);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [createWsModalOpen, setCreateWsModalOpen] = useState(false);
  const [createProjModalOpen, setCreateProjModalOpen] = useState(false);
  const [createProjModalMode, setCreateProjModalMode] = useState<'template' | 'blank' | 'clone'>('template');
  const [cloneSourceId, setCloneSourceId] = useState<string | undefined>(undefined);

  // Load auth state on launch
  useEffect(() => {
    loadInitialAuth();
  }, [loadInitialAuth]);

  // Subscribe to URL route changes (popstate and programmatic navigation)
  useEffect(() => {
    // Synchronize initial URL in address bar if needed
    const current = parseCurrentRoute();
    const currentUrl = routeToUrl(current);
    if (window.location.pathname !== currentUrl && !window.location.hash) {
      navigateToRoute(current, true);
    }

    return subscribeToRoute((route: AppRoute) => {
      setCurrentView(route.view);
      setTargetProjectId(route.projectId);
      setRouteError(null);
    });
  }, []);

  // Fetch projects whenever active workspace changes
  const fetchProjects = useCallback(async () => {
    if (!activeWorkspaceId) {
      setProjects([]);
      return;
    }
    try {
      setLoadingProjects(true);
      const data = await ApiClient.getProjects();
      setProjects(data);
    } catch (e) {
      console.error('Failed to load projects:', e);
    } finally {
      setLoadingProjects(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Project direct loading on refresh or route change to /projects/:id
  const targetIdRef = useRef<string | undefined>(targetProjectId);
  targetIdRef.current = targetProjectId;
  const inFlightProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if ((currentView === 'canvas' || currentView === 'reports') && targetProjectId) {
      // If we already have this project in memory, no need to refetch
      if (selectedProject?.id === targetProjectId) {
        setLoadingInitialProject(false);
        return;
      }

      // Check if project exists in already loaded project list
      const existingInList = projects.find((p) => p.id === targetProjectId);
      if (existingInList) {
        setSelectedProject(existingInList);
        setLoadingInitialProject(false);
        return;
      }

      // Wait until initial auth finishes checking session and workspace is resolved
      if (isAuthLoading || (user && !activeWorkspaceId)) {
        return;
      }

      // If not authenticated and no token
      if (!user && !ApiClient.getToken()) {
        setLoadingInitialProject(false);
        setAuthModalOpen(true);
        setRouteError({
          type: 'session_expired',
          message: 'Authentication required. Please sign in to access this project.',
        });
        return;
      }

      // Prevent duplicate in-flight requests for the same targetProjectId
      if (inFlightProjectIdRef.current === targetProjectId) {
        return;
      }

      inFlightProjectIdRef.current = targetProjectId;
      setLoadingInitialProject(true);
      setRouteError(null);

      ApiClient.getProject(targetProjectId)
        .then((proj) => {
          if (targetIdRef.current !== targetProjectId) return;
          setSelectedProject(proj);
          if (proj.workspaceId && proj.workspaceId !== activeWorkspaceId) {
            setActiveWorkspace(proj.workspaceId);
          }
        })
        .catch((err: any) => {
          if (targetIdRef.current !== targetProjectId) return;
          const status = err.status || err.statusCode;
          const msg = err.message || '';

          if (status === 404 || msg.toLowerCase().includes('not found')) {
            setRouteError({
              type: 'not_found',
              message: 'The requested project could not be found or may have been deleted.',
            });
          } else if (status === 403 || msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('permission')) {
            setRouteError({
              type: 'unauthorized',
              message: 'You do not have permission to access this project.',
            });
          } else if (status === 401 || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('expired')) {
            setRouteError({
              type: 'session_expired',
              message: 'Your session has expired. Please sign in to continue.',
            });
            setAuthModalOpen(true);
          } else {
            setRouteError({
              type: 'generic',
              message: err.message || 'Failed to load project data. Please try again.',
            });
          }
        })
        .finally(() => {
          if (inFlightProjectIdRef.current === targetProjectId) {
            inFlightProjectIdRef.current = null;
          }
          setLoadingInitialProject(false);
        });
    } else {
      setLoadingInitialProject(false);
    }
  }, [currentView, targetProjectId, selectedProject?.id, projects, isAuthLoading, user, activeWorkspaceId, setActiveWorkspace]);

  const handleSelectProject = (project: any) => {
    setSelectedProject(project);
    setTargetProjectId(project.id);
    setCurrentView('canvas');
    setRouteError(null);
    navigateToRoute({ view: 'canvas', projectId: project.id });
  };

  const handleBackToDashboard = () => {
    setSelectedProject(null);
    setTargetProjectId(undefined);
    setCurrentView('dashboard');
    setRouteError(null);
    navigateToRoute({ view: 'dashboard' });
  };

  const handleProjectCreated = (newProject: any) => {
    fetchProjects();
    handleSelectProject(newProject);
  };

  const handleViewChange = (v: AppView) => {
    setCurrentView(v);
    setRouteError(null);
    const pid = v === 'canvas' || v === 'reports' ? (selectedProject?.id || targetProjectId) : undefined;
    navigateToRoute({ view: v, projectId: pid });
  };

  return (
    <div className="min-h-[100dvh] w-full min-w-0 max-w-full overflow-x-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenCreateWorkspace={() => setCreateWsModalOpen(true)}
        currentView={currentView}
        onViewChange={handleViewChange}
        projectName={selectedProject?.name}
      />

      <main className="flex-1 flex flex-col min-w-0 max-w-full">
        {/* Route Error Guard (404, 403, 401) */}
        {routeError ? (
          <div className="flex-1 flex items-center justify-center p-3 sm:p-6">
            <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center">
                {routeError.type === 'unauthorized' ? (
                  <ShieldAlert className="w-7 h-7" />
                ) : (
                  <AlertCircle className="w-7 h-7" />
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
                {routeError.type === 'not_found'
                  ? 'Project Not Found'
                  : routeError.type === 'unauthorized'
                  ? 'Access Restricted'
                  : routeError.type === 'session_expired'
                  ? 'Session Expired'
                  : 'Unable to Load Project'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-6">
                {routeError.message}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleBackToDashboard}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-colors w-full sm:w-auto"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Dashboard
                </button>
                {routeError.type === 'session_expired' && (
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="px-5 py-2.5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors w-full sm:w-auto"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (loadingInitialProject && (!selectedProject || selectedProject.id !== targetProjectId)) ? (
          /* Project Loading State on Direct URL / Refresh (Never redirects unexpectedly!) */
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Opening project canvas...
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Restoring workflow state and nodes
              </p>
            </div>
          </div>
        ) : currentView === 'dashboard' ? (
          <ProjectList
            projects={projects}
            onSelectProject={handleSelectProject}
            onOpenCreateModal={() => {
              if (!user) {
                setAuthModalOpen(true);
              } else {
                setCreateProjModalMode('template');
                setCloneSourceId(undefined);
                setCreateProjModalOpen(true);
              }
            }}
            onCloneProject={(project) => {
              if (!user) {
                setAuthModalOpen(true);
              } else {
                setCreateProjModalMode('clone');
                setCloneSourceId(project.id);
                setCreateProjModalOpen(true);
              }
            }}
            loading={loadingProjects}
          />
        ) : currentView === 'reports' ? (
          <div className="flex-1 flex flex-col">
            {projects.length === 0 && !selectedProject ? (
              <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-400">
                <p className="text-sm font-medium">No projects available in this workspace to report on.</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {projects.length > 1 && (
                  <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">Selected Project:</span>
                      <select
                        value={selectedProject?.id || projects[0]?.id}
                        onChange={(e) => {
                          const p = projects.find((proj) => proj.id === e.target.value);
                          if (p) {
                            setSelectedProject(p);
                            setTargetProjectId(p.id);
                            navigateToRoute({ view: 'reports', projectId: p.id });
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                <UniversalDashboard
                  projectId={selectedProject?.id || projects[0]?.id}
                  project={selectedProject || projects[0]}
                />
              </div>
            )}
          </div>
        ) : currentView === 'users' ? (
          <UserManagementView />
        ) : currentView === 'approvals' ? (
          <ReviewQueueView />
        ) : currentView === 'my-work' ? (
          <MyWorkView
            onSelectProject={(projId) => {
              const p = projects.find((proj) => proj.id === projId);
              if (p) {
                handleSelectProject(p);
              } else {
                setTargetProjectId(projId);
                setCurrentView('canvas');
                navigateToRoute({ view: 'canvas', projectId: projId });
              }
            }}
          />
        ) : selectedProject ? (
          <CanvasStudio
            project={selectedProject}
            onBack={handleBackToDashboard}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Loading canvas...
            </p>
          </div>
        )}
      </main>

      {/* Modals */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <CreateWorkspaceModal
        isOpen={createWsModalOpen}
        onClose={() => setCreateWsModalOpen(false)}
      />
      <CreateProjectModal
        isOpen={createProjModalOpen}
        onClose={() => setCreateProjModalOpen(false)}
        onSuccess={handleProjectCreated}
        initialMode={createProjModalMode}
        initialSourceProjectId={cloneSourceId}
      />
    </div>
  );
}

export default App;
