import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/modules': path.resolve(__dirname, './src/modules'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      '@/content': path.resolve(__dirname, './content'),
      // server-only throws in vitest (node env). Alias to a no-op so server
      // modules can be tested without Next.js bundler context.
      'server-only': path.resolve(__dirname, './src/shared/test-utils/server-only-mock.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    exclude: ['tests/e2e/**', 'node_modules/**', '.claude/worktrees/**'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    // Restore a proper in-memory Storage for jsdom tests. Node 25 ships
    // a native globalThis.localStorage stub that lacks .clear() / .setItem()
    // when --localstorage-file is absent, and it leaks into the per-file
    // jsdom environment, breaking any test that exercises window.localStorage.
    // setupFiles run *inside* each test file's environment (jsdom-aware), so
    // the polyfill targets `window` only when window exists.
    setupFiles: ['./src/shared/test-utils/jsdom-setup.ts'],
  },
});
