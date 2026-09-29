/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',
  test: {
    include: ['tests/**/*.spec.ts'],
    testTimeout: 30_000,
  },
});
