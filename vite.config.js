import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/lemma-api": {
        target: "https://api.lemma.work",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/lemma-api/, ""),
      },
      "/lemma-auth-health": {
        target: "https://auth.lemma.work",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/lemma-auth-health/, ""),
      },
    },
  },
});
