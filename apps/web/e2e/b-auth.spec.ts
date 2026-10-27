import { test, expect } from '@playwright/test';
import { setupMockApi, loginAs } from './fixtures/mockApi';

test.describe('B. Authentication & Role Authorization', () => {
  test('B1. Successfully signs in with valid credentials and logs out', async ({ page }) => {
    await setupMockApi(page, { currentUser: null });
    await page.goto('/');

    // Open Auth modal
    const signInBtn = page.getByRole('button', { name: /login|sign in/i }).first();
    await signInBtn.click();

    // Verify modal is open
    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible();

    // Enter valid credentials
    await emailInput.fill('admin@flowtrack.dev');
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('Password123!');

    // Submit form
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Verify successful sign-in
    await expect(page.getByText('Skyline Commercial Tower')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('System Administrator').first()).toBeVisible();

    // Now test Logout
    const logoutBtn = page.locator('#header-logout-btn').or(page.getByRole('button', { name: /sign out|logout/i }).first());
    await logoutBtn.click();

    // After logout, sign-in button reappears
    await expect(page.locator('#header-signin-btn').or(page.getByRole('button', { name: /login|sign in/i }).first())).toBeVisible({ timeout: 10000 });
  });

  test('B2. Displays descriptive error upon invalid login credentials', async ({ page }) => {
    await setupMockApi(page, { currentUser: null });
    await page.goto('/');

    const signInBtn = page.getByRole('button', { name: /login|sign in/i }).first();
    await signInBtn.click();

    await page.locator('input[type="email"]').first().fill('admin@flowtrack.dev');
    await page.locator('input[type="password"]').first().fill('WrongPassword!');
    await page.locator('button[type="submit"]').first().click();

    // Verify error notification / banner
    await expect(page.getByText(/invalid email or password|failed/i)).toBeVisible({ timeout: 8000 });
  });

  test('B3. Handles session expiry gracefully by returning to login', async ({ page }) => {
    // Start with expired token simulation
    const state = await setupMockApi(page, { currentUser: null });
    await page.addInitScript(() => {
      window.localStorage.setItem('flowtrack_token', 'expired-mock-token');
      window.localStorage.setItem('flowtrack_workspace_id', 'ws-acme');
    });

    await page.goto('/');

    // Session expiry triggers auth prompt and unauthenticated state
    await expect(page.getByRole('button', { name: /login|sign in/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('B4. Role-specific navigation: Admin & Manager see Team & Approvals, Member sees restricted view', async ({ page }) => {
    // Test as Member
    await loginAs(page, 'MEMBER');
    await page.goto('/');

    await expect(page.getByText('Skyline Commercial Tower')).toBeVisible({ timeout: 10000 });

    // Member should NOT see "Team & Users" or "Review Queue" in desktop primary nav
    await expect(page.locator('#desktop-nav-users-btn')).not.toBeVisible();
    await expect(page.locator('#desktop-nav-approvals-btn')).not.toBeVisible();

    // Now reload as Manager
    await loginAs(page, 'MANAGER');
    await page.goto('/');

    // Manager should see both Team & Users and Review Queue
    await expect(page.locator('#desktop-nav-users-btn')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#desktop-nav-approvals-btn')).toBeVisible();
  });

  test('B5. Controlled Google Sign-In verification', async ({ page }) => {
    await setupMockApi(page, { currentUser: null });
    await page.goto('/');

    const signInBtn = page.getByRole('button', { name: /login|sign in/i }).first();
    await signInBtn.click();

    // Locate Google login button or simulated action
    const googleBtn = page.locator('#google-auth-button-container').or(page.getByRole('button', { name: /google/i }).first());
    await expect(googleBtn).toBeVisible();

    // Simulate Google credential delivery via page evaluation (testing the internal handleGoogleCredential callback)
    await page.evaluate(async () => {
      // Find the window or component callback if exposed or simulate the ApiClient call directly
      const win = window as any;
      if (typeof win.handleGoogleCredentialResponse === 'function') {
        await win.handleGoogleCredentialResponse({ credential: 'valid-mock-google-token' });
      }
    });
  });
});
