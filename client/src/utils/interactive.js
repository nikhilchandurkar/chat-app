/**
 * Pure interactive feature helpers shared across UI components and unit tests.
 */

export function extractYouTubeId(input) {
  const raw = (input || "").trim();
  if (!raw) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "").slice(0, 11);
    }
    if (u.searchParams.get("v")) {
      return u.searchParams.get("v").slice(0, 11);
    }
    const parts = u.pathname.split("/").filter(Boolean);
    const embedIdx = parts.findIndex((p) => p === "embed" || p === "shorts");
    if (embedIdx >= 0 && parts[embedIdx + 1]) {
      return parts[embedIdx + 1].slice(0, 11);
    }
  } catch {
    // ignore malformed URL
  }
  return "";
}

export function parseRemindCommand(raw) {
  const trimmed = (raw || "").trim();
  if (!/^\/remind\b/i.test(trimmed)) return null;

  let body = trimmed.replace(/^\/remind\s*/i, "").replace(/^me\s+/i, "");
  let targetDate = null;

  // 1. Check for trailing "in X m/h" e.g. "call mom in 15 mins" or "deploy in 2h"
  const trailingInMatch = body.match(/^(.*?)\s+in\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|s|sec|seconds)\s*$/i);
  if (trailingInMatch) {
    const qty = Number(trailingInMatch[2]);
    const u = trailingInMatch[3].toLowerCase();
    const unit = u.startsWith("h") ? 3600000 : u.startsWith("s") ? 1000 : 60000;
    targetDate = new Date(Date.now() + Math.max(5000, qty * unit));
    body = trailingInMatch[1].replace(/^to\s+/i, "").trim() || "Reminder";
  }

  // 2. Check for leading "in X m/h" or "Xm/Xh" e.g. "in 15m call mom" or "15m call mom"
  if (!targetDate) {
    const leadingInMatch = body.match(/^(?:in\s+)?(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|s|sec|seconds)\b\s*(.*)$/i);
    if (leadingInMatch) {
      const qty = Number(leadingInMatch[1]);
      const u = leadingInMatch[2].toLowerCase();
      const unit = u.startsWith("h") ? 3600000 : u.startsWith("s") ? 1000 : 60000;
      targetDate = new Date(Date.now() + Math.max(5000, qty * unit));
      body = leadingInMatch[3].replace(/^to\s+/i, "").trim() || "Reminder";
    }
  }

  // 3. Check for "tomorrow at HH:MM am/pm"
  if (!targetDate) {
    const tomorrowMatch = body.match(/^(?:tomorrow\s+at\s+)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b\s*(.*)$/i);
    const isTomorrow = /\btomorrow\b/i.test(body);
    if (tomorrowMatch && (tomorrowMatch[3] || tomorrowMatch[2] || isTomorrow)) {
      let hr = Number(tomorrowMatch[1]);
      const min = Number(tomorrowMatch[2] || 0);
      const meridiem = (tomorrowMatch[3] || "").toLowerCase();
      if (meridiem === "pm" && hr < 12) hr += 12;
      if (meridiem === "am" && hr === 12) hr = 0;
      const d = new Date();
      d.setHours(hr, min, 0, 0);
      if (isTomorrow || d.getTime() <= Date.now()) {
        d.setDate(d.getDate() + 1);
      }
      targetDate = d;
      body = (tomorrowMatch[4] || "").replace(/\btomorrow\b/gi, "").replace(/^to\s+/i, "").trim() || "Reminder";
    }
  }

  if (!targetDate) {
    targetDate = new Date(Date.now() + 15 * 60000);
  }
  return {
    content: `⏰ Reminder: ${(body || "Check in").trim()}`,
    scheduledFor: targetDate,
  };
}

