/**
 * Pure client-side helpers for Unread Recap, Smart Replies, and Custom Chat Folders.
 */

const FOLDER_EVENT = "chitchat:folders-updated";

export function getSmartReplySuggestions(lastMessage, myUserId) {
  if (!lastMessage || lastMessage.isDeleted) return [];
  const senderId = String(lastMessage.sender?._id || lastMessage.sender?.id || "");
  if (senderId && myUserId && senderId === String(myUserId)) return [];

  const text = String(lastMessage.content || "").trim();
  if (!text || text.startsWith("::e2ee:v1::")) return [];
  const lower = text.toLowerCase();

  if (/\b(happy birthday|hbd|congrats|congratulations|cheers)\b/i.test(lower)) {
    return ["Thank you! 🎉", "Appreciate it! 🙌", "Let's celebrate! 🥳"];
  }
  if (/\b(where are you|eta|on your way|coming|reach)\b/i.test(lower) || lower.includes("📍")) {
    return ["On my way!", "5 mins away", "Just reached 👍"];
  }
  if (/\b(meeting|call|schedule|tomorrow|today|time|when)\b/i.test(lower) && text.includes("?")) {
    return ["Works for me 👍", "Let's check", "Can we do later?"];
  }
  if (text.includes("?")) {
    if (/\b(how|what|why|who|where)\b/i.test(lower)) {
      return ["Let me check", "One sec!", "Will update soon"];
    }
    return ["Yes 👍", "Not sure yet", "Sounds good!"];
  }
  if (/\b(thanks|thank you|thx|ty)\b/i.test(lower)) {
    return ["You're welcome! 😊", "Anytime 👍", "No problem!"];
  }
  if (/\b(hi|hello|hey|morning|evening)\b/i.test(lower)) {
    return ["Hey! 👋", "How's it going?", "Hi there!"];
  }
  if (lastMessage.attachments?.length) {
    return ["Looks great! 🔥", "Got it, thanks 👍", "Checking this now"];
  }
  return ["Sounds good!", "Got it 👍", "Nice!"];
}

export function buildUnreadRecap(messages = [], unreadCount = 0, currentUserId = "", currentUsername = "") {
  const sliceCount = Math.min(60, Math.max(Number(unreadCount || 0), 12));
  const recent = (messages || []).slice(-sliceCount).filter((m) => m && !m.isDeleted);
  if (!recent.length) {
    return null;
  }

  const questions = [];
  const mentions = [];
  const links = [];
  const highlights = [];
  const senderCounts = new Map();

  const uname = String(currentUsername || "").trim().toLowerCase();
  const urlRe = /https?:\/\/[^\s<]+/gi;

  for (const m of recent) {
    const senderName = m.sender?.name || m.sender?.username || "Member";
    const senderId = String(m.sender?._id || m.sender?.id || "");
    if (!currentUserId || senderId !== String(currentUserId)) {
      senderCounts.set(senderName, (senderCounts.get(senderName) || 0) + 1);
    }

    const text = String(m.content || "").trim();
    if (!text || text.startsWith("::e2ee:v1::")) continue;

    if (text.includes("?") && (!currentUserId || senderId !== String(currentUserId))) {
      questions.push({ _id: m._id, senderName, text: text.slice(0, 120) });
    }

    const lower = text.toLowerCase();
    if (
      lower.includes("@all") ||
      lower.includes("@everyone") ||
      (uname && lower.includes(`@${uname}`))
    ) {
      mentions.push({ _id: m._id, senderName, text: text.slice(0, 120) });
    }

    const foundUrls = text.match(urlRe);
    if (foundUrls) {
      for (const u of foundUrls) {
        if (links.length < 6) links.push({ _id: m._id, senderName, url: u });
      }
    }

    const firstAtt = Array.isArray(m.attachments) ? m.attachments[0] : null;
    if (firstAtt && typeof firstAtt === "object") {
      if (firstAtt.type === "poll") highlights.push(`📊 Poll: ${firstAtt.question}`);
      else if (firstAtt.type === "widget" && firstAtt.widgetType === "checklist") {
        highlights.push(`☑️ Checklist: ${firstAtt.title}`);
      } else if (firstAtt.type === "widget" && firstAtt.widgetType === "roulette") {
        highlights.push(`🎡 Wheel: ${firstAtt.title}`);
      } else if (firstAtt.type === "game") {
        highlights.push(`🎮 Game: ${firstAtt.gameType}`);
      }
    }
  }

  const topSenders = Array.from(senderCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  return {
    scannedCount: recent.length,
    questions: questions.slice(-5),
    mentions: mentions.slice(-5),
    links: links.slice(0, 5),
    highlights: [...new Set(highlights)].slice(0, 5),
    topSenders,
  };
}

function folderStorageKey(userId) {
  return `chitchat_chat_folders_${userId || "default"}`;
}

export function getChatFolders(userId) {
  try {
    const raw = localStorage.getItem(folderStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChatFolders(userId, folders) {
  try {
    localStorage.setItem(folderStorageKey(userId), JSON.stringify(folders));
    window.dispatchEvent(new Event(FOLDER_EVENT));
  } catch {
    // ignore quota errors
  }
}

export function createChatFolder(userId, name) {
  const clean = String(name || "").trim().slice(0, 24);
  if (!clean) return getChatFolders(userId);
  const existing = getChatFolders(userId);
  if (existing.some((f) => f.name.toLowerCase() === clean.toLowerCase())) return existing;
  const next = [...existing, { id: `fld_${Date.now()}`, name: clean, chatIds: [] }];
  saveChatFolders(userId, next);
  return next;
}

export function deleteChatFolder(userId, folderId) {
  const next = getChatFolders(userId).filter((f) => f.id !== folderId);
  saveChatFolders(userId, next);
  return next;
}

export function toggleChatInFolder(userId, folderId, chatId) {
  const sid = String(chatId);
  const next = getChatFolders(userId).map((f) => {
    if (f.id !== folderId) return f;
    const ids = Array.isArray(f.chatIds) ? f.chatIds.map(String) : [];
    const has = ids.includes(sid);
    return {
      ...f,
      chatIds: has ? ids.filter((x) => x !== sid) : [...ids, sid],
    };
  });
  saveChatFolders(userId, next);
  return next;
}

export const CHAT_FOLDER_EVENT = FOLDER_EVENT;

