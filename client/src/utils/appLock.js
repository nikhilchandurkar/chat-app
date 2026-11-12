import { registerPlugin } from "@capacitor/core";
import { isCapacitorNative } from "./device";

const NativeAppLock = registerPlugin("AppLock");

const APP_LOCK_ENABLED_KEY = "chitchat_applock_enabled";
const APP_LOCK_BIOMETRIC_KEY = "chitchat_applock_biometric";
const APP_LOCK_PIN_HASH_KEY = "chitchat_applock_pin_hash";
export const APP_LOCK_EVENT = "chitchat:applock-changed";

function hashPinSyncFallback(pin) {
  // Deterministic salted SHA-like lightweight digest for fallback environments without SubtleCrypto
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const salted = `chitchat-pin-salt:${pin}`;
  for (let i = 0; i < salted.length; i++) {
    const ch = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b) >>> 0;
  }
  return `fb:${h1.toString(16)}:${h2.toString(16)}`;
}

export async function hashPin(pin) {
  const clean = String(pin || "").trim();
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (c?.subtle) {
    const buf = await c.subtle.digest("SHA-256", new TextEncoder().encode(`chitchat-pin-salt:${clean}`));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return hashPinSyncFallback(clean);
}

export function isAppLockEnabled() {
  try {
    return localStorage.getItem(APP_LOCK_ENABLED_KEY) === "true" && Boolean(localStorage.getItem(APP_LOCK_PIN_HASH_KEY));
  } catch {
    return false;
  }
}

export function isBiometricUnlockEnabled() {
  try {
    return localStorage.getItem(APP_LOCK_BIOMETRIC_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setBiometricUnlockPreference(enabled) {
  try {
    localStorage.setItem(APP_LOCK_BIOMETRIC_KEY, String(Boolean(enabled)));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(APP_LOCK_EVENT));
  } catch {
    // ignore
  }
}

export async function enableAppLockWithPin(pin) {
  const clean = String(pin || "").trim();
  if (!/^\d{4,6}$/.test(clean)) {
    throw new Error("PIN must be 4 to 6 digits.");
  }
  const hashed = await hashPin(clean);
  localStorage.setItem(APP_LOCK_PIN_HASH_KEY, hashed);
  localStorage.setItem(APP_LOCK_ENABLED_KEY, "true");
  if (typeof window !== "undefined") window.dispatchEvent(new Event(APP_LOCK_EVENT));
}

export function disableAppLock() {
  try {
    localStorage.setItem(APP_LOCK_ENABLED_KEY, "false");
    localStorage.removeItem(APP_LOCK_PIN_HASH_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(APP_LOCK_EVENT));
  } catch {
    // ignore
  }
}

export async function verifyAppLockPin(pin) {
  const stored = localStorage.getItem(APP_LOCK_PIN_HASH_KEY) || "";
  if (!stored) return true;
  const candidate = await hashPin(pin);
  return candidate === stored;
}

export async function canUseNativeBiometricUnlock() {
  if (!isCapacitorNative()) return false;
  try {
    const res = await NativeAppLock.isDeviceSecure();
    return Boolean(res?.secure);
  } catch {
    return false;
  }
}

export async function triggerNativeBiometricUnlock() {
  if (!isCapacitorNative()) return false;
  try {
    const res = await NativeAppLock.authenticate({
      title: "Unlock ChitChat",
      subtitle: "Verify your fingerprint, face, or device PIN",
    });
    return Boolean(res?.unlocked);
  } catch {
    return false;
  }
}

