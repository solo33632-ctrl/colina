import { defineConfig } from 'vitest/config';

// Minimal config: `@/` alias (mirrors tsconfig paths) and node
// environment. Test files live next to the code they cover.
export default defineConfig({
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
