import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server binds 0.0.0.0 and accepts the sandbox preview host.
// When wrapped by Tauri 2, `devUrl` in src-tauri/tauri.conf.json points at port 5173.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
});
