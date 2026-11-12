/**
 * Stable per-device identity helper shared across Web and Android Capacitor builds.
 */

const STORAGE_KEY = "chitChat-device-id";

function _detectBrowserName(ua) {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  return "Browser";
}

function _detectOSName(ua) {
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Desktop";
}

export function getDeviceMetadata() {
  const isCapacitorNative = Boolean(
    typeof window !== "undefined" &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform()
  );

  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const platform = isCapacitorNative ? "android" : /Android/i.test(ua) && /wv\)/i.test(ua) ? "android" : "web";

  let deviceId = "";
  try {
    deviceId = localStorage.getItem(STORAGE_KEY) || "";
    if (!deviceId) {
      const rand =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      deviceId = `${platform}-${rand}`;
      localStorage.setItem(STORAGE_KEY, deviceId);
    }
  } catch {
    deviceId = `${platform}-fallback`;
  }

  const deviceName = isCapacitorNative
    ? "ChitChat Android App"
    : `${_detectBrowserName(ua)} on ${_detectOSName(ua)}`;

  return {
    device_id: deviceId,
    device_name: deviceName,
    platform,
    app_version: "2.0.0",
  };
}

