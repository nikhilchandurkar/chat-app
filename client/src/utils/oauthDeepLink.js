import { CUSTOM_APP_SCHEME, isCapacitorNative } from "./device";

export const ANDROID_OAUTH_STATES = new Set(["google_android", "github_android"]);

/** Returns true when an OAuth state value indicates the login originated from the native Android app. */
export function isAndroidOAuthState(state) {
  return ANDROID_OAUTH_STATES.has((state || "").trim());
}

/** Builds the custom-scheme callback URI consumed by Android MainActivity / @capacitor/app. */
export function buildAndroidOAuthDeepLink(search) {
  const query = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `${CUSTOM_APP_SCHEME}://oauth/callback${query}`;
}

/**
 * When Google/GitHub redirects back to `/login?code=...&state=google_android` inside an external
 * browser (Chrome / Custom Tabs), return the custom-scheme deep link so the browser hands off to
 * the Android app instead of consuming the single-use authorization code in Chrome.
 */
export function getPendingBrowserAndroidOAuthUrl(
  pathname = typeof window !== "undefined" ? window.location.pathname : "",
  search = typeof window !== "undefined" ? window.location.search : "",
  nativePlatform = isCapacitorNative()
) {
  if (nativePlatform || pathname !== "/login" || !search) {
    return null;
  }
  const params = new URLSearchParams(search);
  const state = params.get("state") || "";
  if (!isAndroidOAuthState(state)) {
    return null;
  }
  if (!params.get("code") && !params.get("error")) {
    return null;
  }
  return buildAndroidOAuthDeepLink(search);
}

/**
 * Parses an incoming `com.nikhil.chatapp://oauth/callback?...` deep link delivered to the native app
 * and translates it to the in-app React Router `/login?...` route so Login completes the exchange.
 */
export function parseIncomingOAuthAppUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== `${CUSTOM_APP_SCHEME}:`) {
      return null;
    }
    const params = parsed.searchParams;
    if (!params.get("code") && !params.get("error")) {
      return null;
    }
    return `/login${parsed.search}`;
  } catch {
    return null;
  }
}

