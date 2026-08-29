import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'render',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
});
