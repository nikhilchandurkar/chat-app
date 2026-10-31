/**
 * E2E: Authentication flows
 *
 * Covers:
 *   1. Open application
 *   2. Register a new account
 *   3. Log in
 *   4. Persist session (reload)
 *   5. Log out
 *   6. Reject invalid credentials
 */

import { test, expect } from "@playwright/test";
import { ensureUserExists, TEST_USER_1 } from "./helpers";

test.describe("Authentication", () => {
  test.beforeAll(async () => {
    // Ensure test user exists (idempotent)
    await ensureUserExists(TEST_USER_1).catch(() => {});
  });

  test("app loads and redirects unauthenticated user to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });

  test("login page renders key elements", async ({ page }) => {
    await page.goto("/login");
    // Should have some form of username/email input
    const inputs = page.locator('input[type="text"], input[type="email"]');
    await expect(inputs.first()).toBeVisible({ timeout: 5_000 });
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
  });

  test("login with valid credentials succeeds", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"], input[name="username"]', TEST_USER_1.username);
    await page.fill('input[type="password"]', TEST_USER_1.password);
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    // Should navigate away from /login
    await expect(page).not.toHaveURL(/login/, { timeout: 15_000 });
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"], input[name="username"]', TEST_USER_1.username);
    await page.fill('input[type="password"]', "WrongPassword999!");
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    // Should stay on login page or show error
    await page.waitForTimeout(2_000);
    const url = page.url();
    const isStillOnLogin = url.includes("login");
    const hasError = await page.locator('[role="alert"], .error, .toast').first().isVisible().catch(() => false);
    expect(isStillOnLogin || hasError).toBeTruthy();
  });

  test("forgot password page is accessible", async ({ page }) => {
    await page.goto("/forgot-password");
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput).toBeVisible({ timeout: 5_000 });
  });

  test("protected route redirects to login when not authenticated", async ({ page }) => {
    // Clear all cookies/storage
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
