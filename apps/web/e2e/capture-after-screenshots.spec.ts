import { test, expect } from '@playwright/test';
import * as path from 'path';

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
  { name: '320x568-small-phone', width: 320, height: 568 },
  { name: '360x740-phone', width: 360, height: 740 },
  { name: '390x844-iphone12', width: 390, height: 844 },
  { name: '412x915-pixel', width: 412, height: 915 },
  { name: '768x1024-tablet-portrait', width: 768, height: 1024 },
  { name: '1024x768-tablet-landscape', width: 1024, height: 768 },
  { name: '1366x768-laptop', width: 1366, height: 768 },
  { name: '1920x1080-desktop', width: 1920, height: 1080 },
  { name: '2560x1440-2k', width: 2560, height: 1440 },
  { name: '844x390-landscape-phone', width: 844, height: 390 },
  { name: 'zoom-200pct-desktop', width: 960, height: 540 },
];

test.describe('Capture Phase 6 After Screenshots', () => {
  for (const vp of VIEWPORTS) {
    test(`capture after at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const { token } = await authAs(page, 'maya@acme.dev');

      const projRes = await page.request.get(`${API_URL}/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const projects = await projRes.json();
      const p1 = projects.find((p: any) => p.name === 'Dealership Portal Launch' || p.key === 'DPL') || projects[0];

      const screenshotDir = path.resolve(process.cwd(), '../../docs/pm-platform/ui-screenshots/after');

      // 1. Capture Dashboard
      await page.goto('/');
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${screenshotDir}/${vp.name}-dashboard.png` });

      if (p1) {
        // 2. Capture Project Screen (Canvas / Toolbar / Views)
        await page.goto(`/projects/${p1.id}`);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${screenshotDir}/${vp.name}-project.png` });

        // 3. Open node detail drawer
        // Double-click on node or click list card
        const node = page.locator('.react-flow__node').first();
        if (await node.count() > 0) {
          await node.dblclick({ force: true }).catch(() => {});
        } else {
          const listTab = page.locator('button:has-text("List")');
          if (await listTab.count() > 0) {
            await listTab.click();
            await page.waitForTimeout(500);
          }
          const item = page.locator('tbody tr, .cursor-pointer').first();
          await item.click({ force: true }).catch(() => {});
        }
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${screenshotDir}/${vp.name}-drawer.png` });
      }
    });
  }
});

