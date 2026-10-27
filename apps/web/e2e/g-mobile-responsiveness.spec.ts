import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/mockApi';

test.describe('G. Mobile Responsiveness & Multi-Viewport Verification', () => {
  const targetViewports = [
    { name: 'Ultra-compact iPhone SE', width: 320, height: 568 },
    { name: 'Samsung Galaxy / Android standard', width: 360, height: 640 },
    { name: 'Compact iPhone mini / X', width: 375, height: 667 },
    { name: 'Modern iPhone 12 / 13 / 14 / 15', width: 390, height: 844 },
    { name: 'Large iPhone Plus / Max', width: 414, height: 896 },
    { name: 'Tablet portrait (iPad)', width: 768, height: 1024 },
    { name: 'Laptop / Tablet landscape', width: 1024, height: 768 },
    { name: 'Standard Desktop', width: 1280, height: 720 },
    { name: 'Large Desktop 1440p', width: 1440, height: 900 },
  ];

  for (const vp of targetViewports) {
    test(`G1. Viewport ${vp.width}x${vp.height} (${vp.name}) - No unintended horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginAs(page, 'ADMIN');
      await page.goto('/');

      await expect(page.locator('header')).toBeVisible({ timeout: 10000 });

      // Check for horizontal overflow: scrollWidth should not exceed clientWidth by more than 1px
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      });

      expect(hasHorizontalScroll).toBe(false);
    });
  }

  test('G2. Hamburger menu opens, shows full navigation drawer via portal, and dismisses on backdrop', async ({ page }) => {
    // Mobile viewport 375px
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAs(page, 'ADMIN');
    await page.goto('/');

    // Hamburger button should be visible on mobile
    const hamburgerBtn = page.locator('#mobile-nav-toggle-btn');
    await expect(hamburgerBtn).toBeVisible({ timeout: 10000 });

    // Open hamburger drawer
    await hamburgerBtn.click();

    // Verify portal drawer mounted to document.body with z-[9999]
    const drawerPortal = page.locator('#mobile-nav-portal');
    await expect(drawerPortal).toBeVisible({ timeout: 5000 });

    // Verify navigation views inside drawer
    await expect(drawerPortal.getByText('Projects Canvas List')).toBeVisible();
    await expect(drawerPortal.getByText('My Tasks & Assignments')).toBeVisible();
    await expect(drawerPortal.getByText('Access Control Role')).toBeVisible();

    // Dismiss by tapping the backdrop
    const backdrop = page.locator('#mobile-nav-backdrop');
    await backdrop.click({ position: { x: 360, y: 300 } });

    // Verify drawer closed
    await expect(drawerPortal).not.toBeVisible({ timeout: 5000 });
  });

  test('G3. Canvas on mobile viewports renders exactly ONE set of zoom controls with >=44px touch target', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, 'ADMIN');
    await page.goto('/projects/proj-skyline');

    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });

    // ReactFlow controls should be hidden on mobile
    await expect(page.locator('.react-flow__controls')).not.toBeVisible();

    // Dedicated mobile floating dock should be visible
    const mobileDock = page.locator('#mobile-canvas-controls');
    await expect(mobileDock).toBeVisible();

    // Exactly one zoom-in and one zoom-out button
    const zoomIn = page.locator('#mobile-zoom-in-btn');
    const zoomOut = page.locator('#mobile-zoom-out-btn');
    const fitView = page.locator('#mobile-fit-view-btn');

    await expect(zoomIn).toBeVisible();
    await expect(zoomOut).toBeVisible();
    await expect(fitView).toBeVisible();

    // Measure touch target bounding boxes
    const zoomInBox = await zoomIn.boundingBox();
    const zoomOutBox = await zoomOut.boundingBox();

    expect(zoomInBox?.width).toBeGreaterThanOrEqual(44);
    expect(zoomInBox?.height).toBeGreaterThanOrEqual(44);
    expect(zoomOutBox?.width).toBeGreaterThanOrEqual(44);
    expect(zoomOutBox?.height).toBeGreaterThanOrEqual(44);
  });
});
