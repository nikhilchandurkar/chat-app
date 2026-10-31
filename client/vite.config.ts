import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy API requests to Django during development (avoids CORS issues)
      "/api": {
        target: process.env.VITE_SERVER ?? "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
      // Proxy WebSocket to Django Channels
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
    rollupOptions: {
      output: {
        // Split large vendor bundles for better caching
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-redux": ["@reduxjs/toolkit", "react-redux"],
          "vendor-mui": ["@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"],
          "vendor-charts": ["chart.js", "react-chartjs-2"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});
