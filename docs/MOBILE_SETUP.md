# Mobile Setup (Android / React Native)

The Django backend exposes the same REST API and WebSocket protocol used by the
web frontend. No backend changes are needed to add a mobile client.

## Recommended Stack

```
React Native + TypeScript + Expo
```

This reuses TypeScript knowledge and communicates with Django via the same
REST endpoints and WebSocket protocol documented in `API.md` and `WEBSOCKETS.md`.

---

## API Base URL Configuration

Never hardcode server addresses. Use environment configuration:

```typescript
// app.config.ts (Expo)
export default {
  extra: {
    apiUrl: process.env.API_URL ?? 'http://10.0.2.2:8000',
  },
};

// Usage
import Constants from 'expo-constants';
const API_URL: string = Constants.expoConfig?.extra?.apiUrl;
const WS_URL: string  = API_URL.replace(/^http/, 'ws') + '/ws';
```

---

## Connecting to the Backend

### 1. Local Computer (Web Browser)

```
VITE_SERVER=http://localhost:8000
```

Django is accessed at `localhost:8000` from a browser running on the same machine.

---

### 2. Android Emulator

The Android emulator **cannot** use `localhost` to reach the development computer.

The emulator maps `10.0.2.2` to the host machine's loopback interface.

```typescript
// Android emulator
const API_URL = 'http://10.0.2.2:8000';
const WS_URL  = 'ws://10.0.2.2:8000/ws';
```

---

### 3. Physical Android Device (Same Wi-Fi Network)

The physical device must reach the development computer's **LAN IP address**
(not `localhost` or `10.0.2.2`).

Find your LAN IP:
```bash
# Windows
ipconfig
# Look for "IPv4 Address" under your Wi-Fi adapter, e.g., 192.168.1.100

# Linux / macOS
ip addr show  # or ifconfig
```

```typescript
// Physical device on same network
const API_URL = 'http://192.168.1.100:8000';  // your machine's LAN IP
const WS_URL  = 'ws://192.168.1.100:8000/ws';
```

Django must also allow the device to connect. Set `ALLOWED_HOSTS=*` during development
or add your LAN IP explicitly.

---

### 4. Production (Remote Server)

Use HTTPS and WSS (secure WebSocket) with your domain or IP:

```typescript
const API_URL = 'https://yourdomain.com';
const WS_URL  = 'wss://yourdomain.com/ws';
```

---

## WebSocket Connection (React Native)

React Native includes a built-in `WebSocket` implementation:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

async function connectWebSocket() {
  const token = await AsyncStorage.getItem('jwt_token');
  const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token ?? '')}`);

  ws.onopen = () => {
    console.log('WS connected');
  };

  ws.onmessage = (e) => {
    const payload = JSON.parse(e.data);
    console.log('Event:', payload.event, payload.data);
  };

  ws.onerror = (e) => {
    console.error('WS error', e.message);
  };

  ws.onclose = (e) => {
    console.log('WS closed', e.code, e.reason);
    // Implement reconnect logic here
  };

  return ws;
}
```

---

## Authentication Flow (React Native)

```typescript
// 1. Login
const resp = await fetch(`${API_URL}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const { token, user } = await resp.json();

// 2. Store token
await AsyncStorage.setItem('jwt_token', token);

// 3. Subsequent requests
const meResp = await fetch(`${API_URL}/api/v1/user/me`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

---

## Minimal Feature Set for MVP

- Login / logout
- Conversation list (`GET /api/v1/chat/my`)
- Message history (`GET /api/v1/chat/:id/messages`)
- Send message (via WebSocket `NEW_MESSAGE` event)
- Real-time updates (WebSocket subscription)

---

## Environment Summary

| Environment | API_URL | Notes |
|-------------|---------|-------|
| Browser (dev) | `http://localhost:8000` | Same machine |
| Android Emulator | `http://10.0.2.2:8000` | Emulator host alias |
| Physical Device (LAN) | `http://<your-lan-ip>:8000` | Find with `ipconfig` |
| Production | `https://yourdomain.com` | HTTPS required |
