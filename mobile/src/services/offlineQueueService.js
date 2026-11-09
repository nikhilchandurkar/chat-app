import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendMessage as apiSendMessage } from "../api/chat";

/**
 * Offline Message Queue & Sync Engine
 * Manages reliable offline persistence, unique client IDs, and automatic synchronization.
 */

const OFFLINE_QUEUE_KEY = "chat_mobile_offline_queue";

export const MESSAGE_STATES = {
  PENDING: "pending",
  SENDING: "sending",
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
};

export const getOfflineQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const enqueueMessage = async ({ chatId, content, attachments = [] }) => {
  const clientMessageId = `c-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const messageObj = {
    id: clientMessageId,
    clientMessageId,
    chatId,
    content,
    attachments,
    state: MESSAGE_STATES.PENDING,
    timestamp: new Date().toISOString(),
    retryCount: 0,
  };

  try {
    const queue = await getOfflineQueue();
    queue.push(messageObj);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {}

  return messageObj;
};

export const syncOfflineQueue = async (onProgress) => {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { syncedCount: 0, failedCount: 0 };

  const remaining = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const item of queue) {
    try {
      if (onProgress) onProgress(item.id, MESSAGE_STATES.SENDING);
      await apiSendMessage(item.chatId, item.content, item.attachments);
      syncedCount++;
      if (onProgress) onProgress(item.id, MESSAGE_STATES.SENT);
    } catch (err) {
      item.retryCount = (item.retryCount || 0) + 1;
      item.state = MESSAGE_STATES.FAILED;
      remaining.push(item);
      failedCount++;
      if (onProgress) onProgress(item.id, MESSAGE_STATES.FAILED);
    }
  }

  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return { syncedCount, failedCount };
};

export const clearOfflineQueue = async () => {
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {}
};

