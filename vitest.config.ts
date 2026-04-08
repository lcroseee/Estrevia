import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/modules': path.resolve(__dirname, './src/modules'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      '@/content': path.resolve(__dirname, './content'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
