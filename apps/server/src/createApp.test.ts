import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';

import { closeApp, createApp, resolveWebPath, type AppOptions } from './createApp.js';

const apps: Array<ReturnType<typeof createApp>> = [];

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    if (app) {
      await closeApp(app);
    }
  }
});

describe('HTTP API', () => {
  it('reports configuration without revealing the API key', async () => {
    const { baseUrl } = await start({ env: { OPENAI_API_KEY: 'sk-test-should-not-leak' } });
    const response = await fetch(`${baseUrl}/api/health`);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain('"openaiConfigured":true');
    expect(text).not.toContain('sk-test-should-not-leak');
  });

  it('rejects an unsupported language before calling OpenAI', async () => {
    let calls = 0;
    const { baseUrl } = await start({
      env: { OPENAI_API_KEY: 'sk-test-should-not-leak' },
      fetchImpl: async () => {
        calls += 1;
        throw new Error('fetch should not be called');
      },
    });
    const response = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage: 'sv' }),
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('invalid_language');
    expect(calls).toBe(0);
  });

  it('returns a short-lived secret and keeps the permanent key on the server', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const { baseUrl } = await start({
      env: { OPENAI_API_KEY: 'sk-test-should-not-leak' },
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init });
        return Response.json({
          value: 'ek_test_secret',
          expires_at: 123,
          session: { id: 'sess_test' },
        });
      },
    });

    const response = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage: 'zh', inputProfile: 'tab' }),
    });
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body.client_secret).toBe('ek_test_secret');
    expect(body.model).toBe('gpt-realtime-translate');
    expect(body.targetLanguage).toBe('zh');
    expect(body.session).toEqual({ id: 'sess_test' });
    expect(text).not.toContain('sk-test-should-not-leak');
    expect(requests).toHaveLength(1);
    const upstream = JSON.parse(String(requests[0]?.init?.body));
    expect(upstream.session.audio.output.language).toBe('zh');
    expect(upstream.session.audio.input.noise_reduction).toBeNull();
  });

  it('redacts secrets from an upstream error body', async () => {
    const { baseUrl } = await start({
      env: { OPENAI_API_KEY: 'sk-test-should-not-leak' },
      fetchImpl: async () => new Response('bad sk-test-should-not-leak and ek_temp', { status: 401 }),
    });
    const response = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage: 'zh' }),
    });
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).toContain('invalid_api_key');
    expect(text).not.toContain('sk-test-should-not-leak');
    expect(text).not.toContain('ek_temp');
  });

  it('does not call OpenAI when the API key is missing', async () => {
    let calls = 0;
    const { baseUrl } = await start({
      env: {},
      fetchImpl: async () => {
        calls += 1;
        throw new Error('fetch should not be called');
      },
    });
    const response = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage: 'zh' }),
    });
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.code).toBe('missing_api_key');
    expect(calls).toBe(0);
  });

  it('serves the built web app and blocks path traversal', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ltl-web-'));
    const webRoot = path.join(directory, 'web');
    mkdirSync(webRoot);
    writeFileSync(path.join(webRoot, 'index.html'), '<title>Lilla Tolken Live</title>', 'utf8');
    writeFileSync(path.join(directory, 'secret.txt'), 'sk-test-should-not-leak', 'utf8');
    const { baseUrl, port } = await start({ env: { OPENAI_API_KEY: 'sk-test' }, webRoot });

    const home = await fetch(`${baseUrl}/teacher`);
    expect(await home.text()).toContain('Lilla Tolken Live');
    expect(resolveWebPath('/../secret.txt', webRoot)).toBeNull();
    expect(resolveWebPath('/teacher', webRoot)).toBe(path.join(webRoot, 'index.html'));
    const secret = await rawGet(port, '/../secret.txt');
    expect(secret.body).not.toContain('sk-test-should-not-leak');
    rmSync(directory, { recursive: true, force: true });
  });
});

describe('classroom signaling', () => {
  it('lets one teacher relay transcript and signals to a student', async () => {
    const { baseUrl } = await start({ env: { OPENAI_API_KEY: 'sk-test' } });
    const teacher = await openSocket(baseUrl);
    const student = await openSocket(baseUrl);
    const outsider = await openSocket(baseUrl);

    expect((await teacher.next()).type).toBe('welcome');
    expect((await student.next()).type).toBe('welcome');
    expect((await outsider.next()).type).toBe('welcome');

    teacher.socket.send(JSON.stringify({ type: 'teacher.create', targetLanguage: 'zh' }));
    const created = await until(teacher, 'classroom.created');
    expect(created.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

    student.socket.send(JSON.stringify({ type: 'student.join', code: created.code }));
    const joined = await until(student, 'classroom.joined');
    expect(joined.targetLanguage).toBe('zh');
    const announced = await until(teacher, 'student.announce');
    const presence = await until(teacher, 'presence');
    expect(presence.studentCount).toBe(1);

    teacher.socket.send(
      JSON.stringify({
        type: 'signal',
        to: announced.studentId,
        payload: { kind: 'offer', sdp: 'v=0' },
      }),
    );
    const offer = await until(student, 'signal');
    expect(offer.payload).toEqual({ kind: 'offer', sdp: 'v=0' });

    teacher.socket.send(JSON.stringify({ type: 'transcript.snapshot', text: '你好' }));
    const transcript = await until(student, 'transcript');
    expect(transcript.text).toBe('你好');

    outsider.socket.send(
      JSON.stringify({
        type: 'signal',
        to: announced.studentId,
        payload: { kind: 'offer', sdp: 'v=intruder' },
      }),
    );
    await delay(80);
    expect(student.pending().some((message) => message.type === 'signal')).toBe(false);

    teacher.socket.send(JSON.stringify({ type: 'teacher.end' }));
    const ended = await until(student, 'classroom.ended');
    expect(ended.reason).toBe('teacher_ended');

    teacher.socket.close();
    student.socket.close();
    outsider.socket.close();
  });
});

async function start(options: AppOptions) {
  const app = createApp(options);
  apps.push(app);
  app.httpServer.listen(0, '127.0.0.1');
  await once(app.httpServer, 'listening');
  const address = app.httpServer.address() as AddressInfo;
  return { app, port: address.port, baseUrl: `http://127.0.0.1:${address.port}` };
}

function rawGet(port: number, requestPath: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port, path: requestPath, method: 'GET' },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function openSocket(baseUrl: string) {
  const socket = new WebSocket(baseUrl.replace('http', 'ws') + '/ws');
  const queue: Array<Record<string, unknown>> = [];
  const waiters: Array<(message: Record<string, unknown>) => void> = [];
  socket.on('message', (data) => {
    const message = JSON.parse(String(data)) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) {
      waiter(message);
      return;
    }
    queue.push(message);
  });
  await once(socket, 'open');
  return {
    socket,
    next: () => {
      const existing = queue.shift();
      if (existing) {
        return Promise.resolve(existing);
      }
      return new Promise<Record<string, unknown>>((resolve) => {
        waiters.push(resolve);
      });
    },
    pending: () => queue.slice(),
  };
}

async function until(
  tracker: Awaited<ReturnType<typeof openSocket>>,
  type: string,
): Promise<Record<string, any>> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const message = await tracker.next();
    if (message.type === type) {
      return message;
    }
  }
  throw new Error(`Timed out waiting for ${type}.`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
