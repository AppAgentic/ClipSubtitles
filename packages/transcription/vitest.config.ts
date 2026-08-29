import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'transcription',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
