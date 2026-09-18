import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Polling: inotify events are unreliable on this WSL/UNC share - a missed
  // change event leaves Vite serving a stale transform indefinitely (issue 32).
  server: {
    port: 5199,
    strictPort: true,
    watch: { usePolling: true, interval: 500 },
  },
});