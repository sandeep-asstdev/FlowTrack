const API_BASE = 'http://localhost:3001/api/v1';

export class ApiClient {
  private static token: string | null = localStorage.getItem('flowtrack_token');
  private static activeWorkspaceId: string | null = localStorage.getItem('flowtrack_workspace_id');

  static setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('flowtrack_token', token);
    } else {
      localStorage.removeItem('flowtrack_token');
    }
  }

  static setActiveWorkspaceId(workspaceId: string | null) {
    this.activeWorkspaceId = workspaceId;
    if (workspaceId) {
      localStorage.setItem('flowtrack_workspace_id', workspaceId);
    } else {
      localStorage.removeItem('flowtrack_workspace_id');
    }
  }

  static getToken() {
    return this.token;
  }

  static getActiveWorkspaceId() {
    return this.activeWorkspaceId;
  }

  static async request<T = any>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (this.activeWorkspaceId) {
      headers['X-Workspace-Id'] = this.activeWorkspaceId;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Network request failed' }));
      throw new Error(err.message || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  // Auth
  static login(body: any) {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(body) });
  }

  static register(body: any) {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
  }

  static requestOtp(phone: string) {
    return this.request('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });
  }

  static verifyOtp(phone: string, otp: string) {
    return this.request('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ phone, otp }) });
  }

  static getMe() {
    return this.request('/auth/me');
  }

  // Workspaces
  static getWorkspaces() {
    return this.request('/workspaces');
  }

  static createWorkspace(body: any) {
    return this.request('/workspaces', { method: 'POST', body: JSON.stringify(body) });
  }

  static getWorkspaceMembers(workspaceId: string) {
    return this.request(`/workspaces/${workspaceId}/members`);
  }

  static inviteWorkspaceMember(workspaceId: string, email: string, role = 'MEMBER') {
    return this.request(`/workspaces/${workspaceId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  // Projects
  static getProjects() {
    return this.request('/projects');
  }

  static createProject(body: any) {
    return this.request('/projects', { method: 'POST', body: JSON.stringify(body) });
  }

  // Nodes & Edges
  static getNodes(projectId: string, parentNodeId?: string | null) {
    const query = new URLSearchParams({ projectId });
    if (parentNodeId && parentNodeId !== 'root') {
      query.append('parentNodeId', parentNodeId);
    } else {
      query.append('parentNodeId', 'all');
    }
    return this.request(`/nodes?${query.toString()}`);
  }

  static createNode(body: any) {
    return this.request('/nodes', { method: 'POST', body: JSON.stringify(body) });
  }

  static getNode(id: string) {
    return this.request(`/nodes/${id}`);
  }

  static addRemark(nodeId: string, body: { body: string; voiceUrl?: string; photoUrl?: string }) {
    return this.request(`/nodes/${nodeId}/remarks`, { method: 'POST', body: JSON.stringify(body) });
  }

  static updateNode(id: string, body: any) {
    return this.request(`/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  static batchUpdatePositions(positions: any[]) {
    return this.request('/nodes/batch-positions', { method: 'PATCH', body: JSON.stringify({ positions }) });
  }

  static deleteNode(id: string) {
    return this.request(`/nodes/${id}`, { method: 'DELETE' });
  }

  static getEdges(projectId: string) {
    return this.request(`/edges?projectId=${projectId}`);
  }

  static createEdge(body: any) {
    return this.request('/edges', { method: 'POST', body: JSON.stringify(body) });
  }

  static deleteEdge(id: string) {
    return this.request(`/edges/${id}`, { method: 'DELETE' });
  }

  static getNodeTypes() {
    return this.request('/node-types');
  }

  static getDocuments(nodeId: string) {
    return this.request(`/nodes/${nodeId}/documents`);
  }

  static addDocument(nodeId: string, body: { name: string; mimeType: string; fileSize: number; storageKey?: string }) {
    return this.request(`/nodes/${nodeId}/documents`, { method: 'POST', body: JSON.stringify(body) });
  }

  static deleteDocument(docId: string) {
    return this.request(`/nodes/documents/${docId}`, { method: 'DELETE' });
  }

  static getNodeHistory(nodeId: string) {
    return this.request(`/nodes/${nodeId}/history`);
  }
}
