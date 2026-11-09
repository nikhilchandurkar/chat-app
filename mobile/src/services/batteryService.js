import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Battery Intelligence & Resource Awareness Service
 * Adapts nonessential background activity and recommends optimizations based on device state.
 */

const BATTERY_SAVER_KEY = "chat_battery_saver_active";
const DATA_SAVER_KEY = "chat_data_saver_mode";

export const getBatterySaverMode = async () => {
  try {
    const val = await AsyncStorage.getItem(BATTERY_SAVER_KEY);
    return val === "true";
  } catch {
    return false;
  }
};

export const setBatterySaverMode = async (enabled) => {
  try {
    await AsyncStorage.setItem(BATTERY_SAVER_KEY, enabled.toString());
  } catch {}
};

export const getDataSaverMode = async () => {
  try {
    const val = await AsyncStorage.getItem(DATA_SAVER_KEY);
    return val || "auto"; // "auto" | "wifi_only" | "saver"
  } catch {
    return "auto";
  }
};

export const setDataSaverMode = async (mode) => {
  try {
    await AsyncStorage.setItem(DATA_SAVER_KEY, mode);
  } catch {}
};

/**
 * Returns operational policy recommendations according to battery level
 */
export const evaluateBatteryPolicy = (batteryPercentage, isCharging, isSaverActive) => {
  if (isCharging) {
    return {
      mode: "charging",
      label: "Charging",
      allowHighQualityMedia: true,
      allowAutoDownloads: true,
      enableAnimations: true,
    };
  }

  if (isSaverActive || batteryPercentage < 15) {
    return {
      mode: "eco",
      label: "Low Power Mode",
      allowHighQualityMedia: false,
      allowAutoDownloads: false,
      enableAnimations: false,
      recommendation: "Battery is low. Low power mode is reducing background tasks and animations.",
    };
  }

  if (batteryPercentage < 40) {
    return {
      mode: "moderate",
      label: "Moderate Power",
      allowHighQualityMedia: false,
      allowAutoDownloads: true,
      enableAnimations: true,
    };
  }

  return {
    mode: "normal",
    label: "Normal Operation",
    allowHighQualityMedia: true,
    allowAutoDownloads: true,
    enableAnimations: true,
  };
};

