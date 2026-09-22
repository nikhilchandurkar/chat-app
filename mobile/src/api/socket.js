import AsyncStorage from "@react-native-async-storage/async-storage";
import { WS_BASE_URL, STORAGE_KEYS } from "../config";

class ChatSocketManager {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      return;
    }

    const wsUrl = `${WS_BASE_URL}?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      console.log("[Mobile WS] Connected to Daphne ASGI server");
      this._emit("connection_status", { status: "connected" });
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const eventName = payload.event || payload.type;
        const eventData = payload.data !== undefined ? payload.data : payload;

        if (eventName) {
          this._emit(eventName, eventData);
        }
      } catch (err) {
        console.error("[Mobile WS] Failed to parse message:", err);
      }
    };

    this.ws.onerror = (error) => {
      console.warn("[Mobile WS] Socket error:", error.message);
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      console.log("[Mobile WS] Disconnected. Code:", event.code);
      this._emit("connection_status", { status: "disconnected" });

      // Exponential backoff reconnect
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, 3000);
    };
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  send(event, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    } else {
      console.warn("[Mobile WS] Cannot send event, socket not connected:", event);
    }
  }

  sendMessage(chatId, message, members = [], replyTo = null) {
    this.send("NEW_MESSAGE", { chatId, message, members, replyTo });
  }

  startTyping(chatId, members = []) {
    this.send("START_TYPING", { chatId, members });
  }

  stopTyping(chatId, members = []) {
    this.send("STOP_TYPING", { chatId, members });
  }

  markRead(chatId, messageIds = [], members = []) {
    this.send("MESSAGE_READ", { chatId, messageIds, members });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  _emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[Mobile WS] Error in listener for ${event}:`, e);
        }
      });
    }
  }
}

export const chatSocket = new ChatSocketManager();

