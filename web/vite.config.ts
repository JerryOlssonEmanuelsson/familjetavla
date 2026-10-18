import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" so the app also works under Home Assistant ingress (/api/hassio_ingress/<token>/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8099" } },
  build: { outDir: "dist", emptyOutDir: true },
});
