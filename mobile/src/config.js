import { Platform } from "react-native";

// Production backend live on EC2 via HTTPS & WSS
export const PROD_DOMAIN = "chat-nikkiii.duckdns.org";
export const PROD_API_URL = `https://${PROD_DOMAIN}`;
export const PROD_WS_URL = `wss://${PROD_DOMAIN}/ws/chat/`;

// Local dev fallback (Android emulator uses 10.0.2.2, iOS uses localhost)
const DEV_HOST = Platform.OS === "android" ? "10.0.2.2" : "localhost";

// Always use production domain so APKs, physical devices, and emulators connect reliably
export const API_BASE_URL = PROD_API_URL;
export const WS_BASE_URL = PROD_WS_URL;

export const STORAGE_KEYS = {
  TOKEN: "@chatapp_jwt_token",
  REFRESH_TOKEN: "@chatapp_refresh_token",
  USER: "@chatapp_user_profile",
  DEVICE_ID: "@chatapp_device_id",
  SYNC_CURSOR: "@chatapp_sync_cursor",
};
