import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'render-remotion',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
