import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Mirrors apps/console/vite.config.ts — same stack (react + tailwind v4 vite plugin).
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
