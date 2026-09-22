import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, STORAGE_KEYS } from "../config";

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach Authorization Bearer token to all outgoing requests
apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Authentication Methods
export const loginWithPassword = async (username, password) => {
  const response = await apiClient.post("/user/login", { username, password });
  if (response.data?.token) {
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, response.data.token);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(response.data.user));
  }
  return response.data;
};

export const requestOtp = async (email) => {
  const response = await apiClient.post("/auth/request-otp", { email });
  return response.data;
};

export const verifyOtp = async (email, otp) => {
  const response = await apiClient.post("/auth/verify-otp", { email, otp });
  if (response.data?.token) {
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, response.data.token);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(response.data.user));
  }
  return response.data;
};

export const logout = async () => {
  try {
    await apiClient.post("/user/logout");
  } catch (e) {
    // Ignore network error on logout
  }
  await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.USER);
};

export const getProfile = async () => {
  const response = await apiClient.get("/user/me");
  return response.data;
};

