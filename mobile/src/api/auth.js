import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, STORAGE_KEYS } from "../config";

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor to inject Authorization Bearer token from AsyncStorage
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const loginWithPassword = async (username, password, deviceId = "android-device") => {
  const response = await api.post("/auth/login", {
    username: username.trim(),
    password,
    device_id: deviceId,
    platform: "android",
    app_version: "1.0.0",
  });
  const { data } = response;
  if (data.token) {
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
  }
  if (data.refreshToken) {
    await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
  }
  if (data.user) {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
  }
  return data;
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

export const registerVerify = async (username, email, password, otp, name = "", deviceId = "android-device") => {
  const response = await api.post("/auth/register/verify", {
    username: username.trim(),
    email: email.toLowerCase().trim(),
    password,
    otp: otp.trim(),
    name: name.trim() || username.trim(),
    device_id: deviceId,
    platform: "android",
    app_version: "1.0.0",
  });
  const { data } = response;
  if (data.token) {
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
  }
  if (data.refreshToken) {
    await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
  }
  if (data.user) {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
  }
  return data;
};

export const requestOtp = async (email) => {
  const response = await api.post("/auth/otp/request", { email: email.toLowerCase().trim() });
  return response.data;
};

export const verifyOtp = async (email, otp, deviceId = "android-device") => {
  const response = await api.post("/auth/otp/verify", {
    email: email.toLowerCase().trim(),
    otp: otp.trim(),
    device_id: deviceId,
    platform: "android",
    app_version: "1.0.0",
  });

  const { data } = response;
  if (data.token) {
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
  }
  if (data.refreshToken) {
    await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
  }
  if (data.user) {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
  }
  if (deviceId) {
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return data;
};

export const socialLogin = async (provider, tokenOrCode, deviceId = "android-device") => {
  let endpoint = `/auth/oauth/${provider.toLowerCase()}`;
  let payload = { device_id: deviceId, platform: "android", app_version: "1.0.0" };

  if (provider.toLowerCase() === "google") {
    payload.id_token = tokenOrCode;
  } else if (provider.toLowerCase() === "github") {
    payload.code = tokenOrCode;
  } else if (provider.toLowerCase() === "facebook") {
    payload.access_token = tokenOrCode;
  }

  const response = await api.post(endpoint, payload);
  const { data } = response;
  if (data.token) {
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
  }
  if (data.user) {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
  }
  return data;
};

export const registerDevicePushToken = async (nativeFcmToken, deviceId = "android-device") => {
  const response = await api.post("/auth/devices/register", {
    device_id: deviceId,
    platform: "android",
    native_fcm_token: nativeFcmToken,
    app_version: "1.0.0",
  });
  return response.data;
};

export const getProfile = async () => {
  const response = await api.get("/user/me");
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
