import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Must match the applicationId in android/app/build.gradle
  appId: "com.nikhil.chatapp",
  appName: "Nikhil Chat",
  // Point to your production server — Capacitor bundles the web assets
  // but API calls go to this URL (hardcoded for Android release build)
  webDir: "dist",
  server: {
    // Set to your real server URL so the APK talks to the live backend
    url: "http://16.113.127.132",
    cleartext: true, // allow HTTP (no SSL) — remove once you add HTTPS
  },
  android: {
    allowMixedContent: true, // allow HTTP API calls from HTTPS webview
    captureInput: true,
    webContentsDebuggingEnabled: false, // set true for debug builds
    backgroundColor: "#1a1a2e",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1a1a2e",
      showSpinner: true,
      spinnerColor: "#e94560",
    },
  },
};

export default config;

