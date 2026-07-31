import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { resolveApiBaseUrl } from './src/lib/api-origin';

export default defineConfig(({ mode }) => {
  resolveApiBaseUrl(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL);

  return {
    plugins: [react()],
    server: {
      port: 3001,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: false,
        },
      },
    },
    preview: {
      port: 3001,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  };
});
