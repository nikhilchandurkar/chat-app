import { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL || "https://chat-nikkiii.duckdns.org";

const config: CapacitorConfig = {
  // Must match the applicationId in android/app/build.gradle
  appId: "com.nikhil.chatapp",
  appName: "ChitChat",
  webDir: "dist",
  server: {
    // Points to live HTTPS server (or override via CAPACITOR_SERVER_URL for local emulator/LAN testing)
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: "#236B4A",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#236B4A",
      showSpinner: true,
      spinnerColor: "#FFFFFF",
    },
  },
};

export default config;

