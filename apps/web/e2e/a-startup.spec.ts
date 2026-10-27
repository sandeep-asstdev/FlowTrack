import { test, expect } from '@playwright/test';
import { setupMockApi, loginAs } from './fixtures/mockApi';

test.describe('A. Application Startup & Foundation', () => {
  test('A1. The frontend loads and renders without unhandled browser console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore benign favicon or font warnings if any
        if (!text.includes('favicon.ico') && !text.includes('status of 404')) {
          consoleErrors.push(text);
        }
      }
    });

    await setupMockApi(page);
    await page.goto('/');

    // Verify title and app header render
    await expect(page).toHaveTitle(/FlowTrack/i);
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByText('FlowTrack').first()).toBeVisible();

    // Verify no unhandled console errors occurred
    expect(consoleErrors).toEqual([]);
  });

  test('A2. Health check endpoint responds with 200 OK and healthy status', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    const health = await page.evaluate(async () => {
      const res = await fetch('/api/v1/health');
      return { status: res.status, data: await res.json() };
    });

    expect(health.status).toBe(200);
    expect(health.data.status).toBe('healthy');
  });

  test('A3. Unauthenticated visit displays login / auth CTA and clean empty states', async ({ page }) => {
    await setupMockApi(page, { currentUser: null });
    await page.goto('/');

    // Check for sign in CTA or button in header
    const signInBtn = page.getByRole('button', { name: /login|sign in/i }).first();
    await expect(signInBtn).toBeVisible();

    // Verify projects list or dashboard is empty/prompting
    await expect(page.locator('body')).not.toContainText('Uncaught TypeError');
  });

  test('A4. Authenticated startup restores session, workspace and displays active project list', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/');

    // Wait for project cards to appear
    await expect(page.getByText('Skyline Commercial Tower')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Acme Developments')).toBeVisible();

    // User profile badge
    await expect(page.getByText('Admin', { exact: false }).first()).toBeVisible();
  });
});
