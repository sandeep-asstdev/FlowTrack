import { test, expect } from '@playwright/test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PrismaClient, Role } = require('../../api/node_modules/@prisma/client');
const bcrypt = require('../../api/node_modules/bcryptjs');

const API_URL = 'http://localhost:3001/api/v1';

test.describe('Notification Panel Real-API E2E', () => {
  let prisma: any;
  const ts = Date.now();
  const password = 'Password123!';
  const managerEmail = `notif-mgr-${ts}@flowtrack.dev`;

  let workspace: any;
  let managerUser: any;
  let project: any;
  let node: any;

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const passwordHash = await bcrypt.hash(password, 10);

    workspace = await prisma.workspace.create({
      data: {
        name: `Notif Test WS ${ts}`,
        slug: `notif-test-ws-${ts}`,
      },
    });

    managerUser = await prisma.user.create({
      data: {
        email: managerEmail,
        fullName: 'Notif Test Manager',
        passwordHash,
      },
    });

    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: managerUser.id,
        role: Role.MANAGER,
      },
    });

    const statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: 'Default Statuses',
        isDefault: true,
        statuses: {
          create: [{ key: 'To Do', category: 'todo', displayOrder: 1 }],
        },
      },
      include: { statuses: true },
    });

    const nodeType = await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        key: 'task',
        name: 'Task',
        icon: 'check-square',
        colour: '#3b82f6',
      },
    });

    project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: `Notif Project ${ts}`,
        ownerId: managerUser.id,
        responsibleManagerId: managerUser.id,
      },
    });

    node = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        title: `Notif Task ${ts}`,
        nodeTypeId: nodeType.id,
        statusId: statusSet.statuses[0].id,
        ownerId: managerUser.id,
      },
    });

    await prisma.notification.createMany({
      data: [
        {
          workspaceId: workspace.id,
          projectId: project.id,
          userId: managerUser.id,
          type: 'ASSIGNMENT',
          title: 'Task Assigned: Check Foundation',
          body: 'You have been assigned a new task.',
          entityType: 'node',
          entityId: node.id,
          read: false,
        },
        {
          workspaceId: workspace.id,
          projectId: project.id,
          userId: managerUser.id,
          type: 'APPROVAL_REQUEST',
          title: 'Approval Needed: Stage 1',
          body: 'Please review the stage submission.',
          entityType: 'node',
          entityId: node.id,
          read: false,
        },
        {
          workspaceId: workspace.id,
          projectId: project.id,
          userId: managerUser.id,
          type: 'DEADLINE_REMINDER',
          title: 'Deadline Approaching',
          body: 'Task is due within 24 hours.',
          entityType: 'node',
          entityId: node.id,
          read: false,
        },
      ],
    });
  });

  test.afterAll(async () => {
    if (prisma) {
      await prisma.notification.deleteMany({ where: { userId: managerUser?.id } }).catch(() => {});
      await prisma.node.deleteMany({ where: { workspaceId: workspace?.id } }).catch(() => {});
      await prisma.project.deleteMany({ where: { workspaceId: workspace?.id } }).catch(() => {});
      await prisma.nodeType.deleteMany({ where: { workspaceId: workspace?.id } }).catch(() => {});
      await prisma.statusSet.deleteMany({ where: { workspaceId: workspace?.id } }).catch(() => {});
      await prisma.membership.deleteMany({ where: { workspaceId: workspace?.id } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: managerUser?.id } }).catch(() => {});
      await prisma.workspace.deleteMany({ where: { id: workspace?.id } }).catch(() => {});
      await prisma.$disconnect();
    }
  });

  async function loginViaApiAndSetStorage(page: any) {
    const loginRes = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: managerEmail, password },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginData = await loginRes.json();
    const token = loginData.accessToken || loginData.token;
    expect(token).toBeTruthy();

    await page.addInitScript(
      ({ tok, wsId }: { tok: string; wsId: string }) => {
        window.localStorage.setItem('flowtrack_token', tok);
        window.localStorage.setItem('flowtrack_workspace_id', wsId);
      },
      { tok: token, wsId: workspace.id }
    );
  }

  test('renders rows inside viewport at 360x740 and 1366x768, matches server count, and Mark all read resets to 0', async ({ page }) => {
    await loginViaApiAndSetStorage(page);

    // 1. Desktop viewport 1366x768
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');

    const desktopBell = page.locator('#header-notifications-btn');
    await expect(desktopBell).toBeVisible({ timeout: 10000 });
    await expect(desktopBell.getByText('3')).toBeVisible({ timeout: 10000 });

    await desktopBell.click();

    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('3 new')).toBeVisible();

    // Verify portal is mounted directly on document.body (not clipped by navbar)
    const isPortalOnBody = await panel.evaluate((el) => el.parentElement?.parentElement === document.body);
    expect(isPortalOnBody).toBe(true);

    const rows = panel.getByTestId('notification-row');
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const box = await rows.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThan(20);
      expect(box!.y).toBeGreaterThanOrEqual(64);
      expect(box!.y + box!.height).toBeLessThanOrEqual(768);
    }

    await panel.getByRole('button', { name: 'Close notifications' }).click();
    await expect(panel).toBeHidden();

    // 2. Mobile viewport 360x740
    await page.setViewportSize({ width: 360, height: 740 });
    const mobileBell = page.locator('#mobile-nav-notifications-tab');
    await expect(mobileBell).toBeVisible();
    await expect(mobileBell.getByText('3')).toBeVisible();

    await mobileBell.click();
    await expect(panel).toBeVisible();

    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.width).toBe(360);
    expect(panelBox!.height).toBeLessThanOrEqual(740 - 64 + 1);

    const mobileRows = panel.getByTestId('notification-row');
    await expect(mobileRows).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const box = await mobileRows.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(64);
      expect(box!.y + box!.height).toBeLessThanOrEqual(740);
    }

    // 3. Mark all read sets count to 0
    const markAllBtn = panel.getByRole('button', { name: /mark all as read/i });
    await markAllBtn.click();

    await expect(panel.getByText(/\d+ new/)).toHaveCount(0);
    await expect(panel.getByTestId('unread-dot')).toHaveCount(0);
    await expect(mobileBell.getByText('3')).toHaveCount(0);
  });
});
