import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["manifold-3d"],
  },
});
