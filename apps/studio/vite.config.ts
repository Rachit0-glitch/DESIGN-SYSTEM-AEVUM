import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "node:crypto": fileURLToPath(new URL("./src/browser-crypto.ts", import.meta.url)),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: "dist/web",
    sourcemap: true,
    target: "es2022",
  },
  server: { port: 4173, strictPort: false },
});
