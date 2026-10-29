import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Single source of truth for the `@/` alias: tsconfig.json `paths`.
    tsconfigPaths: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        'src/sim/**': { lines: 90 },
        'src/save/**': { lines: 90 },
      },
    },
  },
});
