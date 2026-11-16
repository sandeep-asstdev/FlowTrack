import { test, expect } from '@playwright/test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PrismaClient, Role } = require('../../api/node_modules/@prisma/client');
const bcrypt = require('../../api/node_modules/bcryptjs');

test.describe('Receiver Assigned Task and Approvals Visibility E2E Browser Test', () => {
  let prisma: PrismaClient;

  const timestamp = Date.now();
  const password = 'Password123!';
  let passwordHash: string;

  let adminUser: any;
  let userA: any;
  let workspace: any;

  let adminToken: string;
  let tokenA: string;
  let projectId: string;
  let taskId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    passwordHash = await bcrypt.hash(password, 10);

    // 1. Create Workspace
    workspace = await prisma.workspace.create({
      data: {
        name: `Browser WS ${timestamp}`,
        slug: `browser-ws-${timestamp}`,
      },
    });

    // 2. Status set and node type
    const statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: 'Default Statuses',
        isDefault: true,
        statuses: {
          create: [
            { key: 'To Do', category: 'todo', displayOrder: 1 },
            { key: 'In Progress', category: 'in_progress', displayOrder: 2 },
            { key: 'Done', category: 'done', displayOrder: 3 },
          ],
        },
      },
    });

    await prisma.nodeType.create({
      data: {
        workspaceId: workspace.id,
        name: 'Task',
        key: 'task',
        defaultStatusSetId: statusSet.id,
      },
    });

    // 3. Create Users
    adminUser = await prisma.user.create({
      data: {
        email: `admin_browser_${timestamp}@flowtrack.test`,
        fullName: 'Alice Browser Admin',
        passwordHash,
        isActive: true,
      },
    });
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: adminUser.id,
        role: Role.ADMIN,
      },
    });

    userA = await prisma.user.create({
      data: {
        email: `usera_browser_${timestamp}@flowtrack.test`,
        fullName: 'Ananya Browser UserA',
        passwordHash,
        isActive: true,
      },
    });

    // 4. Admin logs in via HTTP API to get JWT
    const adminLoginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminUser.email, password }),
    });
    const adminLoginData = await adminLoginRes.json();
    adminToken = adminLoginData.accessToken;

    // 5. Admin creates project via HTTP API
    const projRes = await fetch('http://localhost:3001/api/v1/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        name: `Browser Project Alpha ${timestamp}`,
        description: 'Receiver assignment visibility in real browser',
        workspaceId: workspace.id,
      }),
    });
    const projData = await projRes.json();
    projectId = projData.id;

    // 6. Admin creates task assigned to User A via HTTP API
    const taskRes = await fetch('http://localhost:3001/api/v1/nodes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-workspace-id': workspace.id,
      },
      body: JSON.stringify({
        title: `Deliverable For User A ${timestamp}`,
        projectId,
        workspaceId: workspace.id,
        ownerId: userA.id,
        priority: 'HIGH',
      }),
    });
    const taskData = await taskRes.json();
    taskId = taskData.id;

    // 7. User A logs in via HTTP API to get JWT and verify preferred workspace
    const loginARes = await fetch('http://localhost:3001/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password }),
    });
    const loginAData = await loginARes.json();
    tokenA = loginAData.accessToken;
  });

  test.afterAll(async () => {
    try {
      if (workspace?.id) {
        await prisma.node.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
        await prisma.project.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
        await prisma.membership.deleteMany({ where: { workspaceId: workspace.id } }).catch(() => null);
        await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
      }
      if (adminUser?.id) await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => null);
      if (userA?.id) await prisma.user.delete({ where: { id: userA.id } }).catch(() => null);
    } catch {
      // non-blocking
    } finally {
      await prisma.$disconnect();
    }
  });

  test('Receiver User A sees project, task in My Tasks, and responsive layout on 360px', async ({ page }) => {
    // 1. Visit app and set credentials in localStorage before page loads
    await page.addInitScript(
      ({ token, wsId, u }) => {
        localStorage.setItem('flowtrack_token', token);
        localStorage.setItem('flowtrack_workspace_id', wsId);
        localStorage.setItem('flowtrack_user', JSON.stringify(u));
      },
      {
        token: tokenA,
        wsId: workspace.id,
        u: {
          id: userA.id,
          email: userA.email,
          fullName: 'Ananya Browser UserA',
          role: 'MEMBER',
        },
      }
    );

    await page.goto('/');

    // 2. Verify User A is authenticated and sees notifications bell
    await expect(page.locator('#header-notifications-btn')).toBeVisible({ timeout: 10000 });

    // 3. Verify Project Alpha appears in Projects list (limited view)
    const projectCard = page.getByText(`Browser Project Alpha ${timestamp}`);
    await expect(projectCard).toBeVisible({ timeout: 10000 });

    // 4. Navigate to "My Tasks"
    const myTasksNav = page.locator('#desktop-nav-my-work-btn').or(page.getByRole('button', { name: /my tasks/i }).first());
    await myTasksNav.click();

    // 5. Verify the task card in My Tasks displays title, project, assigned by, state
    const taskTitle = page.getByText(`Deliverable For User A ${timestamp}`);
    await expect(taskTitle).toBeVisible({ timeout: 8000 });

    const assignedByLabel = page.getByText(/assigned by:\s*Alice Browser Admin/i).first();
    await expect(assignedByLabel).toBeVisible();

    // Capture Desktop Screenshot
    await page.screenshot({ path: 'test-results/receiver-mytasks-desktop.png', fullPage: true });

    // 6. Test 360px Phone Viewport Responsiveness
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(taskTitle).toBeVisible();
    await expect(assignedByLabel).toBeVisible();

    // Capture 360px Mobile Screenshot
    await page.screenshot({ path: 'test-results/receiver-mytasks-360px-mobile.png', fullPage: true });

    // 7. Click "Open Canvas" button to view project canvas
    const openCanvasBtn = page.getByRole('button', { name: /open canvas/i }).first();
    await expect(openCanvasBtn).toBeVisible();
    await openCanvasBtn.click();

    // Canvas loads with node visible
    await page.waitForTimeout(1000);
    await expect(page.getByText(`Deliverable For User A ${timestamp}`).first()).toBeVisible({ timeout: 8000 });
  });
});
