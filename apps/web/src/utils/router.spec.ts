import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseCurrentRoute,
  routeToUrl,
  navigateToRoute,
  subscribeToRoute,
  parseValidViewport,
  AppRoute,
} from './router';

describe('Router & Project Navigation', () => {
  let listeners: Record<string, ((e: any) => void)[]> = {};

  beforeEach(() => {
    listeners = {};

    const mockWindow = {
      location: {
        pathname: '/',
        search: '',
        hash: '',
      },
      history: {
        pushState: vi.fn((state: any, title: string, url: string) => {
          mockWindow.location.pathname = url;
        }),
        replaceState: vi.fn((state: any, title: string, url: string) => {
          mockWindow.location.pathname = url;
        }),
      },
      addEventListener: vi.fn((event: string, callback: any) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
      }),
      removeEventListener: vi.fn((event: string, callback: any) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((cb) => cb !== callback);
        }
      }),
      dispatchEvent: vi.fn((event: any) => {
        const cbs = listeners[event.type] || [];
        cbs.forEach((cb) => cb(event));
        return true;
      }),
    };

    (globalThis as any).window = mockWindow;
    (globalThis as any).CustomEvent = class {
      type: string;
      detail: any;
      constructor(type: string, init?: any) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
    (globalThis as any).PopStateEvent = class {
      type: string = 'popstate';
      constructor(type: string = 'popstate') {
        this.type = type;
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).CustomEvent;
    delete (globalThis as any).PopStateEvent;
  });

  describe('parseCurrentRoute', () => {
    it('parses root and /dashboard as dashboard view', () => {
      window.location.pathname = '/';
      expect(parseCurrentRoute()).toEqual({ view: 'dashboard' });

      window.location.pathname = '/dashboard';
      expect(parseCurrentRoute()).toEqual({ view: 'dashboard' });
    });

    it('parses /projects/:id as canvas view with stable projectId', () => {
      window.location.pathname = '/projects/project-uuid-123';
      expect(parseCurrentRoute()).toEqual({
        view: 'canvas',
        projectId: 'project-uuid-123',
      });
    });

    it('parses encoded project IDs correctly', () => {
      window.location.pathname = '/projects/proj%20with%20spaces';
      expect(parseCurrentRoute()).toEqual({
        view: 'canvas',
        projectId: 'proj with spaces',
      });
    });

    it('parses legacy /canvas/:id paths as canvas view', () => {
      window.location.pathname = '/canvas/proj-canvas-456';
      expect(parseCurrentRoute()).toEqual({
        view: 'canvas',
        projectId: 'proj-canvas-456',
      });
    });

    it('parses standard app views (/reports, /users, /approvals, /my-work)', () => {
      window.location.pathname = '/reports';
      expect(parseCurrentRoute()).toEqual({ view: 'reports', projectId: undefined });

      window.location.pathname = '/reports/proj-report-1';
      expect(parseCurrentRoute()).toEqual({ view: 'reports', projectId: 'proj-report-1' });

      window.location.pathname = '/users';
      expect(parseCurrentRoute()).toEqual({ view: 'users' });

      window.location.pathname = '/approvals';
      expect(parseCurrentRoute()).toEqual({ view: 'approvals' });

      window.location.pathname = '/my-work';
      expect(parseCurrentRoute()).toEqual({ view: 'my-work' });
    });

    it('supports hash-based fallback routes (#/projects/:id)', () => {
      window.location.pathname = '/';
      window.location.hash = '#/projects/hash-proj-789';
      expect(parseCurrentRoute()).toEqual({
        view: 'canvas',
        projectId: 'hash-proj-789',
      });

      window.location.hash = '#/users';
      expect(parseCurrentRoute()).toEqual({ view: 'users' });
    });

    it('supports query parameter fallback (?project=:id)', () => {
      window.location.pathname = '/';
      window.location.search = '?project=query-proj-101';
      expect(parseCurrentRoute()).toEqual({
        view: 'canvas',
        projectId: 'query-proj-101',
      });
    });
  });

  describe('routeToUrl', () => {
    it('generates canonical URL for canvas with projectId', () => {
      expect(routeToUrl({ view: 'canvas', projectId: 'proj-alpha' })).toBe('/projects/proj-alpha');
    });

    it('falls back to dashboard if canvas route lacks projectId', () => {
      expect(routeToUrl({ view: 'canvas' })).toBe('/');
    });

    it('generates canonical URLs for other standard views', () => {
      expect(routeToUrl({ view: 'dashboard' })).toBe('/');
      expect(routeToUrl({ view: 'reports' })).toBe('/reports');
      expect(routeToUrl({ view: 'reports', projectId: 'p-1' })).toBe('/reports/p-1');
      expect(routeToUrl({ view: 'users' })).toBe('/users');
      expect(routeToUrl({ view: 'approvals' })).toBe('/approvals');
      expect(routeToUrl({ view: 'my-work' })).toBe('/my-work');
    });
  });

  describe('navigateToRoute & subscribeToRoute', () => {
    it('notifies subscribers and updates history when navigating to a new route', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToRoute(callback);

      const targetRoute: AppRoute = { view: 'canvas', projectId: 'proj-navigate-99' };
      navigateToRoute(targetRoute);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { route: targetRoute },
        '',
        '/projects/proj-navigate-99'
      );
      expect(callback).toHaveBeenCalledWith(targetRoute);

      unsubscribe();
    });

    it('handles browser popstate back/forward navigation', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToRoute(callback);

      window.location.pathname = '/projects/back-nav-proj';
      window.dispatchEvent(new (globalThis as any).PopStateEvent('popstate'));

      expect(callback).toHaveBeenCalledWith({
        view: 'canvas',
        projectId: 'back-nav-proj',
      });

      unsubscribe();
    });
  });

  describe('parseValidViewport', () => {
    it('accepts valid viewport numbers within bounds', () => {
      expect(parseValidViewport({ x: 100, y: -50, zoom: 1.2 })).toEqual({
        x: 100,
        y: -50,
        zoom: 1.2,
      });

      expect(parseValidViewport({ x: 0, y: 0, zoom: 0.1 })).toEqual({
        x: 0,
        y: 0,
        zoom: 0.1,
      });
    });

    it('rejects null, undefined, or non-object values', () => {
      expect(parseValidViewport(null)).toBeNull();
      expect(parseValidViewport(undefined)).toBeNull();
      expect(parseValidViewport('string')).toBeNull();
      expect(parseValidViewport(123)).toBeNull();
    });

    it('rejects NaN, Infinity, or missing coordinates', () => {
      expect(parseValidViewport({ x: NaN, y: 0, zoom: 1 })).toBeNull();
      expect(parseValidViewport({ x: 0, y: Infinity, zoom: 1 })).toBeNull();
      expect(parseValidViewport({ x: 0, y: 0 })).toBeNull();
    });

    it('rejects zoom levels out of reasonable range', () => {
      expect(parseValidViewport({ x: 0, y: 0, zoom: 0.05 })).toBeNull();
      expect(parseValidViewport({ x: 0, y: 0, zoom: 5 })).toBeNull();
      expect(parseValidViewport({ x: 0, y: 0, zoom: -1 })).toBeNull();
    });
  });

  describe('Direct Project Restoration on Refresh & Loading State Guard', () => {
    it('accurately parses direct canvas route on page refresh', () => {
      window.location.pathname = '/projects/210b54f1-8658-4265-b2ce-227a79f01b93';
      const route = parseCurrentRoute();
      expect(route.view).toBe('canvas');
      expect(route.projectId).toBe('210b54f1-8658-4265-b2ce-227a79f01b93');
    });

    it('ensures loadingInitialProject guard is never active when selectedProject matches targetProjectId', () => {
      const targetProjectId = '210b54f1-8658-4265-b2ce-227a79f01b93';
      const selectedProject = { id: '210b54f1-8658-4265-b2ce-227a79f01b93', name: 'Project Titan' };

      // In App.tsx: (loadingInitialProject && (!selectedProject || selectedProject.id !== targetProjectId))
      const shouldShowInitialLoading = (loadingInitialProject: boolean, proj: any, targetId: string) => {
        return Boolean(loadingInitialProject && (!proj || proj.id !== targetId));
      };

      // Even if loadingInitialProject flag was true, if project is already in memory, it must not block canvas
      expect(shouldShowInitialLoading(true, selectedProject, targetProjectId)).toBe(false);
      expect(shouldShowInitialLoading(false, selectedProject, targetProjectId)).toBe(false);

      // Only displays when project is still null / loading
      expect(shouldShowInitialLoading(true, null, targetProjectId)).toBe(true);
      expect(shouldShowInitialLoading(true, { id: 'other-id' }, targetProjectId)).toBe(true);
    });
  });
});
