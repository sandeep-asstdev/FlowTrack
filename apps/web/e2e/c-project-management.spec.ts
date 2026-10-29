import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/mockApi';

test.describe('C. Project Management & Route Integrity', () => {
  test('C1. Creates a new project and opens its workflow canvas', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/');

    await expect(page.getByText('Skyline Commercial Tower')).toBeVisible({ timeout: 10000 });

    // Click "New Project" button
    const newProjBtn = page.locator('#dashboard-new-project-btn');
    await newProjBtn.click();

    // Select "Blank" project mode if tabs exist
    const blankTab = page.locator('#tab-mode-blank');
    if (await blankTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await blankTab.click();
    }

    // Fill project form in modal
    const nameInput = page.locator('input[placeholder*="Apex Hospital" i]').or(page.locator('input[type="text"]').first());
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Highland Hospital Wing B');

    // Submit project creation
    const launchBtn = page.locator('#launch-canvas-btn');
    await launchBtn.click();

    // Verify canvas opens with the new project
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });
    await expect(page.locator('#canvas-active-project-badge')).toContainText('Highland Hospital Wing B');
  });

  test('C2. Opens an existing project and confirms workflow canvas loads nodes', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/');

    // Find Skyline Commercial Tower card and click it to open canvas
    const projectCard = page.locator('h3').filter({ hasText: 'Skyline Commercial Tower' }).first();
    await expect(projectCard).toBeVisible({ timeout: 10000 });
    await projectCard.click();

    // Verify canvas loaded
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });

    // Verify nodes rendered
    await expect(page.getByText('Site Excavation & Grading')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Foundation Concrete Pouring')).toBeVisible();
  });

  test('C3. Refreshing the project route reopens the exact same project without failing', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    // Navigate directly to project route
    await page.goto('/projects/proj-skyline');

    // Canvas should load directly from URL path
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });
    await expect(page.locator('#canvas-active-project-badge')).toContainText('Skyline Commercial Tower');
    await expect(page.getByText('Foundation Concrete Pouring')).toBeVisible();

    // Trigger browser reload
    await page.reload();

    // Verify project reopens cleanly after refresh without redirecting to login or throwing error
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });
    await expect(page.locator('#canvas-active-project-badge')).toContainText('Skyline Commercial Tower');
    await expect(page.getByText('Foundation Concrete Pouring')).toBeVisible();
  });

  test('C4. Handles nonexistent project ID with friendly 404 message', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/projects/proj-non-existent-999');

    // Should display graceful error message rather than a blank screen or crash
    await expect(
      page.getByText(/not found|could not be found|does not exist/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});
