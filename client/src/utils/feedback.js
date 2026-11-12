/**
 * Shared UI/UX interaction preferences, haptic feedback, Web Audio sound effects, and celebration triggers.
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

export function isSoundEffectsEnabled() {
  return readBoolPref("chat_sound_effects", true);
}

export function setSoundEffectsPreference(enabled) {
  try {
    localStorage.setItem("chat_sound_effects", enabled ? "true" : "false");
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    // ignore storage restriction
  }
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

let sharedAudioCtx = null;
function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playCelebrationSound(mode = "burst") {
  if (!isSoundEffectsEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes =
      mode === "confetti" || mode === "fireworks"
        ? [523.25, 659.25, 783.99, 1046.5]
        : mode === "hearts"
        ? [440, 554.37, 659.25]
        : [587.33, 880];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = mode === "hearts" ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.065 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.3);
    });
  } catch {
    // ignore Web Audio restrictions
  }
}

export function playWalkieChirp(isStart = true) {
  if (!isSoundEffectsEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = isStart ? [880, 1175] : [988, 660];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + idx * 0.055);
      gain.gain.setValueAtTime(0.07, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.055 + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.08);
    });
  } catch {
    // ignore
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

export function extractCelebrationTrigger(text) {
  const raw = (text || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const explicitEmoji = extractBurstEmoji(raw);

  if (/^\/(confetti|party)\b/.test(lower) || /\bhappy birthday\b|\bhbd\b|\bcongrats\b|\bcongratulations\b/.test(lower)) {
    return { emoji: explicitEmoji || "🎉", mode: "confetti" };
  }
  if (/^\/fireworks?\b/.test(lower) || /\bgg\b|\bcheers\b|\bwoohoo\b/.test(lower)) {
    return { emoji: explicitEmoji || "🎆", mode: "fireworks" };
  }
  if (/^\/hearts?\b/.test(lower) || /\bi love you\b|\blove ya\b/.test(lower)) {
    return { emoji: explicitEmoji || "❤️", mode: "hearts" };
  }

  if (explicitEmoji) {
    const mode =
      explicitEmoji === "❤️" || explicitEmoji === "😍" || explicitEmoji === "💜"
        ? "hearts"
        : explicitEmoji === "🎉" || explicitEmoji === "🥳"
        ? "confetti"
        : "burst";
    return { emoji: explicitEmoji, mode };
  }
  return null;
}
