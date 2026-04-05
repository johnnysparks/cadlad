import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    exclude: ['apps/worker/**', 'apps/mcp-gateway/**', 'node_modules/**', 'dist/**'],
    include: ['apps/**/*.{test,spec}.ts', 'packages/**/*.{test,spec}.ts', '**/__tests__/**/*.ts'],
  },
});
