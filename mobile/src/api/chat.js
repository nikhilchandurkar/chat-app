import api from "./auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../config";

export const getMyChats = async () => {
  const response = await api.get("/chat/my");
  return response.data;
};

export const getChatDetails = async (chatId) => {
  const response = await api.get(`/chat/${chatId}`);
  return response.data;
};

export const createDirectChat = async (userId) => {
  const response = await api.post("/chat/direct", { userId });
  return response.data;
};

export const createGroupChat = async (name, members, description = "") => {
  const response = await api.post("/chat/new", {
    name,
    members,
    description,
  });
  return response.data;
};

export const deleteChat = async (chatId) => {
  const response = await api.delete(`/chat/${chatId}`);
  return response.data;
};

export const leaveGroup = async (chatId) => {
  const response = await api.delete(`/chat/leave/${chatId}`);
  return response.data;
};

export const togglePinChat = async (chatId) => {
  const response = await api.post(`/chat/pin/${chatId}`);
  return response.data;
};

export const toggleMuteChat = async (chatId) => {
  const response = await api.post(`/chat/mute/${chatId}`);
  return response.data;
};

export const searchUsers = async (query) => {
  const response = await api.get(`/user/search?name=${encodeURIComponent(query)}`);
  return response.data;
};

export const sendFriendRequest = async (userId) => {
  const response = await api.put("/user/sendrequest", { userId });
  return response.data;
};

export const getNotifications = async () => {
  const response = await api.get("/user/notifications");
  return response.data;
};

export const acceptFriendRequest = async (requestId, accept = true) => {
  const response = await api.put("/user/acceptrequest", { requestId, accept });
  return response.data;
};

export const getFriends = async () => {
  const response = await api.get("/user/friends");
  return response.data;
};

export const getMessages = async (chatId, page = 1) => {
  const response = await api.get(`/message/chat/${chatId}?page=${page}`);
  return response.data;
};

export const sendMessage = async (
  chatId,
  message,
  clientMessageId = "",
  replyTo = null,
  attachments = [],
  messageType = "text"
) => {
  const response = await api.post("/message/send", {
    chatId,
    message,
    client_message_id: clientMessageId,
    reply_to: replyTo,
    attachments,
    message_type: messageType,
  });
  return response.data;
};

export const editMessage = async (messageId, content) => {
  const response = await api.patch(`/message/${messageId}`, { content });
  return response.data;
};

export const deleteMessageForEveryone = async (messageId) => {
  const response = await api.delete(`/message/delete/${messageId}`);
  return response.data;
};

export const deleteMessageForMe = async (messageId) => {
  const response = await api.post(`/message/${messageId}/delete-for-me`);
  return response.data;
};

export const reactToMessage = async (messageId, reaction) => {
  const response = await api.post(`/message/${messageId}/react`, {
    reaction,
    emoji: reaction,
  });
  return response.data;
};

export const uploadAttachment = async (fileUri, mimeType, fileName) => {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: mimeType || "application/octet-stream",
    name: fileName || "attachment",
  });

  const response = await api.post("/storage/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const syncDelta = async (cursor = "") => {
  const deviceId = (await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID)) || "android-device";
  const url = cursor
    ? `/sync/?cursor=${encodeURIComponent(cursor)}&device_id=${encodeURIComponent(deviceId)}`
    : `/sync/?device_id=${encodeURIComponent(deviceId)}`;
  const response = await api.get(url);
  return response.data;
};
