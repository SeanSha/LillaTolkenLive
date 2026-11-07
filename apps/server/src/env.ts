import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnvFiles(env: NodeJS.ProcessEnv = process.env, directories: string[] = []): void {
  for (const directory of directories) {
    const candidate = path.join(directory, '.env');
    if (existsSync(candidate)) {
      loadEnvFile(candidate, env);
    }
  }
}

export function loadEnvFile(filePath: string, env: NodeJS.ProcessEnv): void {
  const contents = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = unquote(trimmed.slice(equalsIndex + 1).trim());
    if (key && env[key] === undefined) {
      env[key] = value;
    }
  }
}

export function repoRootFrom(moduleUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../../..');
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
