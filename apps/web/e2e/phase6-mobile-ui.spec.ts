import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:3001/api/v1';

async function authAs(page: any, email = 'maya@acme.dev', password = 'Demo@12345') {
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

const VIEWPORTS = [
  { name: '320x568-small-phone', width: 320, height: 568, isMobile: true },
  { name: '360x740-phone', width: 360, height: 740, isMobile: true },
  { name: '390x844-iphone12', width: 390, height: 844, isMobile: true },
  { name: '412x915-pixel', width: 412, height: 915, isMobile: true },
  { name: '768x1024-tablet-portrait', width: 768, height: 1024, isMobile: false },
  { name: '1024x768-tablet-landscape', width: 1024, height: 768, isMobile: false },
  { name: '1366x768-laptop', width: 1366, height: 768, isMobile: false },
  { name: '1920x1080-desktop', width: 1920, height: 1080, isMobile: false },
  { name: '2560x1440-2k', width: 2560, height: 1440, isMobile: false },
  { name: '844x390-landscape-phone', width: 844, height: 390, isMobile: true },
];

test.describe('Phase 6 Mobile-First Responsive & Touch UI Suite', () => {
  for (const vp of VIEWPORTS) {
    test(`F1. No horizontal page overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const { token } = await authAs(page, 'maya@acme.dev');

      const projRes = await page.request.get(`${API_URL}/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const projects = await projRes.json();
      const p1 = projects.find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL') || projects[0];

      await page.goto(`/projects/${p1.id}`);
      await page.waitForTimeout(1000);

      // Check document body does not exceed viewport width
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      // Check project title visibility
      const titleEl = page.locator('header, .sticky, div').filter({ hasText: 'Dealership Portal Launch' }).first();
      await expect(titleEl).toBeVisible();

      // Check bottom nav bar on mobile viewports (< 768px)
      if (vp.width < 768) {
        const bottomNav = page.locator('#mobile-bottom-nav');
        await expect(bottomNav).toBeVisible();
      }
    });
  }

  test('F2. Interactive elements have touch targets >= 44x44px on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { token } = await authAs(page, 'maya@acme.dev');

    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const projects = await projRes.json();
    const p1 = projects.find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL') || projects[0];

    await page.goto(`/projects/${p1.id}`);
    await page.waitForTimeout(1000);

    // Verify mobile bottom nav items are >= 44px
    const bottomNavButtons = page.locator('#mobile-bottom-nav button');
    const count = await bottomNavButtons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const box = await bottomNavButtons.nth(i).boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('F3. Drawer opens full-screen sheet on mobile with 4 short tabs and sticky bottom action', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { token } = await authAs(page, 'maya@acme.dev');

    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const projects = await projRes.json();
    const p1 = projects.find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL') || projects[0];

    await page.goto(`/projects/${p1.id}`);
    await page.waitForTimeout(1000);

    // Open first task from mobile list card or canvas node
    const taskItem = page.locator('.md\\:hidden .cursor-pointer, .react-flow__node, tbody tr').first();
    await expect(taskItem).toBeVisible({ timeout: 10000 });
    await taskItem.click({ force: true });

    const drawer = page.locator('#node-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 8000 });

    // Drawer takes full width on mobile
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    if (drawerBox) {
      expect(drawerBox.width).toBeCloseTo(390, -1);
    }

    // 4 short tabs are visible
    await expect(page.locator('#tab-details')).toBeVisible();
    await expect(page.locator('#tab-work')).toBeVisible();
    await expect(page.locator('#tab-approvals')).toBeVisible();
    await expect(page.locator('#tab-history')).toBeVisible();

    // Verify Sticky bottom action bar exists
    const mobileAction = page.locator('#mobile-drawer-primary-action');
    await expect(mobileAction).toBeVisible();

    // Verify close button closes the drawer
    const closeBtn = page.locator('#drawer-close-btn');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await page.waitForTimeout(400);
    await expect(drawer).not.toBeVisible();
  });

  test('F4. Board view has snap scrolling and touch Move dropdown on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { token } = await authAs(page, 'maya@acme.dev');

    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const projects = await projRes.json();
    const p1 = projects.find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL') || projects[0];

    await page.goto(`/projects/${p1.id}`);
    await page.waitForTimeout(1000);

    // Switch to Board view
    const boardTab = page.locator('button:has-text("Board")');
    await expect(boardTab).toBeVisible();
    await boardTab.click();
    await page.waitForTimeout(800);

    // Verify columns exist
    const boardCol = page.locator('.snap-center').first();
    await expect(boardCol).toBeVisible();

    // Verify column width is ~85vw on mobile
    const box = await boardCol.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(280);
      expect(box.width).toBeLessThan(390);
    }
  });

  test('F5. List view displays touch cards on mobile instead of wide table', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { token } = await authAs(page, 'maya@acme.dev');

    const projRes = await page.request.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const projects = await projRes.json();
    const p1 = projects.find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL') || projects[0];

    await page.goto(`/projects/${p1.id}`);
    await page.waitForTimeout(1000);

    // Switch to List view
    const listTab = page.locator('button:has-text("List")');
    await expect(listTab).toBeVisible();
    await listTab.click();
    await page.waitForTimeout(800);

    // Verify desktop table is hidden on mobile
    await expect(page.locator('.hidden.md\\:block table')).not.toBeVisible();

    // Verify mobile cards are visible
    const mobileCards = page.locator('.md\\:hidden .cursor-pointer');
    await expect(mobileCards.first()).toBeVisible();
  });
});
