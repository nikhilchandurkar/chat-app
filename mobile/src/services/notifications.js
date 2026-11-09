import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerDevicePushToken } from "../api/auth";
import { STORAGE_KEYS } from "../config";

// Configure default notification handler for foreground display
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const setupNotificationChannels = async () => {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("chat_messages", {
      name: "Chat Messages",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#236B4A",
      sound: "default",
      showBadge: true,
    });
  }
};

export const registerForNativeFCM = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    // Set up Android notification channel
    await setupNotificationChannels();

    // CRITICAL: Obtain native FCM token via getDevicePushTokenAsync (NOT Expo push token)
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    const nativeFcmToken = devicePushToken.data;

    let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = `android-${Date.now()}`;
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    }

    // Register with Django backend
    if (nativeFcmToken) {
      await registerDevicePushToken(nativeFcmToken, deviceId);
    }

    return nativeFcmToken;
  } catch (error) {
    console.warn("Native FCM registration notice:", error?.message);
    return null;
  }
};

