export const server =
  import.meta.env.VITE_SERVER ||
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.port === "5173"
    ? "http://localhost:8000"
    : "");
