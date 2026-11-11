import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Production backend live on EC2 via HTTPS & WSS
export const PROD_DOMAIN = "chat-nikkiii.duckdns.org";
export const PROD_API_URL = `https://${PROD_DOMAIN}`;
export const PROD_WS_URL = `wss://${PROD_DOMAIN}/ws/chat/`;

// Optional build-time override via EXPO_PUBLIC_API_URL (for local dev against PC backend)
const ENV_API_URL =
  typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL
    ? process.env.EXPO_PUBLIC_API_URL.trim().replace(/\/+$/, "")
    : "";

// Local dev fallback URL (Android emulator reaches host PC via 10.0.2.2)
export const DEV_DEFAULT_API_URL =
  Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";

export const STORAGE_KEYS = {
  TOKEN: "@chatapp_jwt_token",
  REFRESH_TOKEN: "@chatapp_refresh_token",
  USER: "@chatapp_user_profile",
  DEVICE_ID: "@chatapp_device_id",
  SYNC_CURSOR: "@chatapp_sync_cursor",
  SERVER_URL_OVERRIDE: "@chatapp_server_url_override",
};

let activeApiBaseUrl = ENV_API_URL || PROD_API_URL;

export const toWsUrl = (httpUrl) => {
  const clean = (httpUrl || PROD_API_URL).trim().replace(/\/+$/, "");
  if (clean.startsWith("https://")) return `wss://${clean.slice(8)}/ws/chat/`;
  if (clean.startsWith("http://")) return `ws://${clean.slice(7)}/ws/chat/`;
  if (clean.startsWith("ws://") || clean.startsWith("wss://")) return `${clean}/ws/chat/`;
  return `https://${clean}`.replace(/^https:\/\//, "wss://") + "/ws/chat/";
};

/**
 * Loads any saved custom server URL override from AsyncStorage (used for local dev testing).
 * Defaults strictly to PROD_API_URL so production APKs never hit localhost unless explicitly overridden.
 */
export const initServerConfig = async () => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_URL_OVERRIDE);
    if (saved && /^https?:\/\//i.test(saved.trim())) {
      activeApiBaseUrl = saved.trim().replace(/\/+$/, "");
    } else {
      activeApiBaseUrl = ENV_API_URL || PROD_API_URL;
    }
  } catch {
    activeApiBaseUrl = ENV_API_URL || PROD_API_URL;
  }
  return activeApiBaseUrl;
};

export const setCustomServerUrl = async (url) => {
  const clean = (url || "").trim().replace(/\/+$/, "");
  if (!clean) {
    await AsyncStorage.removeItem(STORAGE_KEYS.SERVER_URL_OVERRIDE);
    activeApiBaseUrl = ENV_API_URL || PROD_API_URL;
    return activeApiBaseUrl;
  }
  if (!/^https?:\/\//i.test(clean)) {
    throw new Error("Server URL must start with http:// or https://");
  }
  await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL_OVERRIDE, clean);
  activeApiBaseUrl = clean;
  return activeApiBaseUrl;
};

export const getApiBaseUrl = () => activeApiBaseUrl;
export const getWsBaseUrl = () => toWsUrl(activeApiBaseUrl);

/** Resolves relative /api/v1/media/... or /api/v1/storage/... URLs against the active backend host. */
export const resolveMediaUrl = (url = "") => {
  if (!url || typeof url !== "string") return "";
  if (/^(https?:|file:|content:|data:)/i.test(url)) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${activeApiBaseUrl}${path}`;
};

// Backward-compatible static constants
export const API_BASE_URL = PROD_API_URL;
export const WS_BASE_URL = PROD_WS_URL;
