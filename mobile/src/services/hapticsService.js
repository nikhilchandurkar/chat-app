import { Vibration, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Haptic Feedback Service
 * Provides subtle tactile responses for message events while respecting user preferences.
 */

const HAPTICS_KEY = "chat_haptics_enabled";

export const isHapticsEnabled = async () => {
  try {
    const val = await AsyncStorage.getItem(HAPTICS_KEY);
    return val !== "false";
  } catch {
    return true;
  }
};

export const setHapticsEnabled = async (enabled) => {
  try {
    await AsyncStorage.setItem(HAPTICS_KEY, enabled.toString());
  } catch {}
};

export const triggerHaptic = async (type = "light") => {
  const enabled = await isHapticsEnabled();
  if (!enabled) return;

  if (Platform.OS === "android") {
    switch (type) {
      case "send":
        Vibration.vibrate(25);
        break;
      case "receive":
        Vibration.vibrate([0, 40, 60, 40]);
        break;
      case "reaction":
        Vibration.vibrate(15);
        break;
      case "copy":
        Vibration.vibrate(30);
        break;
      case "record_start":
        Vibration.vibrate(40);
        break;
      case "record_stop":
        Vibration.vibrate(20);
        break;
      case "error":
        Vibration.vibrate([0, 50, 50, 50]);
        break;
      default:
        Vibration.vibrate(20);
    }
  }
};

