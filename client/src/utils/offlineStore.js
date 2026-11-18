import { get, set, del } from "idb-keyval";

const MESSAGES_PREFIX = "chitchat_msgs_v1:";
const CHATS_KEY = "chitchat_chats_v1";

const hasIndexedDB = () =>
  typeof window !== "undefined" &&
  typeof window.indexedDB !== "undefined" &&
  Boolean(window.indexedDB);

/**
 * Retrieves cached messages for a specific chat from IndexedDB.
 * Enables instant 0ms rendering upon opening a chat before network response.
 */
export async function getCachedMessages(chatId) {
  if (!chatId || !hasIndexedDB()) return [];
  try {
    const data = await get(`${MESSAGES_PREFIX}${chatId}`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

/**
 * Persists the latest messages for a chat into IndexedDB.
 * Limits to the most recent 150 messages per chat to keep local storage footprint lightweight.
 */
export async function saveCachedMessages(chatId, messages) {
  if (!chatId || !hasIndexedDB() || !Array.isArray(messages)) return;
  try {
    const recent = messages.slice(-150);
    await set(`${MESSAGES_PREFIX}${chatId}`, recent);
  } catch (err) {
    // Graceful fallback if storage quota exceeded or private mode
  }
}

/**
 * Stores the user's latest conversation list for offline startup.
 */
export async function saveCachedChats(chats) {
  if (!Array.isArray(chats) || !hasIndexedDB()) return;
  try {
    await set(CHATS_KEY, chats);
  } catch (err) {
    // Graceful fallback
  }
}

/**
 * Retrieves the cached conversation list from IndexedDB.
 */
export async function getCachedChats() {
  if (!hasIndexedDB()) return [];
  try {
    const data = await get(CHATS_KEY);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

/**
 * Clears local cached messages for a specific chat (e.g. after clear chat action).
 */
export async function clearCachedMessages(chatId) {
  if (!chatId || !hasIndexedDB()) return;
  try {
    await del(`${MESSAGES_PREFIX}${chatId}`);
  } catch (err) {
    // Graceful fallback
  }
}
