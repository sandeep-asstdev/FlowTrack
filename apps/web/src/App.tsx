import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from './stores/authStore';
import { ApiClient } from './services/api';
import { Navbar } from './components/navbar/Navbar';
import { ProjectList } from './components/projects/ProjectList';
import { CanvasStudio } from './components/canvas/CanvasStudio';
import { AuthModal } from './components/auth/AuthModal';
import { CreateWorkspaceModal } from './components/workspaces/CreateWorkspaceModal';
import { CreateProjectModal } from './components/projects/CreateProjectModal';
import { UniversalDashboard } from './components/reports/UniversalDashboard';

export function App() {
  const { user, activeWorkspaceId, loadInitialAuth } = useAuthStore();
  const [currentView, setCurrentView] = useState<'dashboard' | 'canvas' | 'reports'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

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

  const handleSelectProject = (project: any) => {
    setSelectedProject(project);
    setCurrentView('canvas');
  };

  const handleProjectCreated = (newProject: any) => {
    fetchProjects();
    handleSelectProject(newProject);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenCreateWorkspace={() => setCreateWsModalOpen(true)}
        currentView={currentView}
        onViewChange={(v) => setCurrentView(v)}
        projectName={selectedProject?.name}
      />

      <main className="flex-1 flex flex-col">
        {currentView === 'dashboard' ? (
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
            {projects.length === 0 ? (
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
                          if (p) setSelectedProject(p);
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
        ) : (
          <CanvasStudio
            project={selectedProject}
            onBack={() => setCurrentView('dashboard')}
          />
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
