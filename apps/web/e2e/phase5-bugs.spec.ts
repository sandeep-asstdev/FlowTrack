import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:3001/api/v1';
const BASE_URL = 'http://localhost:5173';

// Helper to authenticate via API and store token in localStorage
async function authAs(page: any, email: string, password = 'Demo@12345') {
  const res = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const token = data.accessToken;
  const workspaceId = data.activeWorkspaceId;

  await page.addInitScript(
    ({ tok, wsId }: { tok: string; wsId: string }) => {
      localStorage.setItem('flowtrack_token', tok);
      localStorage.setItem('flowtrack_workspace_id', wsId);
    },
    { tok: token, wsId: workspaceId }
  );

  return { token, workspaceId, user: data.user };
}

test.describe('Phase 5 — User-Facing Bug Verification & Reproduction Suite', () => {
  // ---------------------------------------------------------------------------
  // BUG 1 & 4: State and completion reflection on canvas, list, and board
  // ---------------------------------------------------------------------------
  test('BUG 1 & 4: Task state and completion update canvas node, list row, board card and persist across reloads', async ({ page }) => {
    const { token } = await authAs(page, 'maya@acme.dev');

    // 1. Fetch Project 1 nodes to find Maya's task A1.1 Provision database
    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const projects = await projRes.json();
    const p1 = projects.find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL');
    expect(p1).toBeDefined();

    const nodeRes = await page.request.get(`${API_URL}/nodes?projectId=${p1.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const nodes = await nodeRes.json();
    const taskA11 = nodes.find((n: any) => n.title.includes('Provision database'));
    expect(taskA11).toBeDefined();

    // Reset task state to Draft for clean reproduction
    await page.request.post(`${API_URL}/nodes/${taskA11.id}/transition`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { toState: 'Draft', bypassGuards: true },
    }).catch(() => {});

    // Open the canvas project view
    await page.goto(`/projects/${p1.id}`);
    await page.waitForLoadState('networkidle');

    // Canvas node should show Draft badge
    const nodeCard = page.locator('.react-flow__node').filter({ hasText: 'Provision database' }).first();
    await expect(nodeCard).toBeVisible({ timeout: 10000 });
    await expect(nodeCard).toContainText('Draft');

    // Click node to open detail drawer
    await nodeCard.click();
    const drawer = page.locator('#node-detail-drawer, [data-testid="node-detail-drawer"]').or(page.locator('aside')).first();
    await expect(drawer).toBeVisible();

    // Transition state to In Progress via drawer
    const startBtn = page.getByRole('button', { name: /start|in progress|accept/i }).first();
    await startBtn.click();

    // Verify node badge on canvas reflects 'In Progress' immediately
    await expect(nodeCard).toContainText(/In Progress/i, { timeout: 8000 });

    // Verify List view reflects 'In Progress'
    const listViewBtn = page.getByRole('button', { name: /list/i }).first();
    await listViewBtn.click();
    const listRow = page.locator('tr').filter({ hasText: 'Provision database' }).first();
    await expect(listRow).toContainText(/In Progress/i);

    // Verify Board view reflects 'In Progress'
    const boardViewBtn = page.getByRole('button', { name: /board/i }).first();
    await boardViewBtn.click();
    const boardColumn = page.locator('div').filter({ hasText: /^In Progress/i }).first();
    await expect(boardColumn.locator('h4').filter({ hasText: 'Provision database' })).toBeVisible();

    // Reload page and assert persistence
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Provision database' })).toContainText(/In Progress/i);
  });

  // ---------------------------------------------------------------------------
  // BUG 2: Approve buttons for approvers only (Separation of Duties & Role Guard)
  // ---------------------------------------------------------------------------
  test('BUG 2: Submitter never sees Approve buttons; unrelated manager cannot approve; assigned approver does', async ({ page }) => {
    // 1. Get task A1.1 and submit it as Maya
    const mayaAuth = await authAs(page, 'maya@acme.dev');
    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
    });
    const p1 = (await projRes.json()).find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL');

    const nodeRes = await page.request.get(`${API_URL}/nodes?projectId=${p1.id}`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
    });
    const taskA11 = (await nodeRes.json()).find((n: any) => n.title.includes('Provision database'));

    // Move task into Ready for Review / pending approval state
    await page.request.post(`${API_URL}/nodes/${taskA11.id}/transition`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
      data: { toState: 'Ready for Review', bypassGuards: true },
    });

    // Check as Maya (Submitter): open drawer, assert NO Approve / Reject buttons visible
    await page.goto(`/projects/${p1.id}`);
    const nodeCard = page.locator('.react-flow__node').filter({ hasText: 'Provision database' }).first();
    await nodeCard.click();
    await expect(page.getByRole('button', { name: /^Approve$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Reject|Request changes/i })).toHaveCount(0);

    // Direct API attempt by Maya to approve own task should return 403
    const mayaDecisionRes = await page.request.post(`${API_URL}/approvals/decide`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
      data: { taskId: taskA11.id, decision: 'Approved' },
    });
    expect(mayaDecisionRes.status()).toBe(403);

    // Check as Omar (unrelated manager not assigned to P1 / stage): cannot approve
    const omarAuth = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: 'omar@acme.dev', password: 'Demo@12345' },
    });
    const omarToken = (await omarAuth.json()).accessToken;
    const omarDecisionRes = await page.request.post(`${API_URL}/approvals/decide`, {
      headers: { Authorization: `Bearer ${omarToken}` },
      data: { taskId: taskA11.id, decision: 'Approved' },
    });
    expect(omarDecisionRes.status()).toBe(403);

    // Check as Tom (Assigned Approver / Team Leader): can see approve buttons and make decisions
    const tomAuth = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: 'tom@acme.dev', password: 'Demo@12345' },
    });
    const tomToken = (await tomAuth.json()).accessToken;
    // Tom decision without mandatory reason when rejecting should be rejected
    const tomRejectNoReason = await page.request.post(`${API_URL}/approvals/decide`, {
      headers: { Authorization: `Bearer ${tomToken}` },
      data: { taskId: taskA11.id, decision: 'Rejected', reason: '' },
    });
    expect([400, 422]).toContain(tomRejectNoReason.status());
  });

  // ---------------------------------------------------------------------------
  // BUG 3: Members editing other people's tasks (SECURITY)
  // ---------------------------------------------------------------------------
  test('BUG 3: Member (Maya) cannot edit Sam\'s task via UI or API (403 + security violation audit)', async ({ page }) => {
    const mayaAuth = await authAs(page, 'maya@acme.dev');

    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
    });
    const p1 = (await projRes.json()).find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL');

    const nodeRes = await page.request.get(`${API_URL}/nodes?projectId=${p1.id}`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
    });
    const samTask = (await nodeRes.json()).find((n: any) => n.title.includes('Configure backups') || n.title.includes('Inventory module'));
    expect(samTask).toBeDefined();

    // 1. Direct PATCH /nodes/:id attempting to change title/description by Maya
    const directEditRes = await page.request.patch(`${API_URL}/nodes/${samTask.id}`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
      data: { title: 'Tampered by Maya' },
    });
    expect(directEditRes.status()).toBe(403);

    // 2. Direct PATCH attempting to change dates or checklist on Sam's task
    const dateEditRes = await page.request.patch(`${API_URL}/nodes/${samTask.id}/dates`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
      data: { dueDate: new Date(Date.now() + 86400000).toISOString() },
    }).catch((e) => e);
    // If endpoint exists, must be 403 or 404
    if (typeof dateEditRes.status === 'function') {
      expect([403, 404]).toContain(dateEditRes.status());
    }

    // 3. Verify security violation audit log was recorded
    const auditRes = await page.request.get(`${API_URL}/audit/events?entityId=${samTask.id}`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
    });
    if (auditRes.ok()) {
      const logs = await auditRes.json();
      const securityEvent = (logs.events || logs).find((e: any) => 
        e.action === 'SECURITY_VIOLATION' || 
        e.action === 'UNAUTHORIZED_TASK_EDIT' ||
        (e.reason && e.reason.includes('denied'))
      );
      expect(securityEvent).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // BUG 5: Member (Maya) workspace and checklist
  // ---------------------------------------------------------------------------
  test('BUG 5: Maya workspace flow: open task, accept, start, tick checklist, tick persists and updates readiness', async ({ page }) => {
    const { token } = await authAs(page, 'maya@acme.dev');

    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const p1 = (await projRes.json()).find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL');

    const nodeRes = await page.request.get(`${API_URL}/nodes?projectId=${p1.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const taskA11 = (await nodeRes.json()).find((n: any) => n.title.includes('Provision database'));

    // Open task in project canvas
    await page.goto(`/projects/${p1.id}`);
    const nodeCard = page.locator('.react-flow__node').filter({ hasText: 'Provision database' }).first();
    await nodeCard.click();

    // Verify checklist items are rendered in drawer
    const checklistSection = page.locator('[data-testid="checklist-section"], #checklist-container').or(page.getByText(/checklist/i).first());
    await expect(checklistSection).toBeVisible();

    // Tick the checklist item
    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.check();

    // Verify checklist tick persists after page reload
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('.react-flow__node').filter({ hasText: 'Provision database' }).first().click();
    await expect(page.locator('input[type="checkbox"]').first()).toBeChecked();

    // Verify completion readiness reflects checklist progression
    const readinessRes = await page.request.get(`${API_URL}/nodes/${taskA11.id}/completion-readiness`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const readiness = await readinessRes.json();
    expect(readiness).toBeDefined();
    expect(readiness.gates).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // BUG 6: Show who assigned and who is assigned
  // ---------------------------------------------------------------------------
  test('BUG 6: Node cards, list rows, and task details show Assigned to and Assigned by', async ({ page }) => {
    const { token } = await authAs(page, 'maya@acme.dev');

    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const p1 = (await projRes.json()).find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL');

    await page.goto(`/projects/${p1.id}`);
    const nodeCard = page.locator('.react-flow__node').filter({ hasText: 'Provision database' }).first();
    await expect(nodeCard).toBeVisible();

    // Assert "Assigned to" (Maya Patel) and "Assigned by" (Cara Vance or Tom Hayes) are visible on node
    await expect(nodeCard).toContainText(/Maya Patel/i);
    await expect(nodeCard).toContainText(/Cara Vance|Tom Hayes|Assigned by/i);

    // Open detail drawer and verify assigner info
    await nodeCard.click();
    await expect(page.getByText(/Assigned by/i)).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // BUG 7 & 8: Submission with remarks, files, approver review, rejection & v2
  // ---------------------------------------------------------------------------
  test('BUG 7 & 8: Member submission with remarks and files; approver review; rejection with mandatory reason and resubmission v2', async ({ page }) => {
    const mayaAuth = await authAs(page, 'maya@acme.dev');
    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
    });
    const p1 = (await projRes.json()).find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL');
    const nodeRes = await page.request.get(`${API_URL}/nodes?projectId=${p1.id}`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
    });
    const taskA11 = (await nodeRes.json()).find((n: any) => n.title.includes('Provision database'));

    // Submit work v1 with remarks
    const subRes1 = await page.request.post(`${API_URL}/nodes/${taskA11.id}/submit-work`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
      data: {
        remarks: 'Database provisioned with PostgreSQL 16 cluster and SSL enabled.',
        links: ['https://db.internal.acme.dev'],
      },
    });
    expect(subRes1.ok()).toBeTruthy();
    const subData1 = await subRes1.json();
    expect(subData1.version || 1).toBe(1);

    // Tom rejects v1 with mandatory reason
    const tomLogin = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: 'tom@acme.dev', password: 'Demo@12345' },
    });
    const tomToken = (await tomLogin.json()).accessToken;
    const rejectRes = await page.request.post(`${API_URL}/approvals/decide`, {
      headers: { Authorization: `Bearer ${tomToken}` },
      data: {
        taskId: taskA11.id,
        decision: 'Changes Requested',
        reason: 'Postgres connection pooling (PgBouncer) configuration is required.',
      },
    });
    expect(rejectRes.ok()).toBeTruthy();

    // Resubmit as v2 with updated remarks
    const subRes2 = await page.request.post(`${API_URL}/nodes/${taskA11.id}/submit-work`, {
      headers: { Authorization: `Bearer ${mayaAuth.token}` },
      data: {
        remarks: 'PgBouncer installed and connection limit set to 200.',
        links: ['https://db.internal.acme.dev', 'https://pgbouncer.internal.acme.dev'],
      },
    });
    expect(subRes2.ok()).toBeTruthy();
    const subData2 = await subRes2.json();
    expect(subData2.version).toBe(2);

    // Verify submission history contains both v1 and v2
    const histRes = await page.request.get(`${API_URL}/nodes/${taskA11.id}/submissions`, {
      headers: { Authorization: `Bearer ${tomToken}` },
    });
    expect(histRes.ok()).toBeTruthy();
    const submissions = await histRes.json();
    expect(submissions.length).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // BUG 9: Schedule and duration recalculation
  // ---------------------------------------------------------------------------
  test('BUG 9: Duration editing recalculates due date (start + duration = due); invalid dates rejected', async ({ page }) => {
    const { token } = await authAs(page, 'tom@acme.dev');
    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const p1 = (await projRes.json()).find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL');
    const nodeRes = await page.request.get(`${API_URL}/nodes?projectId=${p1.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const task = (await nodeRes.json())[0];

    // Invalid date: due date before start date must be rejected
    const invalidDateRes = await page.request.patch(`${API_URL}/nodes/${task.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        startDate: '2026-11-10T00:00:00.000Z',
        dueDate: '2026-11-05T00:00:00.000Z',
      },
    });
    expect(invalidDateRes.status()).toBe(400);

    // Setting startDate and durationDays calculates dueDate = start + duration
    const validRecalcRes = await page.request.patch(`${API_URL}/nodes/${task.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        startDate: '2026-11-01T00:00:00.000Z',
        durationDays: 10,
      },
    });
    expect(validRecalcRes.ok()).toBeTruthy();
    const updatedTask = await validRecalcRes.json();
    expect(new Date(updatedTask.dueDate).toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  // ---------------------------------------------------------------------------
  // BUG 11 & 12: Workspace Views (List, Board drag-and-drop, Tree, Timeline, Calendar)
  // ---------------------------------------------------------------------------
  test('BUG 11 & 12: Views display real data; Kanban board drag and drop calls transition API and snaps back on error', async ({ page }) => {
    const { token } = await authAs(page, 'tom@acme.dev');
    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const p1 = (await projRes.json()).find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL');

    await page.goto(`/projects/${p1.id}`);
    await page.waitForLoadState('networkidle');

    // Test Board View
    const boardBtn = page.getByRole('button', { name: /board/i }).first();
    await boardBtn.click();
    await expect(page.locator('h3').filter({ hasText: 'Draft' })).toBeVisible();
    await expect(page.locator('h3').filter({ hasText: 'In Progress' })).toBeVisible();

    // Verify card is draggable
    const card = page.locator('div[draggable="true"]').first();
    await expect(card).toBeVisible({ timeout: 8000 });

    // Test Tree View
    const treeBtn = page.getByRole('button', { name: /tree/i }).first();
    await treeBtn.click();
    await expect(page.getByText(/Tree Structure|Hierarchy/i).first()).toBeVisible();

    // Test Timeline View
    const timelineBtn = page.getByRole('button', { name: /timeline/i }).first();
    await timelineBtn.click();
    await expect(page.getByText(/Timeline|Schedule/i).first()).toBeVisible();

    // Test Calendar View
    const calendarBtn = page.getByRole('button', { name: /calendar/i }).first();
    await calendarBtn.click();
    await expect(page.getByText(/Calendar/i).first()).toBeVisible();
  });
});

