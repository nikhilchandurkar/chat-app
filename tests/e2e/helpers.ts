/**
 * Shared helpers for Playwright e2e tests.
 */

import { Page, expect } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";

// ── Test users (created via API before tests run) ─────────────────────────────

export const TEST_USER_1 = {
  name: "E2E Alice",
  username: "e2e_alice",
  email: "e2e_alice@example.com",
  password: "E2ePass123!",
};

export const TEST_USER_2 = {
  name: "E2E Bob",
  username: "e2e_bob",
  email: "e2e_bob@example.com",
  password: "E2ePass456!",
};

/** Register a user via API (idempotent – ignores duplicate errors). */
export async function ensureUserExists(user: typeof TEST_USER_1) {
  const resp = await fetch(`${API_URL}/api/v1/auth/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  const data = await resp.json().catch(() => ({}));
  return data;
}

/** Log in via the UI and wait for the chat list to appear. */
export async function loginUI(page: Page, user: typeof TEST_USER_1) {
  await page.goto("/login");
  await page.fill('[placeholder*="username" i], [name="username"], [type="text"]', user.username);
  await page.fill('[placeholder*="password" i], [name="password"], [type="password"]', user.password);
  await page.click('[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
  // Wait for redirect to dashboard
  await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 15_000 });
}

/** Get a JWT token directly from the API. */
export async function getToken(user: typeof TEST_USER_1): Promise<string> {
  const resp = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: user.username,
      password: user.password,
    }),
  });
  const data = await resp.json();
  return data.token ?? "";
}

/** Create a direct chat between two users via API. Returns chat id. */
export async function createDirectChat(token1: string, token2: string): Promise<string> {
  // Get user2's id
  const meResp = await fetch(`${API_URL}/api/v1/user/me`, {
    headers: { Authorization: `Bearer ${token2}` },
  });
  const me = await meResp.json();
  const user2Id = me.user._id;

  // user1 sends friend request to user2
  await fetch(`${API_URL}/api/v1/user/send-request`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token1}`,
    },
    body: JSON.stringify({ userId: user2Id }),
  });

  // Get user1 id to find the request
  const me1Resp = await fetch(`${API_URL}/api/v1/user/me`, {
    headers: { Authorization: `Bearer ${token1}` },
  });
  const me1 = await me1Resp.json();

  // user2 accepts
  const notifResp = await fetch(`${API_URL}/api/v1/user/notifications`, {
    headers: { Authorization: `Bearer ${token2}` },
  });
  const notif = await notifResp.json();
  const req = notif.allRequests?.find(
    (r: { sender: { _id: string }; _id: string }) => r.sender._id === me1.user._id
  );
  if (!req) return "";

  const acceptResp = await fetch(`${API_URL}/api/v1/user/accept-request`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token2}`,
    },
    body: JSON.stringify({ requestId: req._id, accept: true }),
  });
  const accepted = await acceptResp.json();
  return accepted.senderId ?? "";
}
