import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The browser only talks to this dev server; /api and /health are proxied to
// the local backend, so no CORS headers are needed on the backend.
const BACKEND = "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": BACKEND,
      "/health": BACKEND,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
