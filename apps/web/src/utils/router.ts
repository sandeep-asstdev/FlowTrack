export type AppView = 'dashboard' | 'canvas' | 'reports' | 'users' | 'approvals' | 'my-work';

export interface AppRoute {
  view: AppView;
  projectId?: string;
}

const ROUTE_CHANGE_EVENT = 'app:routechange';

/**
 * Parses the current browser location into an AppRoute.
 * Supports standard pathnames (/projects/:id, /reports, /users, etc.),
 * hash fallback (#/projects/:id), and query parameters (?project=:id).
 */
export function parseCurrentRoute(): AppRoute {
  if (typeof window === 'undefined') {
    return { view: 'dashboard' };
  }

  // Check hash fallback first if present (e.g. #/projects/123 or #/users)
  const hash = window.location.hash || '';
  if (hash.startsWith('#/')) {
    const hashPath = hash.slice(1); // remove '#' -> '/projects/123'
    const parsed = parsePathString(hashPath);
    if (parsed) return parsed;
  }

  // Check search query parameter (?project=123)
  const searchParams = new URLSearchParams(window.location.search);
  const queryProjectId = searchParams.get('project');
  if (queryProjectId) {
    return { view: 'canvas', projectId: queryProjectId };
  }

  // Check standard pathname (/projects/:id, etc.)
  const parsed = parsePathString(window.location.pathname);
  if (parsed) return parsed;

  return { view: 'dashboard' };
}

function parsePathString(pathname: string): AppRoute | null {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';

  // Projects / Canvas route: /projects/:projectId or /canvas/:projectId
  const projectMatch = cleanPath.match(/^\/(?:projects|canvas)\/([^/?#]+)/i);
  if (projectMatch && projectMatch[1]) {
    return { view: 'canvas', projectId: decodeURIComponent(projectMatch[1]) };
  }

  if (cleanPath === '/reports' || cleanPath.startsWith('/reports/')) {
    const reportMatch = cleanPath.match(/^\/reports\/([^/?#]+)/i);
    return {
      view: 'reports',
      projectId: reportMatch ? decodeURIComponent(reportMatch[1]) : undefined,
    };
  }

  if (cleanPath === '/users') {
    return { view: 'users' };
  }

  if (cleanPath === '/approvals') {
    return { view: 'approvals' };
  }

  if (cleanPath === '/my-work') {
    return { view: 'my-work' };
  }

  if (cleanPath === '/' || cleanPath === '/dashboard') {
    return { view: 'dashboard' };
  }

  return null;
}

/**
 * Converts an AppRoute into a canonical URL pathname.
 */
export function routeToUrl(route: AppRoute): string {
  switch (route.view) {
    case 'canvas':
      return route.projectId ? `/projects/${encodeURIComponent(route.projectId)}` : '/';
    case 'reports':
      return route.projectId ? `/reports/${encodeURIComponent(route.projectId)}` : '/reports';
    case 'users':
      return '/users';
    case 'approvals':
      return '/approvals';
    case 'my-work':
      return '/my-work';
    case 'dashboard':
    default:
      return '/';
  }
}

/**
 * Navigates to a new route using HTML5 History API.
 * Dispatches a custom event so in-memory listeners react immediately.
 */
export function navigateToRoute(route: AppRoute, replace = false): void {
  if (typeof window === 'undefined') return;

  const targetUrl = routeToUrl(route);
  const currentPath = window.location.pathname;

  if (currentPath !== targetUrl) {
    if (replace) {
      window.history.replaceState({ route }, '', targetUrl);
    } else {
      window.history.pushState({ route }, '', targetUrl);
    }
  }

  window.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT, { detail: route }));
}

/**
 * Subscribes to route changes (both browser back/forward and programmatic navigation).
 */
export function subscribeToRoute(callback: (route: AppRoute) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handlePopState = () => {
    callback(parseCurrentRoute());
  };

  const handleCustomChange = (e: Event) => {
    const custom = e as CustomEvent<AppRoute>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(parseCurrentRoute());
    }
  };

  window.addEventListener('popstate', handlePopState);
  window.addEventListener(ROUTE_CHANGE_EVENT, handleCustomChange);

  return () => {
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener(ROUTE_CHANGE_EVENT, handleCustomChange);
  };
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Validates and sanitizes canvas viewport coordinates.
 * Returns null if any coordinate is missing, NaN, infinite, or out of reasonable bounds.
 */
export function parseValidViewport(data: any): CanvasViewport | null {
  if (!data || typeof data !== 'object') return null;
  const x = Number(data.x);
  const y = Number(data.y);
  const zoom = Number(data.zoom);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) {
    return null;
  }
  if (zoom < 0.1 || zoom > 3) {
    return null;
  }
  return { x, y, zoom };
}
