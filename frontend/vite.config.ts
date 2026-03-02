import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      assets: path.resolve(__dirname, "src/assets"),
      vision: path.resolve(__dirname, "src/vision"),
      theme: path.resolve(__dirname, "src/vision/theme"),
      components: path.resolve(__dirname, "src/components"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
