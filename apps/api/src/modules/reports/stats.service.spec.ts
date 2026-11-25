import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '../auth/authorization.service';
import { AuditService } from '../audit/audit.service';
import { StatsService } from './stats.service';
import { ReportsService } from './reports.service';
import { ProjectsService } from '../projects/projects.service';
import { CpmService } from '../projects/cpm.service';

describe('StatsService & Scoped Dashboard Metrics (Real Database)', () => {
  let prisma: PrismaClient;
  let statsService: StatsService;
  let reportsService: ReportsService;
  let projectsService: ProjectsService;
  let cpmService: CpmService;

  let workspace: any;
  let adminUser: any;
  let managerUser: any;
  let teamLeadUser: any;
  let memberUser: any;
  let unrelatedUser: any;
  let project: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const authService = new AuthorizationService(prisma as any);
    const auditService = new AuditService(prisma as any);
    statsService = new StatsService(prisma as any, authService);
    reportsService = new ReportsService(prisma as any, authService, statsService);
    projectsService = new ProjectsService(prisma as any, authService, auditService, statsService);
    cpmService = new CpmService(prisma as any, statsService);

    const ts = Date.now();
    workspace = await prisma.workspace.create({
      data: { name: `StatsWS-${ts}`, slug: `stats-ws-${ts}` },
    });

    adminUser = await prisma.user.create({ data: { email: `admin-st-${ts}@test.com`, fullName: 'Admin' } });
    managerUser = await prisma.user.create({ data: { email: `mgr-st-${ts}@test.com`, fullName: 'Manager' } });
    teamLeadUser = await prisma.user.create({ data: { email: `tl-st-${ts}@test.com`, fullName: 'TeamLead' } });
    memberUser = await prisma.user.create({ data: { email: `mem-st-${ts}@test.com`, fullName: 'Member' } });
    unrelatedUser = await prisma.user.create({ data: { email: `unrel-st-${ts}@test.com`, fullName: 'Unrelated' } });

    await prisma.membership.createMany({
      data: [
        { workspaceId: workspace.id, userId: adminUser.id, role: Role.ADMIN },
        { workspaceId: workspace.id, userId: managerUser.id, role: Role.MANAGER },
        { workspaceId: workspace.id, userId: teamLeadUser.id, role: Role.TEAM_LEAD },
        { workspaceId: workspace.id, userId: memberUser.id, role: Role.MEMBER },
        { workspaceId: workspace.id, userId: unrelatedUser.id, role: Role.MEMBER },
      ],
    });

    const ss = await prisma.statusSet.create({ data: { workspaceId: workspace.id, name: `SS-St-${ts}` } });
    const stActive = await prisma.status.create({ data: { statusSetId: ss.id, key: 'active', category: 'active' } });
    const stDone = await prisma.status.create({ data: { statusSetId: ss.id, key: 'done', category: 'done' } });
    const stBlocked = await prisma.status.create({ data: { statusSetId: ss.id, key: 'blocked', category: 'blocked' } });
    const stCancelled = await prisma.status.create({ data: { statusSetId: ss.id, key: 'cancelled', category: 'cancelled' } });
    const nt = await prisma.nodeType.create({ data: { workspaceId: workspace.id, key: 'task', name: 'Task', defaultStatusSetId: ss.id } });

    project = await projectsService.createProject(
      workspace.id,
      { name: 'EV Showroom and Service Bay Launch', key: `EV${String(ts).slice(-4)}` },
      managerUser.id,
      'MANAGER'
    );

    const pastDue = new Date(Date.now() - 86400000 * 3);
    const futureDue = new Date(Date.now() + 86400000 * 5);

    // 12 active tasks + 1 cancelled + 1 soft-deleted (both must be excluded) + 1 no-status task
    const tasks = [
      { title: 'T1 Done Mem', ownerId: memberUser.id, statusId: stDone.id, progressPct: 100, dueDate: futureDue, approvalStatus: 'approved' },
      { title: 'T2 Done Mgr', ownerId: managerUser.id, statusId: stDone.id, progressPct: 100, dueDate: futureDue, approvalStatus: 'approved' },
      { title: 'T3 Blocked TL', ownerId: teamLeadUser.id, statusId: stBlocked.id, progressPct: 20, dueDate: futureDue, approvalStatus: 'not_required' },
      { title: 'T4 Overdue Mem', ownerId: memberUser.id, statusId: stActive.id, progressPct: 40, dueDate: pastDue, approvalStatus: 'not_required' },
      { title: 'T5 Pending Mem', ownerId: memberUser.id, statusId: stActive.id, progressPct: 80, dueDate: futureDue, approvalStatus: 'pending', reviewerId: teamLeadUser.id, submitterId: memberUser.id },
      { title: 'T6 Pending Mem2', ownerId: memberUser.id, statusId: stActive.id, progressPct: 90, dueDate: futureDue, approvalStatus: 'pending', reviewerId: teamLeadUser.id, submitterId: memberUser.id },
      { title: 'T7 NoStatus Mem', ownerId: memberUser.id, statusId: null, progressPct: 0, dueDate: futureDue, approvalStatus: 'not_required' },
      { title: 'T8 Active TL', ownerId: teamLeadUser.id, statusId: stActive.id, progressPct: 30, dueDate: futureDue, approvalStatus: 'not_required' },
      { title: 'T9 Active TL2', ownerId: teamLeadUser.id, statusId: stActive.id, progressPct: 10, dueDate: futureDue, approvalStatus: 'not_required' },
      { title: 'T10 Active Mgr', ownerId: managerUser.id, statusId: stActive.id, progressPct: 50, dueDate: futureDue, approvalStatus: 'not_required' },
      { title: 'T11 Active Mgr2', ownerId: managerUser.id, statusId: stActive.id, progressPct: 0, dueDate: futureDue, approvalStatus: 'not_required' },
      { title: 'T12 Active Mgr3', ownerId: managerUser.id, statusId: stActive.id, progressPct: 0, dueDate: futureDue, approvalStatus: 'not_required' },
      // Excluded items:
      { title: 'T13 Cancelled', ownerId: memberUser.id, statusId: stCancelled.id, progressPct: 0, dueDate: pastDue, approvalStatus: 'pending', reviewerId: teamLeadUser.id },
      { title: 'T14 Deleted', ownerId: memberUser.id, statusId: stActive.id, progressPct: 0, dueDate: pastDue, deletedAt: new Date(), approvalStatus: 'pending', reviewerId: teamLeadUser.id },
    ];

    for (const t of tasks) {
      await prisma.node.create({
        data: { workspaceId: workspace.id, projectId: project.id, nodeTypeId: nt.id, ...t },
      });
    }

    await prisma.notification.create({
      data: {
        workspaceId: workspace.id,
        userId: memberUser.id,
        type: 'TASK_ASSIGNED',
        title: 'Task assigned',
        body: 'T4 assigned',
        read: false,
      },
    });
  });

  afterAll(async () => {
    if (workspace?.id) {
      await prisma.project.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
      await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
    }
    await prisma.$disconnect();
  });

  it('computes accurate navbar counts, projects overview, role dashboard, reports, and CPM for all 5 roles', async () => {
    // 1. Admin: sees all 12 active tasks (excludes cancelled & deleted), 1 waiting, 1 overdue, 2 pending approvals
    const adminNav = await statsService.getNavbarCounts(workspace.id, adminUser.id);
    expect(adminNav).toEqual({ unreadNotificationsCount: 0, pendingApprovalsCount: 2 });
    const adminOverview = await reportsService.getProjectsOverviewSummary(workspace.id, { id: adminUser.id, role: 'ADMIN' });
    expect(adminOverview).toEqual({ totalProjects: 1, activeCount: 1, completedCount: 0, totalWaiting: 1, totalOverdue: 1 });
    const adminRep = await reportsService.getProjectDashboard(workspace.id, project.id, adminUser.id);
    expect(adminRep.overview.totalTasks).toBe(12);
    expect(adminRep.overview.overdueTasks).toBe(1);
    expect(adminRep.overview.waitingBlockedTasks).toBe(1);
    const adminCpm = await cpmService.calculateProjectCriticalPath(project.id, workspace.id, adminUser.id, 'ADMIN');
    expect(adminCpm.tasks.length).toBe(12);

    // 2. Manager (project creator): sees all 12 active tasks, 3 own open tasks, 0 own overdue
    const mgrNav = await statsService.getNavbarCounts(workspace.id, managerUser.id);
    expect(mgrNav).toEqual({ unreadNotificationsCount: 0, pendingApprovalsCount: 0 });
    const mgrOverview = await reportsService.getProjectsOverviewSummary(workspace.id, { id: managerUser.id, role: 'MANAGER' });
    expect(mgrOverview).toEqual({ totalProjects: 1, activeCount: 1, completedCount: 0, totalWaiting: 1, totalOverdue: 1 });
    const mgrDash = await reportsService.getRoleScopedDashboard(workspace.id, managerUser.id);
    expect(mgrDash.assigneeWork?.assignedCount).toBe(3);
    expect(mgrDash.assigneeWork?.overdueCount).toBe(0);
    const mgrCpm = await cpmService.calculateProjectCriticalPath(project.id, workspace.id, managerUser.id, 'MANAGER');
    expect(mgrCpm.tasks.length).toBe(12);

    // 3. Team Lead: sees 5 scoped tasks (T3, T8, T9 + reviewing T5, T6), 0 overdue, 1 waiting, 2 pending approvals
    const tlNav = await statsService.getNavbarCounts(workspace.id, teamLeadUser.id);
    expect(tlNav).toEqual({ unreadNotificationsCount: 0, pendingApprovalsCount: 2 });
    const tlOverview = await reportsService.getProjectsOverviewSummary(workspace.id, { id: teamLeadUser.id, role: 'TEAM_LEAD' });
    expect(tlOverview).toEqual({ totalProjects: 1, activeCount: 1, completedCount: 0, totalWaiting: 1, totalOverdue: 0 });
    const tlDash = await reportsService.getRoleScopedDashboard(workspace.id, teamLeadUser.id);
    expect(tlDash.assigneeWork?.assignedCount).toBe(3);
    expect(tlDash.assigneeWork?.overdueCount).toBe(0);
    const tlRep = await reportsService.getProjectDashboard(workspace.id, project.id, teamLeadUser.id);
    expect(tlRep.overview.totalTasks).toBe(5);
    expect(tlRep.overview.waitingBlockedTasks).toBe(1);
    expect(tlRep.overview.overdueTasks).toBe(0);
    const tlCpm = await cpmService.calculateProjectCriticalPath(project.id, workspace.id, teamLeadUser.id, 'TEAM_LEAD');
    expect(tlCpm.tasks.length).toBe(5);

    // 4. Member: sees 5 scoped tasks (T1, T4, T5, T6, T7 including no-status T7), 4 open, 1 overdue, 0 waiting, 1 unread notif
    const memNav = await statsService.getNavbarCounts(workspace.id, memberUser.id);
    expect(memNav).toEqual({ unreadNotificationsCount: 1, pendingApprovalsCount: 0 });
    const memOverview = await reportsService.getProjectsOverviewSummary(workspace.id, { id: memberUser.id, role: 'MEMBER' });
    expect(memOverview).toEqual({ totalProjects: 1, activeCount: 1, completedCount: 0, totalWaiting: 0, totalOverdue: 1 });
    const memDash = await reportsService.getRoleScopedDashboard(workspace.id, memberUser.id);
    expect(memDash.assigneeWork?.assignedCount).toBe(4);
    expect(memDash.assigneeWork?.overdueCount).toBe(1);
    const memRep = await reportsService.getProjectDashboard(workspace.id, project.id, memberUser.id);
    expect(memRep.overview.totalTasks).toBe(5);
    expect(memRep.overview.waitingBlockedTasks).toBe(0);
    expect(memRep.overview.overdueTasks).toBe(1);
    const memCpm = await cpmService.calculateProjectCriticalPath(project.id, workspace.id, memberUser.id, 'MEMBER');
    expect(memCpm.tasks.length).toBe(5);

    // 5. Unrelated Member: sees 0 everywhere, and 404 on project report & CPM
    const unrelNav = await statsService.getNavbarCounts(workspace.id, unrelatedUser.id);
    expect(unrelNav).toEqual({ unreadNotificationsCount: 0, pendingApprovalsCount: 0 });
    const unrelOverview = await reportsService.getProjectsOverviewSummary(workspace.id, { id: unrelatedUser.id, role: 'MEMBER' });
    expect(unrelOverview).toEqual({ totalProjects: 0, activeCount: 0, completedCount: 0, totalWaiting: 0, totalOverdue: 0 });
    const unrelDash = await reportsService.getRoleScopedDashboard(workspace.id, unrelatedUser.id);
    expect(unrelDash.assigneeWork?.assignedCount).toBe(0);
    await expect(reportsService.getProjectDashboard(workspace.id, project.id, unrelatedUser.id)).rejects.toThrow(NotFoundException);
    await expect(cpmService.calculateProjectCriticalPath(project.id, workspace.id, unrelatedUser.id, 'MEMBER')).rejects.toThrow(NotFoundException);
  });
});
