import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadEnvFile } from './env.js';

describe('env loader', () => {
  it('loads quoted values without overriding existing variables', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ltl-env-'));
    const file = path.join(directory, '.env');
    writeFileSync(file, '# comment\nOPENAI_API_KEY="sk-from-file"\nPORT=8787\nSKIP_ME\n', 'utf8');
    const env: NodeJS.ProcessEnv = { OPENAI_API_KEY: 'sk-already' };
    loadEnvFile(file, env);
    expect(env.OPENAI_API_KEY).toBe('sk-already');
    expect(env.PORT).toBe('8787');
    rmSync(directory, { recursive: true, force: true });
  });
});
