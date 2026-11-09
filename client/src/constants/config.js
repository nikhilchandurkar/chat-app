const rawEnv =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_SERVER || import.meta.env.VITE_API_BASE_URL
    : "";

// Only use dev fallback if actually running locally in Vite dev server (port 5173)
const isLocalDev =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
  window.location.port === "5173";

const devFallback = isLocalDev ? "http://localhost:8000" : "";

// In production on your domain, never use localhost — use same-origin relative paths ("")
const isProdDomain =
  typeof window !== "undefined" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1";

const activeServer =
  isProdDomain && (rawEnv || "").includes("localhost")
    ? ""
    : rawEnv || devFallback || "";

export const server = activeServer.replace(/\/$/, "");
