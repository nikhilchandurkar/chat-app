import { createContext, useMemo, useContext, useEffect, useRef, useState } from "react";
import { server } from "./constants/config";

const dummySocket = {
  on: () => {},
  off: () => {},
  emit: () => {},
  close: () => {},
  readyState: 3, // CLOSED
};

const SocketContext = createContext(dummySocket);

const getSocket = () => {
  const socket = useContext(SocketContext);
  return socket || dummySocket;
};

class NativeChatWebSocket {
  constructor(url) {
    this.baseUrl = url;
    this.ws = null;
    this.handlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.pingInterval = null;
    this.isClosedManually = false;
    this.connect();
  }

  getWsUrl() {
    let base = this.baseUrl;
    if (!base) {
      if (typeof window !== "undefined" && window.location.port === "5173") {
        base = "ws://localhost:8000";
      } else if (typeof window !== "undefined") {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        base = `${proto}//${window.location.host}`;
      } else {
        base = "ws://localhost:8000";
      }
    } else if (base.startsWith("http://")) {
      base = "ws://" + base.slice(7);
    } else if (base.startsWith("https://")) {
      base = "wss://" + base.slice(8);
    } else if (!base.startsWith("ws://") && !base.startsWith("wss://")) {
      base = "ws://" + base;
    }
    base = base.replace(/\/+$/, "");

    // Attach token if present in localStorage or cookies
    let token = "";
    try {
      token = localStorage.getItem("chitChat-Token") || localStorage.getItem("access_token") || "";
    } catch (e) {}

    const wsUrl = `${base}/ws/chat/${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    return wsUrl;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    let token = "";
    try {
      token = localStorage.getItem("chitChat-Token") || localStorage.getItem("access_token") || "";
    } catch (e) {}

    if (!token) {
      // Don't connect without an authenticated token to avoid 403 handshakes
      return;
    }

    try {
      const url = this.getWsUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
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
        } catch (e) {
          // Non-JSON packet
        }
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.dispatch("disconnect", { code: event.code, reason: event.reason });
        // Don't retry if unauthenticated / forbidden
        if (!this.isClosedManually && event.code !== 4001 && event.code !== 1008 && event.code !== 403) {
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
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    setTimeout(() => {
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
    const payload = JSON.stringify({
      event: event,
      data: data,
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      // Reconnect and send after short delay if currently disconnected
      this.connect();
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(payload);
        }
      }, 500);
    }
  }

  dispatch(event, data) {
    const listeners = this.handlers.get(event);
    if (listeners) {
      listeners.forEach((handler) => {
        try {
          handler(data);
        } catch (e) {
          console.error(`Error in WebSocket handler for ${event}:`, e);
        }
      });
    }
  }

  close() {
    this.isClosedManually = true;
    this.stopHeartbeat();
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => {
          try { socket.close(); } catch (_) {}
        };
        socket.onerror = () => {};
      }
    }
  }
}

const SocketProvider = ({ children, user }) => {
  const [activeSocket, setActiveSocket] = useState(null);

  useEffect(() => {
    let wsInstance = null;
    // Only connect when an authenticated user session is active
    if (user) {
      wsInstance = new NativeChatWebSocket(server);
      setActiveSocket(wsInstance);
    } else {
      setActiveSocket(null);
    }

    return () => {
      if (wsInstance) {
        wsInstance.close();
      }
    };
  }, [user]);

  const socketValue = useMemo(() => activeSocket || dummySocket, [activeSocket]);

  return (
    <SocketContext.Provider value={socketValue}>
      {children}
    </SocketContext.Provider>
  );
};

export { SocketProvider, getSocket };
