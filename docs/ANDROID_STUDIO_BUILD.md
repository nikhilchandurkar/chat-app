# Android Studio Build & Release Guide (APK & AAB)

## 1. Overview

The mobile client is built with **React Native** and the **Expo** workflow. It produces native Android binaries (standalone APK for direct sideloading/testing and Android App Bundle `.aab` for Google Play Console submission) without using WebViews as the primary application.

Key native capabilities include:
- **Direct Native Firebase Cloud Messaging (FCM HTTP v1)** via native service listeners.
- **Hardware-backed Keystore Storage** using `expo-secure-store` for JWT access and refresh tokens.
- **Android WorkManager & Background Sync** for reliable pending message retries.

---

## 2. Environment Prerequisites

Before building locally, verify your system has:
1. **Node.js**: 18.x or 20.x LTS.
2. **Java Development Kit (JDK)**: OpenJDK 17 (recommended: Amazon Corretto 17 or Temurin 17).
   - Set `JAVA_HOME` pointing to your JDK 17 installation.
3. **Android Studio**: Ladybug (2024.2.1) or newer.
4. **Android SDK**:
   - Android SDK Platform 34 (API Level 34 - Android 14).
   - Android SDK Build-Tools 34.0.0.
   - Android SDK Command-line Tools (latest).
   - Android NDK (version 26.1.10909125 or newer).
   - Set `ANDROID_HOME` (e.g. `C:\Users\<User>\AppData\Local\Android\Sdk` on Windows or `~/Library/Android/sdk` on macOS).

---

## 3. Configuration & Firebase Integration

### 3.1. Place `google-services.json`
1. Navigate to the **[Firebase Console](https://console.firebase.google.com/)**.
2. Select your Firebase project (or create one).
3. Add an Android app with package name: `com.chatapp.mobile`.
4. Download `google-services.json`.
5. Place the file directly in the `mobile/` directory:
   ```
   chat-app/mobile/google-services.json
   ```

### 3.2. Verify `mobile/app.json`
Ensure `app.json` references `google-services.json`:
```json
{
  "expo": {
    "name": "Secure Chat",
    "slug": "secure-chat",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "chatapp",
    "android": {
      "package": "com.chatapp.mobile",
      "googleServicesFile": "./google-services.json",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1E293B"
      },
      "permissions": [
        "RECEIVE_BOOT_COMPLETED",
        "POST_NOTIFICATIONS",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ]
    },
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/messaging",
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#6366F1"
        }
      ]
    ]
  }
}
```

---

## 4. Keystore Generation for Release Signing

Generate a release signing key using `keytool` (shipped with JDK):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore chat-app-release.keystore -alias chat-app-key -keyalg RSA -keysize 2048 -validity 10000
```

Keep your keystore file, alias, and password secure.

---

## 5. Native Prebuild & Android Studio Build

### Step 5.1: Run Expo Prebuild
Generate the native `android/` project directory:

```bash
cd mobile
npm install
npx expo prebuild --platform android --clean
```

### Step 5.2: Configure Gradle Signing Credentials
Edit `mobile/android/gradle.properties`:
```properties
RELEASE_STORE_FILE=/path/to/chat-app-release.keystore
RELEASE_STORE_PASSWORD=your_keystore_password
RELEASE_KEY_ALIAS=chat-app-key
RELEASE_KEY_PASSWORD=your_keystore_password
```

In `mobile/android/app/build.gradle`, configure `signingConfigs`:
```groovy
signingConfigs {
    release {
        storeFile file(RELEASE_STORE_FILE)
        storePassword RELEASE_STORE_PASSWORD
        keyAlias RELEASE_KEY_ALIAS
        keyPassword RELEASE_KEY_PASSWORD
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    }
}
```

### Step 5.3: Build Signed Release APK
From the `mobile/android` directory:

**Windows:**
```powershell
.\gradlew.bat assembleRelease
```

**Linux / macOS:**
```bash
./gradlew assembleRelease
```

The signed release APK will be located at:
```
mobile/android/app/build/outputs/apk/release/app-release.apk
```

### Step 5.4: Build Signed Release AAB (Google Play)

```bash
./gradlew bundleRelease
```

The signed release bundle will be located at:
```
mobile/android/app/build/outputs/bundle/release/app-release.aab
```

---

## 6. Sideloading and Verification

Install the generated APK onto an Android device via ADB:

```bash
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

Launch the app and verify:
1. Passwordless OTP login flow.
2. Keystore persistence (force-close and reopen; session should remain authenticated).
3. Receiving FCM notifications when the app is in the background or killed.
4. Sending and receiving messages and attachments over WebSocket.

