import path from 'node:path';
import process from 'node:process';
import { startVitest } from 'vitest/node';

const [, , modeArg = 'run', ...restArgs] = process.argv;
const watch = modeArg === 'watch';
const coverageEnabled = restArgs.includes('--coverage');

const ctx = await startVitest(
  'test',
  [],
  {
    config: false,
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/playwright/**', 'node_modules/**'],
    testTimeout: 10_000,
    watch,
    run: !watch,
    coverage: {
      enabled: coverageEnabled,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
  },
  {
    resolve: {
      alias: {
        '@': path.resolve(process.cwd()),
      },
    },
  },
);

if (!watch) {
  process.exitCode = ctx?.state.getCountOfFailedTests() ? 1 : 0;
  await ctx?.close();
}
