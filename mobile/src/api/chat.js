import { apiClient } from "./auth";

export const getMyChats = async () => {
  const response = await apiClient.get("/chat/my");
  return response.data?.chats || [];
};

export const getChatMessages = async (chatId, page = 1) => {
  const response = await apiClient.get(`/chat/message/${chatId}?page=${page}`);
  return response.data;
};

export const sendAttachmentMessage = async (chatId, fileUri, fileName, mimeType) => {
  const formData = new FormData();
  formData.append("chatId", chatId);
  formData.append("files", {
    uri: fileUri,
    name: fileName || "upload.jpg",
    type: mimeType || "image/jpeg",
  });

  const response = await apiClient.post("/chat/message", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const reactToMessage = async (messageId, emoji) => {
  const response = await apiClient.post(`/message/react/${messageId}`, { emoji });
  return response.data;
};

