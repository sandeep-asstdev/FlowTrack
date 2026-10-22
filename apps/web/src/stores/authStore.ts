import { create } from 'zustand';
import { ApiClient } from '../services/api';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  role: string;
  projectCount?: number;
  memberCount?: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  activeWorkspaceId: string | null;
  workspaces: WorkspaceItem[];
  simulatedRole: string | null;
  isLoading: boolean;
  error: string | null;

  setAuth: (user: User, token: string, workspaceId: string, workspaces: WorkspaceItem[]) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  setSimulatedRole: (role: string | null) => void;
  getActiveRole: () => string;
  logout: () => void;
  loadInitialAuth: () => Promise<void>;
  fetchWorkspaces: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: ApiClient.getToken(),
  activeWorkspaceId: ApiClient.getActiveWorkspaceId(),
  workspaces: [],
  simulatedRole: null,
  isLoading: true,
  error: null,

  setAuth: (user, token, workspaceId, workspaces) => {
    ApiClient.setToken(token);
    ApiClient.setActiveWorkspaceId(workspaceId);
    set({ user, token, activeWorkspaceId: workspaceId, workspaces, isLoading: false });
  },

  setActiveWorkspace: (workspaceId) => {
    ApiClient.setActiveWorkspaceId(workspaceId);
    set({ activeWorkspaceId: workspaceId });
  },

  setSimulatedRole: (role) => {
    set({ simulatedRole: role });
  },

  getActiveRole: () => {
    const state = get();
    if (state.simulatedRole) return state.simulatedRole;
    const activeWs = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    return activeWs?.role || 'ADMIN';
  },

  logout: () => {
    ApiClient.setToken(null);
    ApiClient.setActiveWorkspaceId(null);
    set({ user: null, token: null, activeWorkspaceId: null, workspaces: [], simulatedRole: null });
  },

  fetchWorkspaces: async () => {
    try {
      const wsList = await ApiClient.getWorkspaces();
      set({ workspaces: wsList });
      if (!get().activeWorkspaceId && wsList.length > 0) {
        get().setActiveWorkspace(wsList[0].id);
      }
    } catch (e: any) {
      console.error('Failed to fetch workspaces', e);
    }
  },

  loadInitialAuth: async () => {
    const token = ApiClient.getToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      const me = await ApiClient.getMe();
      const activeWs = ApiClient.getActiveWorkspaceId() || me.workspaces[0]?.id;
      ApiClient.setActiveWorkspaceId(activeWs);
      set({
        user: {
          id: me.id,
          email: me.email,
          fullName: me.fullName,
          phone: me.phone,
          avatarUrl: me.avatarUrl,
        },
        workspaces: me.workspaces,
        activeWorkspaceId: activeWs,
        isLoading: false,
      });
    } catch (e) {
      console.warn('Initial session expired');
      get().logout();
      set({ isLoading: false });
    }
  },
}));
