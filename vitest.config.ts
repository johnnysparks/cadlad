import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['apps/worker/**', 'apps/mcp-gateway/**', 'node_modules/**', 'dist/**'],
    include: ['apps/**/*.{test,spec}.ts', 'packages/**/*.{test,spec}.ts', '**/__tests__/**/*.ts'],
  },
});
