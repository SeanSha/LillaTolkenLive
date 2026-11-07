import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vitest/config';

const phone = process.env.PHONE === '1';

export default defineConfig(async () => {
  const plugins: PluginOption[] = [react()];
  if (phone) {
    const basicSsl = await import('@vitejs/plugin-basic-ssl');
    plugins.push(basicSsl.default());
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@lilla/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      host: phone ? true : '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': 'http://127.0.0.1:8787',
        '/ws': {
          target: 'ws://127.0.0.1:8787',
          ws: true,
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
