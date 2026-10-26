import { z } from 'zod';

export interface AdminUserOverviewData {
  totalUsers: number;
  activeUsers: number;
  deactivatedUsers: number;
  roleDistribution: Record<string, number>;
  teamsCount: number;
  teamsSummary: Array<{
    id: string;
    name: string;
    colour?: string;
    memberCount: number;
  }>;
  recentAuditActivity: Array<{
    id: string;
    action: string;
    entityName: string;
    entityId: string;
    actor: {
      id: string;
      fullName: string;
      email: string;
      avatarUrl?: string | null;
    } | null;
    createdAt: string | Date;
    oldValues?: any;
    newValues?: any;
  }>;
}

export interface TeamWorkloadMemberData {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
  teamId?: string | null;
  teamName?: string | null;
  assignedTasksCount: number;
  completedTasksCount: number;
  overdueTasksCount: number;
  allocatedHours: number;
  actualHours: number;
}

export interface ManagerDashboardData {
  pendingReviewCount: number;
  pendingReviews: Array<{
    id: string;
    title: string;
    projectId: string;
    projectName: string;
    submittedAt?: string | Date | null;
    submitterName: string;
    submitterEmail: string;
    priority: string;
    daysPending: number;
  }>;
  teamWorkload: TeamWorkloadMemberData[];
  blockedTasksCount: number;
}

export interface AssigneeDashboardData {
  assignedCount: number;
  overdueCount: number;
  myTasks: Array<{
    id: string;
    title: string;
    projectId: string;
    projectName: string;
    progressPct: number;
    statusCategory: string;
    statusKey: string;
    statusColour?: string;
    priority: string;
    dueDate?: string | Date | null;
    isOverdue: boolean;
    approvalStatus: string;
  }>;
  reviewStatus: {
    pendingCount: number;
    changesRequestedCount: number;
    approvedCount: number;
    items: Array<{
      id: string;
      title: string;
      projectId: string;
      projectName: string;
      approvalStatus: string;
      submittedAt?: string | Date | null;
      approvedAt?: string | Date | null;
      approvalFeedback?: string | null;
      reviewerName?: string | null;
    }>;
  };
}

export interface RoleScopedDashboardResponse {
  role: string;
  workspaceId: string;
  adminOverview?: AdminUserOverviewData;
  managerWorkload?: ManagerDashboardData;
  assigneeWork?: AssigneeDashboardData;
}
