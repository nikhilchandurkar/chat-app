import { App as CapacitorApp } from "@capacitor/app";
import { registerPlugin } from "@capacitor/core";
import { isCapacitorNative } from "./device";

const NativeDeviceNotify = registerPlugin("DeviceNotify");

let isNativeAppActive = true;
let listenerInitialized = false;
let nativeSyncActive = false;
let currentActiveChatId = "";

export function initAppForegroundTracker() {
  if (listenerInitialized || typeof window === "undefined") return;
  listenerInitialized = true;

  if (isCapacitorNative()) {
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      isNativeAppActive = Boolean(isActive);
      updateNativeActiveState({
        inForeground: isNativeAppActive,
        activeChatId: currentActiveChatId,
      });
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

export async function configureNativePushSync({ serverUrl, token, userId }) {
  if (!isCapacitorNative() || !serverUrl || !token) return false;
  try {
    await requestDeviceNotificationPermission();
    const res = await NativeDeviceNotify.startBackgroundSync({
      serverUrl: String(serverUrl),
      token: String(token),
      userId: String(userId || ""),
    });
    nativeSyncActive = Boolean(res?.started);
    return nativeSyncActive;
  } catch {
    nativeSyncActive = false;
    return false;
  }
}

export async function stopNativePushSync() {
  nativeSyncActive = false;
  if (!isCapacitorNative()) return;
  try {
    await NativeDeviceNotify.stopBackgroundSync();
  } catch {
    // ignore
  }
}

export async function updateNativeActiveState({ inForeground, activeChatId }) {
  currentActiveChatId = activeChatId ? String(activeChatId) : "";
  if (!isCapacitorNative()) return;
  try {
    await NativeDeviceNotify.setActiveState({
      inForeground: Boolean(inForeground),
      activeChatId: currentActiveChatId,
    });
  } catch {
    // ignore
  }
}

export async function getLaunchNotificationChatId() {
  if (!isCapacitorNative()) return "";
  try {
    const res = await NativeDeviceNotify.getLaunchChatId();
    return res?.chatId ? String(res.chatId) : "";
  } catch {
    return "";
  }
}

export function addNotificationOpenListener(onOpenChat) {
  if (!isCapacitorNative() || typeof onOpenChat !== "function") {
    return () => {};
  }
  let handle = null;
  let cancelled = false;
  NativeDeviceNotify.addListener("notificationOpen", (payload) => {
    if (!cancelled && payload?.chatId) {
      onOpenChat(String(payload.chatId));
    }
  })
    .then((h) => {
      if (cancelled) h?.remove?.();
      else handle = h;
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    handle?.remove?.();
  };
}

/**
 * Posts ONE grouped OS notification per conversation when app is in background
 * (or on Android when native service isn't already handling it).
 */
export async function notifyDeviceForMessage({ chatId, title, preview, count = 1, isMuted = false }) {
  if (!chatId || isMuted) return;

  const displayTitle = count > 1 ? `${title} (${count} new messages)` : title;
  const displayBody = preview || "New message";

  try {
    if (isCapacitorNative()) {
      // Avoid duplicate notifications when ChatPushService is running natively
      if (nativeSyncActive) return;
      await NativeDeviceNotify.showMessageNotification({
        chatId: String(chatId),
        title: displayTitle,
        body: displayBody,
        count,
      });
      return;
    }

    if (!isAppInBackground()) return;
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
