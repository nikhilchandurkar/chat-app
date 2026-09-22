import { Platform } from "react-native";

// Development & Production Server Configuration
const DEV_HOST = Platform.OS === "android" ? "10.0.2.2" : "localhost";

export const API_BASE_URL = __DEV__
  ? `http://${DEV_HOST}:3000`
  : "https://nikhil-chats.chickenkiller.com";

export const WS_BASE_URL = __DEV__
  ? `ws://${DEV_HOST}:3000/ws/`
  : "wss://nikhil-chats.chickenkiller.com/ws/";

export const STORAGE_KEYS = {
  TOKEN: "@chatapp_jwt_token",
  USER: "@chatapp_user_profile",
};

