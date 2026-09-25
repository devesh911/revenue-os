import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fixed ports, never "next free": auth redirects, the worker's CORS allowlist and VITE_API_URL
  // all name these origins.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
