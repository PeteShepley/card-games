import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from a path prefix on game.peteshepley.com (/gin-rummy/). The release
// workflow sets VITE_BASE_PATH; local dev stays at /.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()]
});
