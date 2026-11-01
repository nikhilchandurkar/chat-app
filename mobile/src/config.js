import { Platform } from "react-native";

/**
 * Server configuration.
 *
 * Priority order:
 *  1. EAS build-time env var  APP_API_URL  (set in eas.json or EAS secrets)
 *  2. __DEV__ auto-detect     (local development)
 *  3. Production fallback     (your live domain)
 *
 * ─── Local Testing Guide ──────────────────────────────────────────────────────
 *
 * Android Emulator:
 *   The emulator maps 10.0.2.2 → your PC's localhost.
 *   Django must be running on port 8000 on your PC.
 *   API_BASE_URL = "http://10.0.2.2:8000"
 *
 * Physical Android Device (same Wi-Fi):
 *   Find your PC's LAN IP:  Windows → ipconfig → IPv4 Address
 *                           e.g. 192.168.1.100
 *   Set PHYSICAL_DEVICE_IP below to that IP.
 *   Make sure Django's ALLOWED_HOSTS includes that IP or "*".
 *   API_BASE_URL = "http://192.168.1.100:8000"
 *
 * Physical Device via Expo Tunnel (easiest, no IP needed):
 *   Run: npm run start:tunnel
 *   Scan the QR code in Expo Go.
 *   The tunnel proxies all traffic so no IP config needed.
 *
 * Production:
 *   APP_API_URL = "https://nikhil-chats.chickenkiller.com"
 */

// ── Change this to your LAN IP when testing on a physical device ──────────────
const PHYSICAL_DEVICE_IP = "192.168.1.100";

function resolveApiUrl() {
  // EAS build-time override takes highest priority
  if (process.env.APP_API_URL) {
    return process.env.APP_API_URL;
  }

  if (__DEV__) {
    // Android emulator → 10.0.2.2 maps to host localhost
    // iOS simulator   → localhost works directly
    // Physical device → use your LAN IP
    if (Platform.OS === "android") {
      // Detect emulator vs physical: emulator model contains "sdk_gphone" or "generic"
      // Simpler approach: just use the emulator address by default in dev.
      // For physical device testing, set PHYSICAL_DEVICE_IP above and uncomment:
      // return `http://${PHYSICAL_DEVICE_IP}:8000`;
      return "http://10.0.2.2:8000";
    }
    return "http://localhost:8000";
  }

  return "https://nikhil-chats.chickenkiller.com";
}

export const API_BASE_URL = resolveApiUrl();

export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws") + "/ws";

export const STORAGE_KEYS = {
  TOKEN: "@chatapp_jwt_token",
  USER:  "@chatapp_user_profile",
};

export const CONFIG = {
  // Request timeout in ms
  API_TIMEOUT: 12000,
  // WebSocket reconnect delay (ms) — exponential backoff base
  WS_RECONNECT_BASE_MS: 2000,
  WS_RECONNECT_MAX_MS: 30000,
  WS_MAX_RECONNECT_ATTEMPTS: 10,
  // Pagination
  MESSAGES_PAGE_SIZE: 20,
};
