import path from 'node:path';

import { closeApp, createApp } from './createApp.js';
import { loadEnvFiles, repoRootFrom } from './env.js';

const root = repoRootFrom(import.meta.url);
loadEnvFiles(process.env, [root, path.join(root, 'apps', 'server')]);

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const host = process.env.HOST || '127.0.0.1';
const app = createApp({
  env: process.env,
  webRoot: path.join(root, 'apps', 'web', 'dist'),
});

app.httpServer.listen(port, host, () => {
  console.log(`Lilla Tolken Live server listening at http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void closeApp(app).finally(() => process.exit(0));
  });
}
