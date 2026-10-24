const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1';

export class ApiClient {
  private static token: string | null =
    typeof localStorage !== 'undefined' ? localStorage.getItem('flowtrack_token') : null;
  private static activeWorkspaceId: string | null =
    typeof localStorage !== 'undefined' ? localStorage.getItem('flowtrack_workspace_id') : null;

  static setToken(token: string | null) {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem('flowtrack_token', token);
      } else {
        localStorage.removeItem('flowtrack_token');
      }
    }
  }

  static setActiveWorkspaceId(workspaceId: string | null) {
    this.activeWorkspaceId = workspaceId;
    if (typeof localStorage !== 'undefined') {
      if (workspaceId) {
        localStorage.setItem('flowtrack_workspace_id', workspaceId);
      } else {
        localStorage.removeItem('flowtrack_workspace_id');
      }
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

  static getProject(projectId: string) {
    return this.request(`/projects/${projectId}`);
  }

  static createProject(body: any) {
    return this.request('/projects', { method: 'POST', body: JSON.stringify(body) });
  }

  static updateProject(projectId: string, body: any) {
    return this.request(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  static deleteProject(projectId: string) {
    return this.request(`/projects/${projectId}`, { method: 'DELETE' });
  }

  static cloneProject(projectId: string, body?: any) {
    return this.request(`/projects/${projectId}/clone`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
  }

  static saveProjectAsTemplate(projectId: string, body: any) {
    return this.request(`/projects/${projectId}/save-as-template`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Templates
  static getTemplates(params?: { industry?: string; category?: string }) {
    const query = new URLSearchParams();
    if (params?.industry && params.industry !== 'all') query.append('industry', params.industry);
    if (params?.category && params.category !== 'all') query.append('category', params.category);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/templates${queryString}`);
  }

  static getTemplate(id: string) {
    return this.request(`/templates/${id}`);
  }

  static createTemplate(body: any) {
    return this.request('/templates', { method: 'POST', body: JSON.stringify(body) });
  }

  static updateTemplate(id: string, body: any) {
    return this.request(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  static deleteTemplate(id: string) {
    return this.request(`/templates/${id}`, { method: 'DELETE' });
  }

  static instantiateTemplate(templateId: string, body: any) {
    return this.request(`/templates/${templateId}/instantiate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
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

  static approveTask(nodeId: string, body: { decision: 'approved' | 'rejected'; feedback?: string }) {
    return this.request(`/nodes/${nodeId}/approve`, { method: 'POST', body: JSON.stringify(body) });
  }

  static reportBlocker(nodeId: string, body: { reason: string; blockerStatusId?: string }) {
    return this.request(`/nodes/${nodeId}/blocker`, { method: 'POST', body: JSON.stringify(body) });
  }

  static requestDeadlineExtension(nodeId: string, body: { newDueDate: string; justification: string }) {
    return this.request(`/nodes/${nodeId}/deadline-extension`, { method: 'POST', body: JSON.stringify(body) });
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

  static addDocument(
    nodeId: string,
    body: {
      name: string;
      mimeType: string;
      fileSize: number;
      category?: string;
      description?: string;
      storageKey?: string;
      metadata?: any;
    }
  ) {
    return this.request(`/nodes/${nodeId}/documents`, { method: 'POST', body: JSON.stringify(body) });
  }

  static deleteDocument(docId: string) {
    return this.request(`/documents/${docId}`, { method: 'DELETE' });
  }

  static getDocumentDownloadUrl(nodeId: string, docId: string) {
    return `${API_BASE}/nodes/${nodeId}/documents/${docId}/download`;
  }

  static verifyEvidence(docId: string, body: { decision: 'APPROVED' | 'REJECTED'; feedback: string }) {
    return this.request(`/documents/${docId}/verify-evidence`, { method: 'POST', body: JSON.stringify(body) });
  }

  static getNodeHistory(nodeId: string) {
    return this.request(`/nodes/${nodeId}/history`);
  }

  static getProjectHistory(projectId: string, options?: { limit?: number; offset?: number; action?: string }) {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    if (options?.action) params.append('action', options.action);
    const q = params.toString();
    return this.request(`/projects/${projectId}/history${q ? `?${q}` : ''}`);
  }

  // Notifications
  static getNotifications(filter?: { read?: boolean; type?: string; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (filter?.read !== undefined) params.append('read', String(filter.read));
    if (filter?.type) params.append('type', filter.type);
    if (filter?.limit) params.append('limit', String(filter.limit));
    if (filter?.offset) params.append('offset', String(filter.offset));
    const q = params.toString();
    return this.request(`/notifications${q ? `?${q}` : ''}`);
  }

  static markNotificationRead(id: string) {
    return this.request(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  static markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'POST' });
  }

  // Custom Field Definitions
  static getFieldDefinitions(filters?: { targetType?: string; nodeTypeId?: string; includeInactive?: boolean; groupName?: string }) {
    const params = new URLSearchParams();
    if (filters?.targetType) params.append('targetType', filters.targetType);
    if (filters?.nodeTypeId) params.append('nodeTypeId', filters.nodeTypeId);
    if (filters?.includeInactive) params.append('includeInactive', 'true');
    if (filters?.groupName) params.append('groupName', filters.groupName);
    const q = params.toString();
    return this.request(`/field-definitions${q ? `?${q}` : ''}`);
  }

  static getFieldDefinition(id: string) {
    return this.request(`/field-definitions/${id}`);
  }

  static createFieldDefinition(body: any) {
    return this.request('/field-definitions', { method: 'POST', body: JSON.stringify(body) });
  }

  static updateFieldDefinition(id: string, body: any) {
    return this.request(`/field-definitions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  static deleteFieldDefinition(id: string, permanent: boolean = false) {
    return this.request(`/field-definitions/${id}${permanent ? '?permanent=true' : ''}`, { method: 'DELETE' });
  }

  // Universal Reports & Dashboards
  static getProjectReport(projectId: string, filters?: any) {
    if (!this.activeWorkspaceId) throw new Error('No active workspace');
    const params = new URLSearchParams();
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    if (filters?.assigneeId) params.append('assigneeId', filters.assigneeId);
    if (filters?.stageId) params.append('stageId', filters.stageId);
    if (filters?.statusCategory) params.append('statusCategory', filters.statusCategory);
    if (filters?.priority) params.append('priority', filters.priority);
    const q = params.toString();
    return this.request(`/workspaces/${this.activeWorkspaceId}/reports/project/${projectId}${q ? `?${q}` : ''}`);
  }

  static getWorkspaceReport() {
    if (!this.activeWorkspaceId) throw new Error('No active workspace');
    return this.request(`/workspaces/${this.activeWorkspaceId}/reports/workspace`);
  }

  static async downloadProjectReportCsv(projectId: string, type: 'tasks' | 'milestones' | 'financials' | 'workload' = 'tasks') {
    if (!this.activeWorkspaceId) throw new Error('No active workspace');
    const res = await fetch(`${API_BASE}/workspaces/${this.activeWorkspaceId}/reports/export/${projectId}?type=${type}`, {
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : '',
        'X-Workspace-Id': this.activeWorkspaceId,
      },
    });
    if (!res.ok) {
      throw new Error(`Export failed: ${res.statusText}`);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-${type}-report-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}
