import { Page, Route } from '@playwright/test';

export interface MockState {
  users: Array<{
    id: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
    role: string;
    isActive: boolean;
  }>;
  currentUser: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  } | null;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
  activeWorkspaceId: string;
  projects: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    workspaceId: string;
    nodeCount?: number;
    edgeCount?: number;
    nodes: any[];
    edges: any[];
  }>;
  teams: Array<{
    id: string;
    name: string;
    colour?: string;
    leadId?: string;
  }>;
  fieldDefinitions: any[];
  notifications: any[];
  reviewQueue: any[];
}

export function createInitialMockState(): MockState {
  const users = [
    {
      id: 'usr-admin',
      email: 'admin@flowtrack.dev',
      fullName: 'System Administrator',
      role: 'ADMIN',
      isActive: true,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80',
    },
    {
      id: 'usr-manager',
      email: 'suresh@flowtrack.dev',
      fullName: 'Suresh Sharma',
      role: 'MANAGER',
      isActive: true,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&q=80',
    },
    {
      id: 'usr-lead',
      email: 'lead@flowtrack.dev',
      fullName: 'Vikram Patel',
      role: 'TEAM_LEAD',
      isActive: true,
    },
    {
      id: 'usr-member',
      email: 'ramesh@flowtrack.dev',
      fullName: 'Ramesh Kumar',
      role: 'MEMBER',
      isActive: true,
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&q=80',
    },
  ];

  const workspaces = [
    {
      id: 'ws-acme',
      name: 'Acme Developments',
      slug: 'acme-developments',
      role: 'ADMIN',
    },
  ];

  const node1 = {
    id: 'node-101',
    projectId: 'proj-skyline',
    title: 'Site Excavation & Grading',
    name: 'Site Excavation & Grading',
    description: 'Initial site preparation and soil testing for tower foundation',
    statusId: 'status-done',
    status: {
      id: 'status-done',
      key: 'done',
      labelI18n: { en: 'Done' },
      colour: '#10b981',
      category: 'done',
    },
    priority: 'HIGH',
    type: 'task',
    ownerId: 'usr-member',
    owner: users[3],
    assignedById: 'usr-manager',
    dueDate: '2026-11-15',
    progressPct: 100,
    requiresApproval: true,
    approvalStatus: 'approved',
    positionX: 100,
    positionY: 150,
    tags: ['Site', 'Civil'],
    customFields: {},
    remarks: [],
    documents: [],
  };

  const node2 = {
    id: 'node-102',
    projectId: 'proj-skyline',
    title: 'Foundation Concrete Pouring',
    name: 'Foundation Concrete Pouring',
    description: 'Pour high-strength reinforced concrete for tower core',
    statusId: 'status-in-progress',
    status: {
      id: 'status-in-progress',
      key: 'in_progress',
      labelI18n: { en: 'In Progress' },
      colour: '#3b82f6',
      category: 'active',
    },
    priority: 'URGENT',
    type: 'task',
    ownerId: 'usr-member',
    owner: users[3],
    assignedById: 'usr-manager',
    dueDate: '2026-12-01',
    progressPct: 45,
    requiresApproval: true,
    approvalStatus: 'pending',
    positionX: 420,
    positionY: 150,
    tags: ['Foundation', 'Concrete'],
    customFields: {},
    remarks: [],
    documents: [],
  };

  const node3 = {
    id: 'node-103',
    projectId: 'proj-skyline',
    title: 'Structural Steel Erection',
    name: 'Structural Steel Erection',
    description: 'Erect columns and trusses for floors 1 to 10',
    statusId: 'status-not-started',
    status: {
      id: 'status-not-started',
      key: 'not_started',
      labelI18n: { en: 'Not Started' },
      colour: '#94a3b8',
      category: 'not_started',
    },
    priority: 'MEDIUM',
    type: 'task',
    ownerId: 'usr-lead',
    owner: users[2],
    dueDate: '2026-12-20',
    progressPct: 0,
    requiresApproval: false,
    approvalStatus: 'none',
    positionX: 740,
    positionY: 150,
    tags: ['Steel', 'Framing'],
    customFields: {},
    remarks: [],
    documents: [],
  };

  const edge1 = {
    id: 'edge-101-102',
    projectId: 'proj-skyline',
    sourceNodeId: 'node-101',
    targetNodeId: 'node-102',
    kind: 'sequence',
    sourceHandle: 'source',
    targetHandle: 'target',
  };

  const projects = [
    {
      id: 'proj-skyline',
      name: 'Skyline Commercial Tower',
      description: '45-story commercial office building project with LEED Gold certification',
      status: 'ACTIVE',
      workspaceId: 'ws-acme',
      nodeCount: 3,
      edgeCount: 1,
      nodes: [node1, node2, node3],
      edges: [edge1],
    },
  ];

  const teams = [
    {
      id: 'team-civil',
      name: 'Civil & Structural Engineering',
      colour: '#3b82f6',
      leadId: 'usr-lead',
    },
    {
      id: 'team-safety',
      name: 'Site Safety & Compliance',
      colour: '#10b981',
      leadId: 'usr-manager',
    },
  ];

  return {
    users,
    currentUser: users[0], // Admin by default
    workspaces,
    activeWorkspaceId: 'ws-acme',
    projects,
    teams,
    fieldDefinitions: [],
    notifications: [],
    reviewQueue: [
      {
        id: 'review-1',
        nodeId: 'node-102',
        node: node2,
        submittedAt: '2026-10-27T08:00:00Z',
        submitter: users[3],
        status: 'pending',
      },
    ],
  };
}

export async function setupMockApi(page: Page, customState?: Partial<MockState>) {
  const state: MockState = {
    ...createInitialMockState(),
    ...customState,
  };

  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    const json = (status: number, data: any) => {
      return route.fulfill({
        status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    };

    // CORS preflight
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // 1. Health check
    if (path === '/health') {
      return json(200, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: { status: 'connected' },
      });
    }

    // 2. Auth: me
    if (path === '/auth/me') {
      if (!state.currentUser) {
        return json(401, { message: 'Session expired or not authenticated' });
      }
      return json(200, {
        id: state.currentUser.id,
        email: state.currentUser.email,
        fullName: state.currentUser.fullName,
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          role: state.currentUser!.role,
        })),
      });
    }

    // 3. Auth: login
    if (path === '/auth/login' && method === 'POST') {
      const body = request.postDataJSON();
      const user = state.users.find((u) => u.email.toLowerCase() === (body.email || '').toLowerCase());
      if (!user || body.password !== 'Password123!') {
        return json(401, { message: 'Invalid email or password' });
      }

      state.currentUser = user;
      const token = `mock-jwt-token-for-${user.id}`;
      return json(200, {
        token,
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
        },
        activeWorkspaceId: state.activeWorkspaceId,
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          role: user.role,
        })),
      });
    }

    // 4. Auth: Google login
    if (path === '/auth/google' && method === 'POST') {
      const body = request.postDataJSON();
      if (!body.idToken || body.idToken === 'invalid-google-token') {
        return json(401, { message: 'Invalid or unverified Google token' });
      }

      const googleUser = {
        id: 'usr-google-alex',
        email: 'alex.rivera@flowtrack.dev',
        fullName: 'Alex Rivera (Google)',
        role: 'MEMBER',
        isActive: true,
      };

      state.currentUser = googleUser;
      if (!state.users.find((u) => u.id === googleUser.id)) {
        state.users.push(googleUser);
      }

      const googleToken = 'mock-google-jwt-token-alex';
      return json(200, {
        token: googleToken,
        accessToken: googleToken,
        user: googleUser,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaces: state.workspaces.map((ws) => ({
          ...ws,
          role: 'MEMBER',
        })),
      });
    }

    // 5. Workspaces
    if (path === '/workspaces' && method === 'GET') {
      return json(
        200,
        state.workspaces.map((ws) => ({
          ...ws,
          role: state.currentUser?.role || 'MEMBER',
        }))
      );
    }

    if (path === '/workspaces' && method === 'POST') {
      const body = request.postDataJSON();
      const newWs = {
        id: `ws-${Date.now()}`,
        name: body.name || 'New Workspace',
        slug: (body.name || 'new-workspace').toLowerCase().replace(/\s+/g, '-'),
        role: 'ADMIN',
      };
      state.workspaces.push(newWs);
      return json(201, newWs);
    }

    if (path.includes('/members') && method === 'GET') {
      return json(
        200,
        state.users.map((u) => ({
          id: `mem-${u.id}`,
          userId: u.id,
          user: u,
          role: u.role,
          isActive: u.isActive,
        }))
      );
    }

    if (path.includes('/role') && method === 'PATCH') {
      const body = request.postDataJSON();
      const parts = path.split('/');
      const userId = parts[parts.indexOf('members') + 1];
      const targetUser = state.users.find((u) => u.id === userId);
      if (targetUser) {
        targetUser.role = body.role;
      }
      return json(200, { success: true, userId, role: body.role });
    }

    // 6. Projects
    if (path === '/projects' && method === 'GET') {
      return json(
        200,
        state.projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          workspaceId: p.workspaceId,
          nodeCount: p.nodes.length,
          edgeCount: p.edges.length,
        }))
      );
    }

    if (path === '/projects' && method === 'POST') {
      const body = request.postDataJSON();
      const newProj = {
        id: `proj-${Date.now()}`,
        name: body.name || 'Untitled Project',
        description: body.description || '',
        status: 'ACTIVE',
        workspaceId: state.activeWorkspaceId,
        nodeCount: 0,
        edgeCount: 0,
        nodes: [],
        edges: [],
      };
      state.projects.push(newProj);
      return json(201, newProj);
    }

    const projMatch = path.match(/^\/projects\/([a-zA-Z0-9_-]+)$/);
    if (projMatch && method === 'GET') {
      const projId = projMatch[1];
      const proj = state.projects.find((p) => p.id === projId);
      if (!proj) {
        return json(404, { message: 'Project not found' });
      }
      return json(200, proj);
    }

    // 7. Nodes
    if (path === '/nodes' && method === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const proj = state.projects.find((p) => p.id === projectId) || state.projects[0];
      return json(200, proj ? proj.nodes : []);
    }

    if (path === '/nodes' && method === 'POST') {
      const body = request.postDataJSON();
      const proj = state.projects.find((p) => p.id === body.projectId) || state.projects[0];
      const newNode = {
        id: `node-${Date.now()}`,
        projectId: proj.id,
        title: body.title || body.name || 'New Task Item',
        name: body.title || body.name || 'New Task Item',
        description: body.description || '',
        statusId: body.statusId || 'status-not-started',
        status: {
          id: 'status-not-started',
          key: 'not_started',
          labelI18n: { en: 'Not Started' },
          colour: '#94a3b8',
          category: 'not_started',
        },
        priority: body.priority || 'MEDIUM',
        type: body.type || 'task',
        positionX: body.positionX ?? 300,
        positionY: body.positionY ?? 300,
        ownerId: body.ownerId || state.currentUser?.id,
        owner: state.currentUser,
        requiresApproval: !!body.requiresApproval,
        approvalStatus: 'none',
        customFields: body.customFields || {},
        remarks: [],
        documents: [],
      };
      proj.nodes.push(newNode);
      return json(201, newNode);
    }

    const nodeMatch = path.match(/^\/nodes\/([a-zA-Z0-9_-]+)$/);
    if (nodeMatch && method === 'GET') {
      const nodeId = nodeMatch[1];
      for (const proj of state.projects) {
        const node = proj.nodes.find((n) => n.id === nodeId);
        if (node) {
          return json(200, {
            ...node,
            title: node.name,
            documents: node.documents || [],
            remarks: node.remarks || [],
          });
        }
      }
      return json(404, { message: 'Node not found' });
    }

    if (path.includes('/history') && method === 'GET') {
      return json(200, []);
    }

    if (path.includes('/approvals') && method === 'GET') {
      return json(200, []);
    }

    if (path.includes('/documents') && method === 'GET') {
      return json(200, []);
    }

    if (path.includes('/remarks') && method === 'GET') {
      return json(200, []);
    }

    if (nodeMatch && method === 'PATCH') {
      const nodeId = nodeMatch[1];
      const body = request.postDataJSON();
      for (const proj of state.projects) {
        const node = proj.nodes.find((n) => n.id === nodeId);
        if (node) {
          Object.assign(node, body);
          return json(200, node);
        }
      }
      return json(404, { message: 'Node not found' });
    }

    if (nodeMatch && method === 'DELETE') {
      const nodeId = nodeMatch[1];
      for (const proj of state.projects) {
        proj.nodes = proj.nodes.filter((n) => n.id !== nodeId);
        proj.edges = proj.edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId);
      }
      return json(200, { success: true, nodeId });
    }

    // 8. Edges
    if (path.startsWith('/edges') && method === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const proj = state.projects.find((p) => p.id === projectId) || state.projects[0];
      return json(200, proj ? proj.edges : []);
    }

    if (path === '/edges' && method === 'POST') {
      const body = request.postDataJSON();
      const proj = state.projects.find((p) => p.id === body.projectId) || state.projects[0];
      const newEdge = {
        id: `edge-${Date.now()}`,
        projectId: proj.id,
        sourceNodeId: body.sourceNodeId || body.source,
        targetNodeId: body.targetNodeId || body.target,
        kind: body.kind || 'sequence',
        sourceHandle: body.sourceHandle || 'source',
        targetHandle: body.targetHandle || 'target',
      };
      proj.edges.push(newEdge);
      return json(201, newEdge);
    }

    const edgeMatch = path.match(/^\/edges\/([a-zA-Z0-9_-]+)$/);
    if (edgeMatch && method === 'DELETE') {
      const edgeId = edgeMatch[1];
      for (const proj of state.projects) {
        proj.edges = proj.edges.filter((e) => e.id !== edgeId);
      }
      return json(200, { success: true, edgeId });
    }

    // 9. Node Approvals
    if (path.includes('/approve') && method === 'POST') {
      const body = request.postDataJSON();
      const nodeId = path.split('/')[2];
      const currentRole = state.currentUser?.role;

      // Platform admin and standard members cannot approve deliverables
      if (currentRole === 'ADMIN') {
        return json(403, { message: 'Platform Administrator cannot approve deliverables. Only Manager or Team Lead.' });
      }

      if (currentRole === 'MEMBER' || currentRole === 'GUEST') {
        return json(403, { message: 'Members do not have sign-off authorization.' });
      }

      for (const proj of state.projects) {
        const node = proj.nodes.find((n) => n.id === nodeId);
        if (node) {
          // Four-eyes check: self-approval blocked
          if (node.ownerId === state.currentUser?.id) {
            return json(403, { message: 'Four-eyes rule: You cannot approve your own deliverables.' });
          }

          node.approvalStatus = body.decision;
          return json(200, {
            success: true,
            decision: body.decision,
            nodeId,
            approverId: state.currentUser?.id,
          });
        }
      }
    }

    // 10. Node Submit
    if (path.includes('/submit') && method === 'POST') {
      const nodeId = path.split('/')[2];
      for (const proj of state.projects) {
        const node = proj.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.approvalStatus = 'pending';
          return json(200, { success: true, nodeId, status: 'pending' });
        }
      }
    }

    // 11. Node Types
    if (path === '/node-types') {
      return json(200, [
        { id: 'nt-task', key: 'task', name: 'Task', colour: '#3b82f6', icon: 'CheckSquare', isGroup: false },
        { id: 'nt-stage', key: 'stage', name: 'Stage Group', colour: '#8b5cf6', icon: 'Layers', isGroup: true },
        { id: 'nt-milestone', key: 'milestone', name: 'Milestone', colour: '#f59e0b', icon: 'Flag', isGroup: false },
        { id: 'nt-approval', key: 'approval', name: 'Approval Gate', colour: '#10b981', icon: 'ShieldCheck', isGroup: false },
      ]);
    }

    // 12. Teams
    if (path === '/teams') {
      return json(200, state.teams);
    }

    // 12. Review Queue
    if (path.includes('/review-queue')) {
      return json(200, state.reviewQueue);
    }

    // 13. Field Definitions
    if (path.includes('/field-definitions')) {
      return json(200, state.fieldDefinitions);
    }

    // 14. Notifications
    if (path.includes('/notifications')) {
      return json(200, state.notifications);
    }

    // Fallback pass-through or empty 200
    return json(200, []);
  });

  return state;
}

export async function loginAs(
  page: Page,
  role: 'ADMIN' | 'MANAGER' | 'TEAM_LEAD' | 'MEMBER' = 'ADMIN',
  customState?: Partial<MockState>
) {
  const initial = createInitialMockState();
  const matchedUser = initial.users.find((u) => u.role === role) || initial.users[0];

  const state = await setupMockApi(page, {
    ...customState,
    currentUser: matchedUser,
  });

  // Inject session into browser localStorage before navigation
  await page.addInitScript(
    ({ token, wsId }) => {
      window.localStorage.setItem('flowtrack_token', token);
      window.localStorage.setItem('flowtrack_workspace_id', wsId);
    },
    {
      token: `mock-jwt-token-for-${matchedUser.id}`,
      wsId: state.activeWorkspaceId,
    }
  );

  return state;
}
