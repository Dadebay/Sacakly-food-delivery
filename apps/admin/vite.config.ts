import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
  build: {
    outDir: "dist/client",
    rollupOptions: {
      output: {
        // Turkmen Telecom's HTTP filter resets requests whose URL contains
        // the literal word "runtime". Keep production chunk paths opaque so
        // React's jsx-runtime chunk remains reachable before HTTPS is ready.
        chunkFileNames: "assets/chunk-[hash].js",
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  server: {
    watch: {
      ...(isCodexSeatbeltSandbox
        ? { useFsEvents: false, usePolling: true }
        : {}),
    },
  },
  plugins: [react()],
});
