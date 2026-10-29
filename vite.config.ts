import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Single source of truth for the `@/` alias: tsconfig.json `paths`.
    tsconfigPaths: true,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      reporter: ['text', 'html'],
      thresholds: {
        'src/sim/**': { lines: 90 },
        'src/save/**': { lines: 90 },
      },
    },
  },
});
