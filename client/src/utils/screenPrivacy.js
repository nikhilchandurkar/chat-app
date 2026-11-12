import { registerPlugin } from "@capacitor/core";
import { isCapacitorNative } from "./device";
import { isScreenshotBlockEnabled } from "./feedback";

const ScreenPrivacyNative = registerPlugin("ScreenPrivacy");

let protectedSurfaceCount = 0;

/**
 * Syncs Android FLAG_SECURE & web CSS print-block class based on user preference or sensitive surface count.
 */
export async function syncScreenPrivacy() {
  const shouldProtect = protectedSurfaceCount > 0 || isScreenshotBlockEnabled();

  if (typeof document !== "undefined" && document.body) {
    document.body.classList.toggle("chitchat-screen-protected", shouldProtect);
  }

  if (isCapacitorNative()) {
    try {
      await ScreenPrivacyNative.setEnabled({ enabled: shouldProtect });
    } catch {
      // Ignore if older APK binary lacks native ScreenPrivacy plugin
    }
  }
  return shouldProtect;
}

/** Temporarily elevates FLAG_SECURE while sensitive screens (Profile, Contact Info, 2FA) are open. */
export function retainProtectedSurface() {
  protectedSurfaceCount += 1;
  syncScreenPrivacy();
  return () => {
    protectedSurfaceCount = Math.max(0, protectedSurfaceCount - 1);
    syncScreenPrivacy();
  };
}

