const rawEnv =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_SERVER || import.meta.env.VITE_API_BASE_URL
    : "";

const devFallback =
  typeof window !== "undefined" && window.location.port === "5173"
    ? "http://localhost:8000"
    : "";

export const server = (rawEnv || devFallback || "").replace(/\/$/, "");
