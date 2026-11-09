/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_SERVER ?? "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: (process.env.VITE_SERVER ?? "http://localhost:8000").replace(/^http/, "ws"),
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    // Raise warning limit slightly — MUI is large but tree-shaken
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Fine-grained code splitting — each chunk cached independently
        manualChunks(id) {
          // Core React runtime & React internals — grouped together to prevent circular chunk dependencies
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/") ||
            id.includes("node_modules/react-is/") ||
            id.includes("node_modules/use-sync-external-store/") ||
            id.includes("node_modules/prop-types/")
          ) {
            return "vendor-react";
          }
          // Router
          if (id.includes("node_modules/react-router-dom") || id.includes("node_modules/react-router/")) {
            return "vendor-router";
          }
          // Redux
          if (id.includes("node_modules/@reduxjs") || id.includes("node_modules/react-redux") || id.includes("node_modules/redux")) {
            return "vendor-redux";
          }
          // MUI core — split icons into separate chunk (they're huge)
          if (id.includes("node_modules/@mui/icons-material")) {
            return "vendor-mui-icons";
          }
          if (id.includes("node_modules/@mui/") || id.includes("node_modules/@emotion/")) {
            return "vendor-mui";
          }
          // Charts — only loaded on Dashboard
          if (id.includes("node_modules/chart.js") || id.includes("node_modules/react-chartjs-2")) {
            return "vendor-charts";
          }
          // Emoji picker — heavy, lazy-loaded
          if (id.includes("node_modules/emoji-picker-react")) {
            return "vendor-emoji";
          }
          // Framer Motion — animations
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          // Everything else from node_modules
          if (id.includes("node_modules/")) {
            return "vendor-misc";
          }
        },
      },
    },
  },

  test: {
    globals: true,
    environment: "node",
  },
});
