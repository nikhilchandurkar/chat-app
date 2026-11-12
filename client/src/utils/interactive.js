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

  const inMatch = body.match(/^in\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b\s*(.*)$/i);
  if (inMatch) {
    const qty = Number(inMatch[1]);
    const unit = inMatch[2].toLowerCase().startsWith("h") ? 3600000 : 60000;
    targetDate = new Date(Date.now() + qty * unit);
    body = inMatch[3] || "Reminder";
  } else {
    const atMatch = body.match(/^at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b\s*(.*)$/i);
    if (atMatch) {
      let hr = Number(atMatch[1]);
      const min = Number(atMatch[2] || 0);
      const meridiem = (atMatch[3] || "").toLowerCase();
      if (meridiem === "pm" && hr < 12) hr += 12;
      if (meridiem === "am" && hr === 12) hr = 0;
      const d = new Date();
      d.setHours(hr, min, 0, 0);
      if (d.getTime() <= Date.now()) {
        d.setDate(d.getDate() + 1);
      }
      targetDate = d;
      body = atMatch[4] || "Reminder";
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

