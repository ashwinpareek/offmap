import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built site works from any path.
// `--mode single` inlines the fonts, for hosts that only serve a page's own scripts and styles.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react()],
  build: mode === "single" ? { outDir: "dist-single", assetsInlineLimit: 400_000 } : {},
  server: { proxy: { "/api": "http://localhost:8787" } },
}));
