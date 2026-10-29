function isLocalHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  );
}

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // If accessed on Cloudflare or any remote deployment, ALWAYS target live Render backend
    if (!isLocalHostname(window.location.hostname)) {
      return 'https://flowtrack-api-rss4.onrender.com/api/v1';
    }
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `http://${window.location.hostname}:3001/api/v1`;
    }
  }
  return (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1';
};

const API_BASE = getApiBaseUrl();

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

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
    } catch (networkErr: any) {
      console.error(`[ApiClient] Network request failed to ${API_BASE}${path}:`, networkErr);
      throw new Error(
        `Cannot connect to backend server at ${API_BASE}. Please ensure the FlowTrack API server is running on port 3001.`
      );
    }

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

  static loginWithGoogle(idTokenOrCredential: string) {
    return this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken: idTokenOrCredential }),
    });
  }

  static linkGoogleAccount(idTokenOrCredential: string) {
    return this.request('/auth/google/link', {
      method: 'POST',
      body: JSON.stringify({ idToken: idTokenOrCredential }),
    });
  }

  static requestOtp(phone: string) {
    return this.request('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });
  }

  static verifyOtp(phone: string, otp: string) {
    return this.request('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ phone, otp }) });
  }

  static forgotPassword(email: string) {
    return this.request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  }

  static resetPassword(data: { email: string; token: string; newPassword: string }) {
    return this.request('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) });
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

  static updateMemberRole(workspaceId: string, userId: string, role: string) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  static updateMemberStatus(workspaceId: string, userId: string, isActive: boolean) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  }

  static removeWorkspaceMember(workspaceId: string, userId: string) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // Projects
  static getProjects() {
    return this.request('/projects');
  }

  static getProject(projectId: string) {
    return this.request(`/projects/${projectId}`);
  }

  static getCriticalPath(projectId: string) {
    return this.request(`/projects/${projectId}/critical-path`);
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

  static getProjectMembers(projectId: string) {
    return this.request(`/projects/${projectId}/members`);
  }

  static addProjectMember(projectId: string, body: { userId: string; role?: string }) {
    return this.request(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  static removeProjectMember(projectId: string, userId: string) {
    return this.request(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // Teams
  static getTeams() {
    return this.request('/teams');
  }

  static createTeam(body: { name: string; colour?: string; leadId?: string }) {
    return this.request('/teams', { method: 'POST', body: JSON.stringify(body) });
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
  static getNodes(
    projectId: string,
    parentNodeId?: string | null,
    filters?: {
      search?: string;
      customFieldKey?: string;
      customFieldValue?: string;
      ownerId?: string;
      assignedById?: string;
      assignedToMe?: boolean;
      assignedByMe?: boolean;
      teamId?: string;
      statusId?: string;
      approvalStatus?: string;
      dueBefore?: string;
      dueAfter?: string;
    }
  ) {
    const query = new URLSearchParams({ projectId });
    if (parentNodeId && parentNodeId !== 'root') {
      query.append('parentNodeId', parentNodeId);
    } else {
      query.append('parentNodeId', 'all');
    }
    if (filters?.search) query.append('search', filters.search);
    if (filters?.customFieldKey) query.append('customFieldKey', filters.customFieldKey);
    if (filters?.customFieldValue) query.append('customFieldValue', filters.customFieldValue);
    if (filters?.ownerId) query.append('ownerId', filters.ownerId);
    if (filters?.assignedById) query.append('assignedById', filters.assignedById);
    if (filters?.assignedToMe) query.append('assignedToMe', 'true');
    if (filters?.assignedByMe) query.append('assignedByMe', 'true');
    if (filters?.teamId) query.append('teamId', filters.teamId);
    if (filters?.statusId) query.append('statusId', filters.statusId);
    if (filters?.approvalStatus) query.append('approvalStatus', filters.approvalStatus);
    if (filters?.dueBefore) query.append('dueBefore', filters.dueBefore);
    if (filters?.dueAfter) query.append('dueAfter', filters.dueAfter);
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

  static transitionNode(
    nodeId: string,
    toState: string,
    options?: { version?: number; reason?: string; feedback?: string; bypassGuards?: boolean }
  ) {
    return this.request(`/nodes/${nodeId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ toState, ...options }),
    });
  }

  static updateChecklist(
    nodeId: string,
    checklist: Array<{ id: string; text: string; completed: boolean }>
  ) {
    return this.request(`/nodes/${nodeId}/checklist`, {
      method: 'PATCH',
      body: JSON.stringify({ checklist }),
    });
  }

  static submitWork(
    nodeId: string,
    data: { remarks?: string; summary?: string; links?: string[]; deliverables?: string }
  ) {
    return this.request(`/nodes/${nodeId}/submit-work`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static getSubmissions(nodeId: string) {
    return this.request(`/nodes/${nodeId}/submissions`);
  }

  static decideApproval(data: {
    taskId?: string;
    requestId?: string;
    decision: string;
    reason?: string;
    comment?: string;
    feedback?: string;
  }) {
    return this.request('/approvals/decide', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static getCompletionReadiness(nodeId: string) {
    return this.request(`/nodes/${nodeId}/completion-readiness`);
  }

  static approveTask(nodeId: string, body: { decision: 'approved' | 'rejected'; feedback?: string }) {
    return this.request(`/nodes/${nodeId}/approve`, { method: 'POST', body: JSON.stringify(body) });
  }

  static submitTask(nodeId: string, body?: { notes?: string }) {
    return this.request(`/nodes/${nodeId}/submit`, { method: 'POST', body: JSON.stringify(body || {}) });
  }

  static getTaskApprovals(nodeId: string) {
    return this.request(`/nodes/${nodeId}/approvals`);
  }

  static getReviewQueue(params?: { workspaceId?: string; projectId?: string }) {
    const query = new URLSearchParams();
    if (params?.workspaceId) query.append('workspaceId', params.workspaceId);
    if (params?.projectId) query.append('projectId', params.projectId);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/nodes/review-queue${qs}`);
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

  static getRoleDashboard(workspaceId?: string) {
    const wsId = workspaceId || this.activeWorkspaceId;
    if (!wsId) throw new Error('No active workspace');
    return this.request(`/workspaces/${wsId}/reports/role-dashboard`);
  }

  static getWorkspaceAuditHistory(
    workspaceId?: string,
    options?: { limit?: number; offset?: number; entityName?: string; action?: string }
  ) {
    const wsId = workspaceId || this.activeWorkspaceId;
    if (!wsId) throw new Error('No active workspace');
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.entityName) params.append('entityName', options.entityName);
    if (options?.action) params.append('action', options.action);
    const q = params.toString();
    return this.request(`/workspaces/${wsId}/history${q ? `?${q}` : ''}`);
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

  // =========================================================================
  // Phase 3: Lifecycle Safety, Workspaces & Task Readiness API
  // =========================================================================

  static getProjectDeletionImpact(projectId: string) {
    return this.request(`/projects/${projectId}/deletion-impact`);
  }


  static restoreProject(projectId: string, dto?: { reason?: string }) {
    return this.request(`/projects/${projectId}/restore`, {
      method: 'POST',
      body: JSON.stringify(dto || {}),
    });
  }

  static archiveProject(projectId: string) {
    return this.request(`/projects/${projectId}/archive`, {
      method: 'POST',
    });
  }

  static unarchiveProject(projectId: string) {
    return this.request(`/projects/${projectId}/unarchive`, {
      method: 'POST',
    });
  }

  static getTrashProjects() {
    return this.request('/projects/trash');
  }

  static purgeProject(
    projectId: string,
    dto: { confirmationKey: string; justification: string; forceRetentionWaiver?: boolean }
  ) {
    return this.request(`/projects/${projectId}/purge`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  static getNodeCompletionReadiness(nodeId: string) {
    return this.request(`/nodes/${nodeId}/completion-readiness`);
  }

  static getNodeSubmissions(nodeId: string) {
    return this.request(`/nodes/${nodeId}/submissions`);
  }

  static getNodeEvidence(nodeId: string) {
    return this.request(`/nodes/${nodeId}/evidence`);
  }

  static getNodeAuditEvents(nodeId: string) {
    return this.request(`/audit/events?targetId=${nodeId}`);
  }

  static getProjectAuditEvents(projectId: string) {
    return this.request(`/audit/events?targetId=${projectId}`);
  }

  static reassignUserWork(userId: string, successorUserId: string) {
    return this.request(`/users/${userId}/reassign-work`, {
      method: 'POST',
      body: JSON.stringify({ successorUserId }),
    });
  }
}
