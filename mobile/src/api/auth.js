/**
 * Auth API + Secure Token Storage
 *
 * Uses expo-secure-store (hardware-backed keystore on Android / iOS Keychain)
 * instead of AsyncStorage for the JWT token. AsyncStorage is unencrypted.
 *
 * Falls back to AsyncStorage when SecureStore is unavailable (e.g. web/emulator
 * without Play Services) so development always works.
 */

import axios from "axios";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, STORAGE_KEYS, CONFIG } from "../config";

// ── Secure storage helpers ────────────────────────────────────────────────────

async function secureSet(key, value) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Fallback for emulators / web
    await AsyncStorage.setItem(key, value);
  }
}

async function secureGet(key) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

async function secureRemove(key) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    await AsyncStorage.removeItem(key);
  }
}

// ── Axios instance ────────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: CONFIG.API_TIMEOUT,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT Bearer token to every request
apiClient.interceptors.request.use(async (config) => {
  const token = await secureGet(STORAGE_KEYS.TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global error interceptor: 401 → clear token so app redirects to login
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await secureRemove(STORAGE_KEYS.TOKEN);
      await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    }
    return Promise.reject(error);
  }
);

// ── Token helpers (exported for socket.js) ────────────────────────────────────

export const getStoredToken = () => secureGet(STORAGE_KEYS.TOKEN);

// ── Auth methods ──────────────────────────────────────────────────────────────

export async function loginWithPassword(username, password) {
  const response = await apiClient.post("/user/login", { username, password });
  const { token, user } = response.data;
  if (token) {
    await secureSet(STORAGE_KEYS.TOKEN, token);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }
  return response.data;
}

export async function requestOtp(email) {
  const response = await apiClient.post("/auth/request-otp", { email });
  return response.data;
}

export async function verifyOtp(email, otp) {
  const response = await apiClient.post("/auth/verify-otp", { email, otp });
  const { token, user } = response.data;
  if (token) {
    await secureSet(STORAGE_KEYS.TOKEN, token);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }
  return response.data;
}

export async function logout() {
  try {
    await apiClient.post("/user/logout");
  } catch {
    // Ignore network errors on logout
  }
  await secureRemove(STORAGE_KEYS.TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.USER);
}

export async function getProfile() {
  const response = await apiClient.get("/user/me");
  return response.data;
}

export async function getStoredUser() {
  try {
    const str = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    return str ? JSON.parse(str) : null;
  } catch {
    return null;
  }
}
