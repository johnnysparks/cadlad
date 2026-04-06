import { defineConfig } from "vite";
import { resolve } from "path";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  base: "./",
  root: "apps/studio-web",
  publicDir: "../../public",
  build: {
    outDir: "../../dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "apps/studio-web/index.html"),
        gallery: resolve(__dirname, "apps/studio-web/gallery/index.html"),
        viewer: resolve(__dirname, "apps/studio-web/viewer.html"),
      },
    },
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["manifold-3d"],
  },
});
