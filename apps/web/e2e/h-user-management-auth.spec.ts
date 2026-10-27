import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi';

test.describe('H. Frontend User Management & Authentication Workflows', () => {
  test('H1. Public registration collects full name, email, +91 Indian phone, password & confirmation', async ({ page }) => {
    await setupMockApi(page, { currentUser: null });
    await page.goto('/');

    // Click Sign In / Join to open AuthModal
    const openAuthBtn = page.getByRole('button', { name: /sign in|login|get started|join/i }).first();
    await openAuthBtn.click();

    // Switch to Register tab
    const registerTab = page.locator('#tab-auth-register');
    await expect(registerTab).toBeVisible();
    await registerTab.click();

    // Verify presence of +91 prefix pill
    await expect(page.getByText('+91', { exact: true })).toBeVisible();

    // Fill registration form
    await page.locator('#register-fullname-input').fill('Sunita Deshmukh');
    await page.locator('#register-email-input').fill('sunita@flowtrack.in');
    await page.locator('#register-phone-input').fill('9876543210');

    // Fill mismatching passwords to test validation
    await page.locator('#register-password-input').fill('SecurePassword123!');
    await page.locator('#register-confirm-password-input').fill('DifferentPassword123!');

    await page.locator('#register-submit-btn').click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();

    // Correct password confirmation
    await page.locator('#register-confirm-password-input').fill('SecurePassword123!');

    // Select Requested Role (Manager)
    const roleSelect = page.locator('#register-role-select');
    await expect(roleSelect).toBeVisible();
    await roleSelect.selectOption('MANAGER');

    // Submit valid registration
    await page.locator('#register-submit-btn').click();

    // Verify modal closes and session activates
    await expect(page.locator('#register-submit-btn')).not.toBeVisible({ timeout: 10000 });
  });

  test('H2. Password show/hide toggle toggles input visibility on Login & Registration', async ({ page }) => {
    await setupMockApi(page, { currentUser: null });
    await page.goto('/');

    const openAuthBtn = page.getByRole('button', { name: /sign in|login/i }).first();
    await openAuthBtn.click();

    const passwordInput = page.locator('#login-password-input');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click show password button
    const toggleBtn = page.getByLabel(/show password|hide password/i).first();
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click hide password button
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('H3. Forgot Password flow navigates to recovery view and dispatches token', async ({ page }) => {
    await setupMockApi(page, { currentUser: null });
    await page.goto('/');

    const openAuthBtn = page.getByRole('button', { name: /sign in|login/i }).first();
    await openAuthBtn.click();

    // Click "Forgot password?" link
    const forgotBtn = page.getByRole('button', { name: /forgot password/i });
    await expect(forgotBtn).toBeVisible();
    await forgotBtn.click();

    // Verify recovery view is displayed
    await expect(page.getByText('Password Recovery')).toBeVisible();
    await expect(page.getByRole('button', { name: /send recovery instructions/i })).toBeVisible();

    // Submit recovery request
    await page.locator('input[placeholder="you@company.com"]').fill('recovery@flowtrack.in');
    await page.getByRole('button', { name: /send recovery instructions/i }).click();

    // Verify transition to reset step with single-use token
    await expect(page.getByRole('button', { name: /save new password/i })).toBeVisible({ timeout: 5000 });
  });

  test('H4. Invalid credentials triggers descriptive error without crashing UI', async ({ page }) => {
    await setupMockApi(page, { currentUser: null });
    await page.goto('/');

    const openAuthBtn = page.getByRole('button', { name: /sign in|login/i }).first();
    await openAuthBtn.click();

    await page.locator('#login-email-input').fill('admin@flowtrack.dev');
    await page.locator('#login-password-input').fill('WrongPassword123!');
    await page.locator('#login-submit-btn').click();

    // Expect invalid credential error message
    await expect(page.getByText(/invalid email or password|invalid credentials/i)).toBeVisible();
  });
});
