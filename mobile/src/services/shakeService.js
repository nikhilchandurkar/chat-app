import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Shake Gesture Service for Android & React Native
 * Supports: Shake to Undo, Quick Actions, Shake to Refresh, Report Problem
 * Uses motion threshold and cooldown to prevent accidental triggers in pockets or while stationary.
 */

const SHAKE_CONFIG_KEY = "chat_shake_config";

const DEFAULT_CONFIG = {
  enabled: false,
  action: "undo", // "undo" | "quick_actions" | "refresh" | "report"
  threshold: 1.8,
  cooldownMs: 1500,
  undoWindowSeconds: 10,
};

let lastShakeTime = 0;
let isListening = false;
let subscription = null;

export const getShakeConfig = async () => {
  try {
    const raw = await AsyncStorage.getItem(SHAKE_CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
};

export const saveShakeConfig = async (newConfig) => {
  try {
    await AsyncStorage.setItem(SHAKE_CONFIG_KEY, JSON.stringify(newConfig));
  } catch {}
};

/**
 * Evaluates 3-axis accelerometer readings against motion threshold
 */
export const handleAccelerometerData = (data, config, onShakeTriggered) => {
  if (!config.enabled) return;

  const { x, y, z } = data;
  const acceleration = Math.sqrt(x * x + y * y + z * z);
  const now = Date.now();

  if (acceleration > config.threshold) {
    if (now - lastShakeTime > config.cooldownMs) {
      lastShakeTime = now;
      if (onShakeTriggered) {
        onShakeTriggered(config.action);
      }
    }
  }
};

