/**
 * Shared UI/UX interaction preferences, haptic feedback helpers, and celebration triggers.
 */

export const PREFS_EVENT = "chitchat:preferences-changed";

export const CELEBRATION_EMOJIS = new Set([
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🔥",
  "🎉",
  "🥳",
  "🚀",
  "👏",
  "😍",
  "🤩",
  "💯",
  "✨",
  "👍",
]);

function readBoolPref(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    return val !== "false";
  } catch {
    return fallback;
  }
}

export function isHapticsEnabled() {
  return readBoolPref("chat_haptics", true);
}

export function isEffectsEnabled() {
  return readBoolPref("chat_message_effects", true) && !readBoolPref("chat_reduced_motion", false);
}

export function isEnterToSendEnabled() {
  return readBoolPref("chat_enter_to_send", true);
}

export function setEnterToSendPreference(enabled) {
  try {
    localStorage.setItem("chat_enter_to_send", enabled ? "true" : "false");
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    // ignore storage restriction
  }
}

export function isShakeEnabled() {
  return readBoolPref("chat_shake_enabled", true);
}

export function isScreenshotBlockEnabled() {
  return readBoolPref("chat_block_screenshots", true);
}

export function setScreenshotBlockPreference(enabled) {
  try {
    localStorage.setItem("chat_block_screenshots", enabled ? "true" : "false");
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    // ignore storage restriction
  }
}

export function isPrivacyBlurEnabled() {
  return readBoolPref("chat_privacy_blur_switch", true);
}

export function setPrivacyBlurPreference(enabled) {
  try {
    localStorage.setItem("chat_privacy_blur_switch", enabled ? "true" : "false");
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    // ignore storage restriction
  }
}

export function getShakeAction() {
  try {
    return localStorage.getItem("chat_shake_action") || "wave";
  } catch {
    return "wave";
  }
}

export function getChatFontSize() {
  try {
    const num = Number(localStorage.getItem("chat_font_size"));
    return Number.isFinite(num) && num >= 12 && num <= 20 ? num : 14.5;
  } catch {
    return 14.5;
  }
}

export function emitPreferencesChanged() {
  try {
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    // ignore
  }
}

export function triggerHaptic(pattern = 15) {
  if (!isHapticsEnabled()) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore unsupported device/browser
  }
}

export function extractBurstEmoji(text) {
  const trimmed = (text || "").trim();
  if (!trimmed || trimmed.length > 24) return null;
  for (const em of CELEBRATION_EMOJIS) {
    if (trimmed.includes(em)) return em;
  }
  return null;
}
