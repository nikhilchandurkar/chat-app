import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl, STORAGE_KEYS } from "../config";

const api = axios.create({
  baseURL: `${getApiBaseUrl()}/api/v1`,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

const getOrCreateDeviceId = async () => {
  let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = `android-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
};

const persistAuthSession = async (data, deviceId) => {
  const accessToken = data.token || data.tokens?.access;
  const refreshToken = data.refreshToken || data.tokens?.refresh;
  if (accessToken) {
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, accessToken);
  }
  if (refreshToken) {
    await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  }
  if (data.user) {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
  }
  if (deviceId) {
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
};

// Inject active baseURL and Authorization Bearer token on every request
api.interceptors.request.use(async (config) => {
  config.baseURL = `${getApiBaseUrl()}/api/v1`;
  const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Transparent JWT access-token refresh on 401 responses
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const reqUrl = originalRequest?.url || "";
    const isAuthRoute =
      reqUrl.includes("/auth/login") ||
      reqUrl.includes("/auth/refresh") ||
      reqUrl.includes("/auth/register") ||
      reqUrl.includes("/auth/otp");

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            const storedRefresh = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
            if (!storedRefresh) throw new Error("No refresh token");
            const res = await axios.post(`${getApiBaseUrl()}/api/v1/auth/refresh`, {
              refreshToken: storedRefresh,
            });
            await persistAuthSession(res.data);
            return res.data.token || res.data.tokens?.access;
          })().finally(() => {
            refreshPromise = null;
          });
        }
        const newToken = await refreshPromise;
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
        await AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      }
    }
    return Promise.reject(error);
  }
);

export const checkServerReady = async (baseUrl = getApiBaseUrl()) => {
  const res = await axios.get(`${baseUrl.replace(/\/+$/, "")}/api/v1/ready`, { timeout: 6000 });
  return res.data;
};

export const loginWithPassword = async (username, password, deviceId = null) => {
  const activeDeviceId = deviceId || (await getOrCreateDeviceId());
  const response = await api.post("/auth/login", {
    username: username.trim(),
    password,
    device_id: activeDeviceId,
    platform: "android",
    app_version: "1.0.0",
  });
  await persistAuthSession(response.data, activeDeviceId);
  return response.data;
};

export const registerRequest = async (username, email, password, confirmPassword, name = "") => {
  const response = await api.post("/auth/register/request", {
    username: username.trim(),
    email: email.toLowerCase().trim(),
    password,
    confirm_password: confirmPassword,
    name: name.trim() || username.trim(),
  });
  return response.data;
};

export const registerVerify = async (username, email, password, otp, name = "", deviceId = null) => {
  const activeDeviceId = deviceId || (await getOrCreateDeviceId());
  const response = await api.post("/auth/register/verify", {
    username: username.trim(),
    email: email.toLowerCase().trim(),
    password,
    otp: otp.trim(),
    name: name.trim() || username.trim(),
    device_id: activeDeviceId,
    platform: "android",
    app_version: "1.0.0",
  });
  await persistAuthSession(response.data, activeDeviceId);
  return response.data;
};

export const requestOtp = async (email) => {
  const response = await api.post("/auth/otp/request", { email: email.toLowerCase().trim() });
  return response.data;
};

export const verifyOtp = async (email, otp, deviceId = null) => {
  const activeDeviceId = deviceId || (await getOrCreateDeviceId());
  const response = await api.post("/auth/otp/verify", {
    email: email.toLowerCase().trim(),
    otp: otp.trim(),
    device_id: activeDeviceId,
    platform: "android",
    app_version: "1.0.0",
  });
  await persistAuthSession(response.data, activeDeviceId);
  return response.data;
};

export const forgotPassword = async (email) => {
  const response = await api.post("/auth/forgot-password/request", { email: email.toLowerCase().trim() });
  return response.data;
};

export const resetPasswordWithOtp = async (email, otp, newPassword, deviceId = null) => {
  const activeDeviceId = deviceId || (await getOrCreateDeviceId());
  const response = await api.post("/auth/forgot-password/reset", {
    email: email.toLowerCase().trim(),
    otp: otp.trim(),
    new_password: newPassword,
    device_id: activeDeviceId,
    device_name: "ChitChat Android Mobile",
    platform: "android",
    app_version: "1.0.0",
  });
  if (!response.data?.mfaRequired) {
    await persistAuthSession(response.data, activeDeviceId);
  }
  return response.data;
};

export const socialLogin = async (provider, tokenOrCode, deviceId = null) => {
  const activeDeviceId = deviceId || (await getOrCreateDeviceId());
  const endpoint = `/auth/oauth/${provider.toLowerCase()}`;
  const payload = { device_id: activeDeviceId, platform: "android", app_version: "1.0.0" };

  if (provider.toLowerCase() === "google") {
    payload.id_token = tokenOrCode;
  } else if (provider.toLowerCase() === "github") {
    payload.code = tokenOrCode;
  } else if (provider.toLowerCase() === "facebook") {
    payload.access_token = tokenOrCode;
  }

  const response = await api.post(endpoint, payload);
  await persistAuthSession(response.data, activeDeviceId);
  return response.data;
};

export const registerDevicePushToken = async (nativeFcmToken, deviceId = null) => {
  const activeDeviceId = deviceId || (await getOrCreateDeviceId());
  const response = await api.post("/auth/devices/register", {
    device_id: activeDeviceId,
    platform: "android",
    native_fcm_token: nativeFcmToken,
    app_version: "1.0.0",
  });
  return response.data;
};

export const getProfile = async () => {
  const response = await api.get("/user/me");
  if (response.data?.user) {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(response.data.user));
  }
  return response.data;
};

export const updateProfile = async (payload) => {
  const response = await api.put("/user/profile", payload);
  if (response.data?.user) {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(response.data.user));
  }
  return response.data;
};

export const changePassword = async (currentPassword, newPassword) => {
  const response = await api.put("/user/password", { currentPassword, newPassword });
  return response.data;
};

export const getSessions = async () => {
  const response = await api.get("/auth/sessions");
  return response.data;
};

export const revokeSession = async (sessionId) => {
  const response = await api.delete(`/auth/sessions/${sessionId}`);
  return response.data;
};

export const logout = async () => {
  try {
    await api.post("/auth/logout");
  } catch (e) {}
  await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.USER);
};

export default api;
