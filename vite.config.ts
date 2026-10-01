import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        background: "src/background/serviceWorker.ts",
        engineHost: "engine-host.html",
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});
