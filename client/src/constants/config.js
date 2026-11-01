export const server = (
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SERVER) ||
  ""
).replace(/\/$/, "");
