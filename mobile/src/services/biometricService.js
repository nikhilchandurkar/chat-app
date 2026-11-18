import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BIOMETRIC_LOCK_KEY = "@chatapp_biometric_lock_enabled";

/**
 * Checks if device hardware has biometric sensors and if user has registered fingerprints/face.
 */
export const checkBiometricSupport = async () => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return {
      available: hasHardware && isEnrolled,
      hasHardware,
      isEnrolled,
      isFingerprint: supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT),
      isFacial: supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION),
    };
  } catch {
    return { available: false, hasHardware: false, isEnrolled: false };
  }
};

export const isBiometricLockEnabled = async () => {
  try {
    const val = await AsyncStorage.getItem(BIOMETRIC_LOCK_KEY);
    return val === "true";
  } catch {
    return false;
  }
};

export const setBiometricLockEnabled = async (enabled) => {
  try {
    await AsyncStorage.setItem(BIOMETRIC_LOCK_KEY, enabled ? "true" : "false");
    return true;
  } catch {
    return false;
  }
};

export const promptBiometricAuth = async (promptMessage = "Scan fingerprint or face to unlock ChitChat") => {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      fallbackLabel: "Use Device PIN",
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
};
