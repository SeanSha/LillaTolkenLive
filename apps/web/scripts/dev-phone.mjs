import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = require.resolve('vite/bin/vite.js');

const child = spawn(process.execPath, [viteBin, '--host', '--port', '5173', '--strictPort'], {
  cwd: webRoot,
  stdio: 'inherit',
  env: { ...process.env, PHONE: '1' },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
