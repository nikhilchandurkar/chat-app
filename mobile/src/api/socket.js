import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWsBaseUrl, STORAGE_KEYS } from "../config";

class MobileChatSocket {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.pingInterval = null;
    this.reconnectTimer = null;
    this.isConnected = false;
    this.isClosedManually = false;
  }

  async connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      return;
    }

    this.isClosedManually = false;
    const baseUrl = getWsBaseUrl();
    const url = `${baseUrl}?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.dispatch("connect", {});
      };

      this.ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          const eventName = packet.event || packet.type;
          const legacyName = packet.legacy_event;
          const payload = packet.data !== undefined ? packet.data : packet;

          if (eventName) {
            this.dispatch(eventName, payload);
          }
          if (legacyName && legacyName !== eventName) {
            this.dispatch(legacyName, payload);
          }
        } catch (e) {}
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.stopHeartbeat();
        this.dispatch("disconnect", { code: event?.code, reason: event?.reason });
        if (
          !this.isClosedManually &&
          event?.code !== 4001 &&
          event?.code !== 1008 &&
          event?.code !== 403
        ) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        this.dispatch("error", err);
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.isClosedManually || this.reconnectAttempts >= this.maxReconnectAttempts) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
  }

  off(event, handler) {
    if (this.handlers.has(event)) {
      this.handlers.get(event).delete(handler);
    }
  }

  emit(event, data) {
    const payload = JSON.stringify({ event, data });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.connect().then(() => {
        setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(payload);
          }
        }, 500);
      });
    }
  }

  dispatch(event, data) {
    const listeners = this.handlers.get(event);
    if (listeners) {
      listeners.forEach((handler) => {
        try {
          handler(data);
        } catch (e) {
          console.warn("Mobile socket listener error:", e);
        }
      });
    }
  }

  disconnect() {
    this.isClosedManually = true;
    this.isConnected = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}

export const socket = new MobileChatSocket();
export default socket;
