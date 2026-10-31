/**
 * Native WebSocket provider for Django Channels.
 *
 * Replaces the old socket.io-client dependency.
 * Provides the same event-based interface that the rest of the app uses,
 * using the raw WebSocket API (built into every browser) so socket.io is
 * no longer a dependency.
 *
 * Protocol format (matches ChatConsumer on the backend):
 *   Send:    { event: string; data: unknown }
 *   Receive: { event: string; data: unknown }
 */

import React, { createContext, useContext, useEffect, useRef, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Listener = (data: unknown) => void;

export interface ChatSocket {
  /** Subscribe to a server-sent event. Returns an unsubscribe function. */
  on: (event: string, listener: Listener) => () => void;
  /** Emit an event to the server. */
  emit: (event: string, data?: unknown) => void;
  /** Remove all listeners for an event. */
  off: (event: string, listener?: Listener) => void;
  /** True when the WebSocket connection is open. */
  readonly connected: boolean;
}

// ── Internal implementation ───────────────────────────────────────────────────

class NativeChatSocket implements ChatSocket {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnects = 10;
  private url: string;

  constructor(url: string) {
    this.url = url;
    this._connect();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener?: Listener): void {
    if (!listener) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(listener);
    }
  }

  emit(event: string, data: unknown = {}): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    } else {
      console.warn("[WS] Cannot emit – socket not connected:", event);
    }
  }

  destroy(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, "client destroyed");
    this.ws = null;
    this.listeners.clear();
  }

  private _connect(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this._dispatch("connect", {});
    };

    this.ws.onclose = (e) => {
      this._dispatch("disconnect", { code: e.code, reason: e.reason });
      if (e.code !== 1000) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this._dispatch("connect_error", {});
    };

    this.ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as { event: string; data: unknown };
        if (payload.event) {
          this._dispatch(payload.event, payload.data);
        }
      } catch {
        console.warn("[WS] Received non-JSON message:", e.data);
      }
    };
  }

  private _dispatch(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(data);
      } catch (err) {
        console.error(`[WS] Listener error for event "${event}":`, err);
      }
    });
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnects) {
      console.error("[WS] Max reconnect attempts reached.");
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const SocketContext = createContext<ChatSocket | null>(null);

/** Build the WebSocket URL from the server base URL (env var). */
function buildWsUrl(): string {
  const server = import.meta.env.VITE_SERVER ?? "http://localhost:8000";
  // Replace http(s):// with ws(s)://
  const wsBase = server.replace(/^http/, "ws");
  return `${wsBase}/ws`;
}

interface SocketProviderProps {
  children: React.ReactNode;
  /** JWT access token – required for authentication. */
  token?: string;
}

export function SocketProvider({ children, token }: SocketProviderProps) {
  const socketRef = useRef<NativeChatSocket | null>(null);

  const url = useMemo(() => {
    const base = buildWsUrl();
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }, [token]);

  useEffect(() => {
    // Destroy previous connection when token or url changes
    socketRef.current?.destroy();
    socketRef.current = new NativeChatSocket(url);

    return () => {
      socketRef.current?.destroy();
      socketRef.current = null;
    };
  }, [url]);

  // Provide a stable reference object that delegates to the underlying socket
  const socketProxy = useMemo((): ChatSocket => ({
    on: (event, listener) => socketRef.current?.on(event, listener) ?? (() => {}),
    emit: (event, data) => socketRef.current?.emit(event, data),
    off: (event, listener) => socketRef.current?.off(event, listener),
    get connected() {
      return socketRef.current?.connected ?? false;
    },
  }), []);

  return React.createElement(SocketContext.Provider, { value: socketProxy }, children);
}

/** Hook to access the WebSocket instance. */
export function getSocket(): ChatSocket {
  const socket = useContext(SocketContext);
  if (!socket) {
    throw new Error("getSocket() must be used within a <SocketProvider>");
  }
  return socket;
}
