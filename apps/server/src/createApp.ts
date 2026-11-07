import {
  classifyOpenAIStatus,
  redactSecrets,
  type InputProfile,
} from '@lilla/shared';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';

import { ClassroomManager } from './classroomManager.js';
import { createClientSecret, OpenAIRequestError } from './openaiSession.js';

const MAX_JSON_BYTES = 1_000_000;
const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export type AppOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  webRoot?: string;
  classroomManager?: ClassroomManager;
};

export function createApp(options: AppOptions = {}) {
  const env = options.env ?? process.env;
  const manager = options.classroomManager ?? new ClassroomManager();
  const httpServer = createServer((request, response) => {
    void handleRequest(request, response, { ...options, env }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      sendJson(response, 500, { error: redactSecrets(message), code: 'unknown' });
    });
  });
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (socket) => {
    manager.handleConnection(socket);
  });

  return { httpServer, wss, manager };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: AppOptions & { env: NodeJS.ProcessEnv },
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'lillatolken-live',
      openaiConfigured: Boolean(options.env.OPENAI_API_KEY),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/session') {
    await handleSession(request, response, options);
    return;
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    serveWeb(url.pathname, request.method, response, options.webRoot);
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed.', code: 'unknown' });
}

async function handleSession(
  request: IncomingMessage,
  response: ServerResponse,
  options: AppOptions & { env: NodeJS.ProcessEnv },
): Promise<void> {
  let body: { targetLanguage?: unknown; inputProfile?: unknown };
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : 'Invalid JSON body.',
      code: 'invalid_message',
    });
    return;
  }

  const inputProfile = body.inputProfile;
  if (inputProfile !== undefined && inputProfile !== 'microphone' && inputProfile !== 'tab') {
    sendJson(response, 400, { error: 'Invalid input profile.', code: 'invalid_message' });
    return;
  }

  if (typeof body.targetLanguage !== 'string') {
    sendJson(response, 400, { error: 'A target language code is required.', code: 'invalid_language' });
    return;
  }

  if (!options.env.OPENAI_API_KEY) {
    sendJson(response, 500, {
      error: 'OPENAI_API_KEY is not configured.',
      code: 'missing_api_key',
    });
    return;
  }

  try {
    const result = await createClientSecret({
      apiKey: options.env.OPENAI_API_KEY,
      targetLanguage: body.targetLanguage,
      model: options.env.OPENAI_TRANSLATION_MODEL,
      inputTranscriptionModel: options.env.OPENAI_INPUT_TRANSCRIPTION_MODEL,
      inputProfile: inputProfile as InputProfile | undefined,
      fetchImpl: options.fetchImpl,
    });
    sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof OpenAIRequestError) {
      sendJson(response, 502, {
        error: 'OpenAI rejected the translation session.',
        code: classifyOpenAIStatus(error.status),
        details: redactSecrets(error.body).slice(0, 500),
      });
      return;
    }
    const message = error instanceof Error ? error.message : 'Invalid session request.';
    const invalidLanguage = /language/i.test(message);
    sendJson(response, 400, {
      error: message,
      code: invalidLanguage ? 'invalid_language' : 'unknown',
    });
  }
}

function serveWeb(urlPath: string, method: string, response: ServerResponse, webRoot?: string): void {
  if (!webRoot) {
    sendJson(response, 503, {
      error: 'Web app is not built. Use npm run dev.',
      code: 'unknown',
    });
    return;
  }

  const filePath = resolveWebPath(urlPath, webRoot);
  if (!filePath) {
    sendText(response, 404, 'Not found.');
    return;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
  });
  if (method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

export function resolveWebPath(urlPath: string, webRoot: string): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const absolute = path.resolve(webRoot, relative);
  const root = path.resolve(webRoot);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  if (existsSync(absolute) && statSync(absolute).isFile()) {
    return absolute;
  }

  const fallback = path.resolve(webRoot, 'index.html');
  if (!pathname.startsWith('/api') && existsSync(fallback)) {
    return fallback;
  }
  return null;
}

async function readJson(request: IncomingMessage): Promise<{ targetLanguage?: unknown; inputProfile?: unknown }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_JSON_BYTES) {
      throw new Error('JSON body is too large.');
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as { targetLanguage?: unknown; inputProfile?: unknown };
  } catch {
    throw new Error('Invalid JSON body.');
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) {
    return;
  }
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(body);
}

export async function closeApp(app: ReturnType<typeof createApp>): Promise<void> {
  for (const client of app.wss.clients) {
    client.terminate();
  }
  await new Promise<void>((resolve, reject) => {
    app.wss.close((error) => (error ? reject(error) : resolve()));
  });
  if (!app.httpServer.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    app.httpServer.close((error) => (error ? reject(error) : resolve()));
  });
}
