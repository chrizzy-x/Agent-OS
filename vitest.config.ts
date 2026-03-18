import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
    testTimeout: 10_000,
  },
});
