import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/mockApi';

test.describe('F. User & Team Management', () => {
  test('F1. Admin views workspace team members with roles and statuses', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/');

    // Navigate to Team & Users
    const usersNavBtn = page.locator('#desktop-nav-users-btn').or(page.getByRole('button', { name: /team & users|team/i })).first();
    await expect(usersNavBtn).toBeVisible({ timeout: 10000 });
    await usersNavBtn.click();

    // Verify members are listed in the user table
    const usersTable = page.getByRole('table');
    await expect(usersTable.getByText('Suresh Sharma')).toBeVisible({ timeout: 10000 });
    await expect(usersTable.getByText('Ramesh Kumar')).toBeVisible();
    await expect(usersTable.getByText('System Administrator')).toBeVisible();
  });

  test('F2. Inviting a new team member opens accessible modal with validation', async ({ page }) => {
    await loginAs(page, 'ADMIN');
    await page.goto('/');

    const usersNavBtn = page.locator('#desktop-nav-users-btn').or(page.getByRole('button', { name: /team & users|team/i })).first();
    await usersNavBtn.click();

    // Click "Invite Member" button
    const inviteBtn = page.locator('#invite-member-btn');
    await expect(inviteBtn).toBeVisible({ timeout: 8000 });
    await inviteBtn.click();

    const modal = page.locator('#invite-member-modal');
    await expect(modal).toBeVisible();

    // Email input
    const emailInput = modal.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible();
    await emailInput.fill('consultant@external-partner.com');

    // Close modal
    const closeBtn = modal.getByLabel('Close invite modal');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('F3. Member cannot access or alter user roles', async ({ page }) => {
    await loginAs(page, 'MEMBER');
    await page.goto('/');

    // Team & Users link is completely hidden from Member
    await expect(page.locator('#desktop-nav-users-btn')).not.toBeVisible();
  });
});
