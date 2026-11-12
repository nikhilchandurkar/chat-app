import { App as CapacitorApp } from "@capacitor/app";
import { registerPlugin } from "@capacitor/core";
import { isCapacitorNative } from "./device";

const NativeDeviceNotify = registerPlugin("DeviceNotify");

let isNativeAppActive = true;
let listenerInitialized = false;

export function initAppForegroundTracker() {
  if (listenerInitialized || typeof window === "undefined") return;
  listenerInitialized = true;

  if (isCapacitorNative()) {
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      isNativeAppActive = Boolean(isActive);
    }).catch(() => {});
  }
}

export function isAppInBackground() {
  if (typeof document === "undefined") return false;
  if (isCapacitorNative()) {
    return !isNativeAppActive || document.hidden;
  }
  return Boolean(document.hidden);
}

export async function requestDeviceNotificationPermission() {
  if (typeof window === "undefined") return false;
  try {
    if (isCapacitorNative()) {
      const res = await NativeDeviceNotify.requestPermission();
      return Boolean(res?.granted);
    }
    if ("Notification" in window) {
      if (Notification.permission === "granted") return true;
      if (Notification.permission !== "denied") {
        const perm = await Notification.requestPermission();
        return perm === "granted";
      }
    }
  } catch {
    // ignore permission errors
  }
  return false;
}

/**
 * Posts ONE grouped OS notification per conversation ONLY when app is in background/minimized,
 * never spamming toast banners inside the app.
 */
export async function notifyDeviceForMessage({ chatId, title, preview, count = 1, isMuted = false }) {
  if (!chatId || isMuted) return;
  if (!isAppInBackground()) return;

  const displayTitle = count > 1 ? `${title} (${count} new messages)` : title;
  const displayBody = preview || "New message";

  try {
    if (isCapacitorNative()) {
      await NativeDeviceNotify.showMessageNotification({
        chatId: String(chatId),
        title: displayTitle,
        body: displayBody,
        count,
      });
      return;
    }

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(displayTitle, {
        body: displayBody,
        tag: `chat-${chatId}`,
        renotify: count === 1,
      });
    }
  } catch {
    // ignore notification errors gracefully
  }
}

export async function clearChatDeviceNotification(chatId) {
  if (!chatId) return;
  try {
    if (isCapacitorNative()) {
      await NativeDeviceNotify.cancelChatNotification({ chatId: String(chatId) });
    }
  } catch {
    // ignore
  }
}

