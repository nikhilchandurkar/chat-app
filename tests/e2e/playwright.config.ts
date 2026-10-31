import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright end-to-end test configuration.
 *
 * Tests assume both the Django backend (port 8000) and
 * the Vite frontend dev server (port 5173) are running.
 *
 * Run with:
 *   npx playwright test
 * Or from project root:
 *   npm run test:e2e  (inside /client)
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";

export default defineConfig({
  testDir: "./",
  fullyParallel: false, // Sequential – tests share state (same DB)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start backend and frontend before running tests
  // webServer is optional – comment out if you start servers manually
  // webServer: [
  //   {
  //     command: "cd ../../django_server && python manage.py runserver",
  //     port: 8000,
  //     reuseExistingServer: true,
  //   },
  //   {
  //     command: "cd ../../client && npm run dev",
  //     port: 5173,
  //     reuseExistingServer: true,
  //   },
  // ],
});
