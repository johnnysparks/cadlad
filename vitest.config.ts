import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['worker/**', 'mcp/**', 'node_modules/**', 'dist/**'],
  },
});
