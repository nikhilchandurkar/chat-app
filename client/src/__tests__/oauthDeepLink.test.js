import { describe, it, expect } from "vitest";
import {
  isAndroidOAuthState,
  buildAndroidOAuthDeepLink,
  getPendingBrowserAndroidOAuthUrl,
  parseIncomingOAuthAppUrl,
} from "../utils/oauthDeepLink";

describe("Android OAuth deep link helpers", () => {
  it("detects Android-originated OAuth states only", () => {
    expect(isAndroidOAuthState("google_android")).toBe(true);
    expect(isAndroidOAuthState("github_android")).toBe(true);
    expect(isAndroidOAuthState("google")).toBe(false);
    expect(isAndroidOAuthState("github")).toBe(false);
    expect(isAndroidOAuthState("")).toBe(false);
  });

  it("builds custom-scheme callback URL preserving query parameters", () => {
    expect(buildAndroidOAuthDeepLink("?code=abc123&state=google_android")).toBe(
      "com.nikhil.chatapp://oauth/callback?code=abc123&state=google_android"
    );
  });

  it("returns deep link only for external browser on /login with Android state and code/error", () => {
    expect(
      getPendingBrowserAndroidOAuthUrl("/login", "?code=xyz&state=google_android", false)
    ).toBe("com.nikhil.chatapp://oauth/callback?code=xyz&state=google_android");

    expect(
      getPendingBrowserAndroidOAuthUrl("/login", "?error=access_denied&state=github_android", false)
    ).toBe("com.nikhil.chatapp://oauth/callback?error=access_denied&state=github_android");

    // Normal web browser login should stay on web
    expect(getPendingBrowserAndroidOAuthUrl("/login", "?code=xyz&state=google", false)).toBeNull();
    // Native Capacitor WebView handles the exchange directly instead of bouncing
    expect(
      getPendingBrowserAndroidOAuthUrl("/login", "?code=xyz&state=google_android", true)
    ).toBeNull();
    // Ignore non-login routes
    expect(
      getPendingBrowserAndroidOAuthUrl("/", "?code=xyz&state=google_android", false)
    ).toBeNull();
  });

  it("parses incoming custom-scheme OAuth URL into in-app /login route", () => {
    expect(
      parseIncomingOAuthAppUrl("com.nikhil.chatapp://oauth/callback?code=abc&state=google_android")
    ).toBe("/login?code=abc&state=google_android");

    expect(
      parseIncomingOAuthAppUrl("com.nikhil.chatapp://oauth/callback?error=access_denied&state=github_android")
    ).toBe("/login?error=access_denied&state=github_android");

    expect(parseIncomingOAuthAppUrl("https://evil.example/login?code=abc")).toBeNull();
    expect(parseIncomingOAuthAppUrl("com.nikhil.chatapp://oauth/callback?state=google_android")).toBeNull();
  });
});

