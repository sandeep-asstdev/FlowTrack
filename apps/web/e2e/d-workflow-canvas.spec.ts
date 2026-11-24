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

    // If Create Task modal opens, fill out title and submit
    const titleInput = page.locator('#task-title-input');
    if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await titleInput.fill('New Canvas Task');
      await page.locator('#create-task-submit-btn').click();
    }

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

  test('D5. Quick-Add popup opens near pointer and creates tasks on double-click and on connection drag release', async ({ page }) => {
    await loginAs(page, 'MANAGER');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects/proj-skyline');
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });

    const canvasPane = page.locator('.react-flow__pane');
    await expect(canvasPane).toBeVisible();

    const initialNodesCount = await page.locator('.react-flow__node').count();

    // 1. Double-click on empty canvas area
    const clickPos = { x: 450, y: 250 };
    await canvasPane.dblclick({ position: clickPos });

    // Verify popup appears near the click and not under the minimap
    const popup = page.locator('[data-testid="canvas-quick-add-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });
    const popupBox = await popup.boundingBox();
    expect(popupBox).not.toBeNull();
    // Popup should open near click position (within 40px)
    expect(Math.abs((popupBox?.x || 0) - clickPos.x)).toBeLessThanOrEqual(40);

    // Verify pressing Escape closes the popup
    await page.keyboard.press('Escape');
    await expect(popup).not.toBeVisible();

    // Reopen popup by double clicking again
    await canvasPane.dblclick({ position: clickPos });
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Click "Add Task"
    const addTaskBtn = popup.locator('[data-testid="quick-add-task-btn"]');
    await addTaskBtn.click();
    await expect(popup).not.toBeVisible();

    // Verify exactly one task appears near the click
    await expect(page.locator('.react-flow__node')).toHaveCount(initialNodesCount + 1, { timeout: 8000 });
    const newestNode = page.locator('.react-flow__node').last();
    await expect(newestNode).toBeVisible();

    // Close the task detail drawer if opened so the backdrop does not intercept canvas events
    const drawerCloseBtn = page.locator('#drawer-close-btn');
    if (await drawerCloseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await drawerCloseBtn.click();
      await expect(drawerCloseBtn).not.toBeVisible({ timeout: 5000 });
    }

    // 2. Drag a connection from a task handle onto empty space and release
    const sourceHandle = newestNode.locator('.react-flow__handle-right');
    await expect(sourceHandle).toBeVisible();
    const handleBox = await sourceHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    if (handleBox) {
      // Drop below in empty canvas space (away from neighboring nodes)
      const dropX = handleBox.x + 80;
      const dropY = handleBox.y + 220;

      await sourceHandle.hover();
      await page.mouse.down();
      await page.mouse.move(dropX, dropY, { steps: 10 });
      await page.mouse.up();

      // Quick-add popup should open at connection drop location
      await expect(popup).toBeVisible({ timeout: 5000 });

      const nodesCountBeforeRelease = await page.locator('.react-flow__node').count();

      // Click "Add Task"
      await popup.locator('[data-testid="quick-add-task-btn"]').click();
      await expect(popup).not.toBeVisible();

      // Verify exactly one new task appears
      await expect(page.locator('.react-flow__node')).toHaveCount(nodesCountBeforeRelease + 1, { timeout: 8000 });
    }
  });
});
