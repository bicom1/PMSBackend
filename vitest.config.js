import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setupEnv.js'],
    fileParallelism: false,
    maxWorkers: 1,
    isolate: false,
    hookTimeout: 180000,
    testTimeout: 40000,
    globalSetupTimeout: 300000,
  },
});
