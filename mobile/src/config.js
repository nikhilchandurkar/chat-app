import { Platform } from "react-native";

// In production, update this to your purchased domain or EC2 Elastic IP
const DEV_HOST = Platform.OS === "android" ? "10.0.2.2" : "localhost";

export const API_BASE_URL = __DEV__
  ? `http://${DEV_HOST}:8000`
  : "https://nikhil-chats.chickenkiller.com";

export const WS_BASE_URL = __DEV__
  ? `ws://${DEV_HOST}:8000/ws/chat/`
  : "wss://nikhil-chats.chickenkiller.com/ws/chat/";

export const STORAGE_KEYS = {
  TOKEN: "@chatapp_jwt_token",
  REFRESH_TOKEN: "@chatapp_refresh_token",
  USER: "@chatapp_user_profile",
  DEVICE_ID: "@chatapp_device_id",
  SYNC_CURSOR: "@chatapp_sync_cursor",
};
