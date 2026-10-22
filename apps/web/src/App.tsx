import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from './stores/authStore';
import { ApiClient } from './services/api';
import { Navbar } from './components/navbar/Navbar';
import { ProjectList } from './components/projects/ProjectList';
import { CanvasStudio } from './components/canvas/CanvasStudio';
import { AuthModal } from './components/auth/AuthModal';
import { CreateWorkspaceModal } from './components/workspaces/CreateWorkspaceModal';
import { CreateProjectModal } from './components/projects/CreateProjectModal';

export function App() {
  const { user, activeWorkspaceId, loadInitialAuth } = useAuthStore();
  const [currentView, setCurrentView] = useState<'dashboard' | 'canvas'>('dashboard');
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [createWsModalOpen, setCreateWsModalOpen] = useState(false);
  const [createProjModalOpen, setCreateProjModalOpen] = useState(false);

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
                setCreateProjModalOpen(true);
              }
            }}
            loading={loadingProjects}
          />
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
      />
    </div>
  );
}

export default App;
