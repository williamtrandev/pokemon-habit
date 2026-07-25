import { defineConfig } from 'vitest/config';

// Pure-logic units only (no React Native). Component/E2E covered by Maestro.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // RN entry + native modules must never be pulled into the node run.
    exclude: ['node_modules', 'ios', 'android', '.maestro'],
  },
});
