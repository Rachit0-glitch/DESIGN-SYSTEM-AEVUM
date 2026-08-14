import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "node:crypto": fileURLToPath(new URL("./src/browser-crypto.ts", import.meta.url)),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: "dist/web",
    sourcemap: mode !== "production",
    target: "es2022",
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase")) return "supabase-client";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react-runtime";
          if (id.includes("node_modules/lucide-react")) return "studio-icons";
          if (id.includes("/packages/agent-") || id.includes("/packages/mcp-protocol")) return "agent-control";
          if (id.includes("/packages/renderer-") || id.includes("/packages/scene-runtime")) return "render-runtime";
          if (
            id.includes("/packages/document-model") ||
            id.includes("/packages/command-engine") ||
            id.includes("/packages/project-store")
          )
            return "canonical-core";
        },
      },
    },
  },
  server: { port: 4173, strictPort: false },
}));
