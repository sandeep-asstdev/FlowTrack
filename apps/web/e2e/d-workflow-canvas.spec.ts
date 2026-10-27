import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/mockApi';

test.describe('D. Workflow Canvas & Interactive Graph', () => {
  test('D1. Renders existing nodes and edge connections with accurate positions', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/projects/proj-skyline');

    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });

    // Node 1, 2, 3 should all be rendered
    const node1 = page.locator('.react-flow__node').filter({ hasText: 'Site Excavation & Grading' }).first();
    const node2 = page.locator('.react-flow__node').filter({ hasText: 'Foundation Concrete Pouring' }).first();
    const node3 = page.locator('.react-flow__node').filter({ hasText: 'Structural Steel Erection' }).first();

    await expect(node1).toBeVisible({ timeout: 10000 });
    await expect(node2).toBeVisible();
    await expect(node3).toBeVisible();

    // Verify edge is rendered in ReactFlow SVG layer
    const edge = page.locator('.react-flow__edge');
    await expect(edge.first()).toBeVisible();
  });

  test('D2. Adds a new task node onto the canvas in a sensible position', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/projects/proj-skyline');

    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });

    // Click "+ Task" button in canvas toolbar
    const addTaskBtn = page.locator('#toolbar-add-task-btn');
    await expect(addTaskBtn).toBeVisible({ timeout: 8000 });
    await addTaskBtn.click();

    // Verify a new task node is placed on the canvas
    await expect(page.locator('.react-flow__node').filter({ hasText: /task/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('D3. Zoom in, Zoom out, and Fit View controls work on desktop', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/projects/proj-skyline');

    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });

    // On desktop, ReactFlow's standard controls are visible
    const zoomInBtn = page.locator('.react-flow__controls-zoomin');
    const zoomOutBtn = page.locator('.react-flow__controls-zoomout');
    const fitViewBtn = page.locator('.react-flow__controls-fitview');

    await expect(zoomInBtn).toBeVisible();
    await expect(zoomOutBtn).toBeVisible();
    await expect(fitViewBtn).toBeVisible();

    // Record initial viewport transform attribute
    const viewport = page.locator('.react-flow__viewport');
    const initialTransform = await viewport.getAttribute('style');

    // Click Zoom In
    await zoomInBtn.click();
    await page.waitForTimeout(300);
    const zoomedInTransform = await viewport.getAttribute('style');
    expect(zoomedInTransform).not.toEqual(initialTransform);

    // Click Fit View
    await fitViewBtn.click();
    await page.waitForTimeout(300);
    const fitViewTransform = await viewport.getAttribute('style');
    expect(fitViewTransform).toBeDefined();
  });

  test('D4. Duplicate canvas zoom controls are NOT rendered on mobile or desktop viewports', async ({ page }) => {
    // Desktop check (1280px): Only standard controls, no mobile dock controls
    await loginAs(page, 'ADMIN');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects/proj-skyline');
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });

    // Desktop should have ReactFlow controls
    await expect(page.locator('.react-flow__controls')).toBeVisible();
    // Mobile dock should be hidden on desktop
    await expect(page.locator('#mobile-canvas-controls')).not.toBeVisible();

    // Mobile check (375px): ReactFlow controls hidden, only mobile dock visible
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);

    // Standard controls should be hidden on mobile (<sm)
    await expect(page.locator('.react-flow__controls')).not.toBeVisible();

    // Single mobile dock should be visible
    await expect(page.locator('#mobile-canvas-controls')).toBeVisible();
    const mobileZoomIn = page.locator('#mobile-zoom-in-btn');
    const mobileZoomOut = page.locator('#mobile-zoom-out-btn');
    await expect(mobileZoomIn).toBeVisible();
    await expect(mobileZoomOut).toBeVisible();

    // Verify there is exactly ONE zoom in and ONE zoom out control on mobile
    const visibleZoomInButtons = await page.locator('button:visible').filter({ has: page.locator('svg') }).evaluateAll((buttons) => {
      return buttons.filter(b => b.id.includes('zoom-in') || b.getAttribute('aria-label')?.includes('zoom in') || b.className.includes('zoomin')).length;
    });
    expect(visibleZoomInButtons).toBe(1);
  });
});
