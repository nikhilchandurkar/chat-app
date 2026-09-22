# ChatApp - React Native Mobile Client

Cross-platform mobile application built with **React Native** and **Expo**, designed to work seamlessly with the **Django Daphne ASGI** backend.

---

## 🚀 Features

- **Dual Authentication**: Sign in with **Username/Password** or passwordless **6-digit OTP**.
- **Bearer Token Auth**: Uses `Authorization: Bearer <jwt>` with secure `AsyncStorage` token caching.
- **Real-time WebSockets**: Direct WebSocket connection to Daphne ASGI server (`ws://` / `wss://`).
- **Live Typing Indicators**: Real-time typing bubble display.
- **Online Presence**: Shows real-time online/offline status for direct chat partners.
- **Cross-Platform**: Supports iOS, Android, and Web.

---

## 🛠️ Quick Start

### 1. Install Dependencies
```bash
cd mobile
npm install
```

### 2. Configure Backend URL
In `src/config.js`:
- For **Android Emulator**: `http://10.0.2.2:3000` (maps to host localhost)
- For **iOS Simulator**: `http://localhost:3000`
- For **Physical Device**: Set your machine's local IP address (e.g. `http://192.168.1.50:3000`) or production domain `https://nikhil-chats.chickenkiller.com`

### 3. Start the Development Server
```bash
npm start
```

- Press `a` to open in Android Emulator
- Press `i` to open in iOS Simulator
- Scan the QR code with **Expo Go** on your physical phone (iOS / Android)

