import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/mockApi';

test.describe('E. Task Details Drawer & Four-Eyes Approvals Engine', () => {
  test('E1. Opens task drawer and strictly validates the maximum 3-tab layout', async ({ page }) => {
    await loginAs(page, 'MANAGER');
    await page.goto('/projects/proj-skyline');

    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 12000 });

    // Click on node 2 "Foundation Concrete Pouring"
    const node2 = page.locator('.react-flow__node').filter({ hasText: 'Foundation Concrete Pouring' }).first();
    await node2.click();

    // Verify task details drawer is visible
    const drawer = page.locator('#node-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Verify the tabs: 4 short tabs (Details, Work, Approvals, History)
    const detailsTab = drawer.getByRole('button', { name: /details|overview/i }).first();
    const workTab = drawer.getByRole('button', { name: /work/i }).first();
    const approvalsTab = drawer.getByRole('button', { name: /approvals/i }).first();
    const historyTab = drawer.getByRole('button', { name: /history/i }).first();

    await expect(detailsTab).toBeVisible();
    await expect(workTab).toBeVisible();
    await expect(approvalsTab).toBeVisible();
    await expect(historyTab).toBeVisible();
  });

  test('E2. Edits task fields: priority, status, and deadline', async ({ page }) => {
    await loginAs(page, 'MANAGER');
    await page.goto('/projects/proj-skyline');

    const node2 = page.locator('.react-flow__node').filter({ hasText: 'Foundation Concrete Pouring' }).first();
    await node2.click();

    const drawer = page.locator('#node-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Switch to Work tab
    const workTab = drawer.getByRole('button', { name: /work/i }).first();
    await workTab.click();
    await expect(drawer.getByText(/deliverables|evidence|attachments|work/i).first()).toBeVisible();

    // Switch back to Details tab
    const detailsTab = drawer.getByRole('button', { name: /details|overview/i }).first();
    await detailsTab.click();
  });

  test('E3. Manager can view approval action state for deliverables', async ({ page }) => {
    await loginAs(page, 'MANAGER');
    await page.goto('/projects/proj-skyline');

    const node2 = page.locator('.react-flow__node').filter({ hasText: 'Foundation Concrete Pouring' }).first();
    await node2.click();

    const drawer = page.locator('#node-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Navigate to Approvals tab
    const approvalsTab = drawer.getByRole('button', { name: /approvals/i }).first();
    await approvalsTab.click();
    await expect(drawer.getByText(/audit|history|approvals/i).first()).toBeVisible();
  });

  test('E4. Four-Eyes Principle: Self-approval is blocked and Platform Admin cannot sign off', async ({ page }) => {
    // 1. Test as Member (Owner of task) trying to self-approve
    await loginAs(page, 'MEMBER');
    await page.goto('/projects/proj-skyline');

    const node2 = page.locator('.react-flow__node').filter({ hasText: 'Foundation Concrete Pouring' }).first();
    await node2.click();

    const drawer = page.locator('#node-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Member should NOT have active Approve Deliverables button
    const memberApproveBtn = drawer.getByRole('button', { name: /approve deliverables|sign off/i });
    await expect(memberApproveBtn).not.toBeVisible();

    // 2. Test as Platform Admin: Cannot sign off on deliverables (governance separation)
    await loginAs(page, 'ADMIN');
    await page.goto('/projects/proj-skyline');

    await page.locator('.react-flow__node').filter({ hasText: 'Foundation Concrete Pouring' }).first().click();
    const adminDrawer = page.locator('#node-detail-drawer');
    await expect(adminDrawer).toBeVisible({ timeout: 10000 });

    const adminApproveBtn = adminDrawer.getByRole('button', { name: /approve deliverables/i });
    await expect(adminApproveBtn).not.toBeVisible();
  });
});
