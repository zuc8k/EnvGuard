import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'fixtures', '**/*.d.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    reporters: ['default'],
  },
});