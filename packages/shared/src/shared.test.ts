import { describe, expect, it } from 'vitest';

import { buildAudioMixState, clampVolume } from './audioMix.js';
import { generateClassroomCode, isClassroomCode, normalizeClassroomCode, tailText } from './classroomCode.js';
import { classifyOpenAIStatus } from './errors.js';
import { noiseReductionFor, normalizeTargetLanguage } from './languages.js';
import { createSessionMetrics, elapsedStreamingMs } from './metrics.js';
import { parseClientMessage, parseServerMessage } from './protocol.js';
import { redactSecrets } from './redact.js';
import { createTranslationViewState, reduceTranslationEvent } from './translationEvents.js';

describe('target languages', () => {
  it('accepts the documented compact codes and defaults Chinese to zh', () => {
    expect(normalizeTargetLanguage(' ZH ')).toBe('zh');
    expect(normalizeTargetLanguage('EN')).toBe('en');
  });

  it('rejects empty, regional, and unsupported codes', () => {
    expect(() => normalizeTargetLanguage('')).toThrow(/target language/i);
    expect(() => normalizeTargetLanguage('english')).toThrow(/compact supported/i);
    expect(() => normalizeTargetLanguage('zh-hans')).toThrow(/supported target language/i);
    expect(() => normalizeTargetLanguage('sv')).toThrow(/supported target language/i);
  });

  it('selects far-field noise reduction for a classroom microphone', () => {
    expect(noiseReductionFor('microphone')).toEqual({ type: 'far_field' });
    expect(noiseReductionFor('tab')).toBeNull();
    expect(noiseReductionFor(undefined)).toBeNull();
  });
});

describe('audio mix', () => {
  it('balances translated and original volumes', () => {
    expect(buildAudioMixState(85)).toMatchObject({
      translatedPercent: 85,
      originalPercent: 15,
      translatedVolume: 0.85,
      originalVolume: 0.15,
    });
    expect(buildAudioMixState('nope').translatedPercent).toBe(85);
    expect(buildAudioMixState(140).translatedPercent).toBe(100);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
  });
});

describe('redaction and errors', () => {
  it('removes API keys and client secrets', () => {
    const text = redactSecrets('key sk-live123 and secret ek_abc plus Bearer sk-live123');
    expect(text).not.toContain('sk-live123');
    expect(text).not.toContain('ek_abc');
    expect(text).toContain('[redacted]');
    expect(text).toContain('Bearer [redacted]');
  });

  it('classifies OpenAI status codes', () => {
    expect(classifyOpenAIStatus(401)).toBe('invalid_api_key');
    expect(classifyOpenAIStatus(429)).toBe('rate_limited');
    expect(classifyOpenAIStatus(500)).toBe('api_error');
  });
});

describe('classroom codes', () => {
  it('generates unambiguous codes and normalizes typed input', () => {
    const code = generateClassroomCode((max) => max - 1);
    expect(isClassroomCode(code)).toBe(true);
    expect(code.includes('0')).toBe(false);
    expect(code.includes('O')).toBe(false);
    expect(normalizeClassroomCode(' ab-c1 o ')).toBe('ABC');
    expect(tailText('abcdef', 3)).toBe('def');
  });
});

describe('metrics', () => {
  it('measures streaming duration without inventing a price', () => {
    const metrics = createSessionMetrics({ targetLanguage: 'zh', localSessionId: 'local-1' });
    expect(metrics.estimatedCostUsd).toBeNull();
    expect(elapsedStreamingMs({ streamingStartedAt: null, streamingEndedAt: null }, 10)).toBe(0);
    expect(elapsedStreamingMs({ streamingStartedAt: 1000, streamingEndedAt: 2500 }, 9999)).toBe(1500);
    expect(elapsedStreamingMs({ streamingStartedAt: 1000, streamingEndedAt: null }, 4000)).toBe(3000);
  });
});

describe('translation events', () => {
  it('appends translated deltas and keeps source text separate', () => {
    let state = createTranslationViewState();
    state = reduceTranslationEvent(state, { type: 'session.output_transcript.delta', delta: '你' });
    state = reduceTranslationEvent(state, { type: 'session.output_transcript.delta', delta: '好' });
    state = reduceTranslationEvent(state, { type: 'session.input_transcript.delta', delta: 'Hej' });
    state = reduceTranslationEvent(state, { type: 'output_audio_buffer.started' });
    state = reduceTranslationEvent(state, { type: 'response.output_audio_transcript.delta', delta: 'ignored' });
    state = reduceTranslationEvent(state, { type: 'error', error: { message: 'bad sk-secret' } });

    expect(state.outputText).toBe('你好');
    expect(state.inputText).toBe('Hej');
    expect(state.audioBufferStarted).toBe(true);
    expect(state.errors[0]).not.toContain('sk-secret');
    expect(state.lastEventType).toBe('error');
  });
});

describe('signaling protocol', () => {
  it('accepts classroom messages and drops malformed signals', () => {
    expect(parseClientMessage({ type: 'student.join', code: 'ab-c234' })?.type).toBe('student.join');
    expect(parseClientMessage({ type: 'student.join', code: 'short' })).toBeNull();
    expect(
      parseClientMessage({
        type: 'signal',
        to: 'student-1234',
        payload: { kind: 'offer', sdp: 'v=0' },
      }),
    ).toMatchObject({ type: 'signal' });
    expect(parseClientMessage({ type: 'signal', to: 'x', payload: { kind: 'offer', sdp: '' } })).toBeNull();
    expect(parseServerMessage({ type: 'classroom.ended', reason: 'teacher_left' })).toEqual({
      type: 'classroom.ended',
      reason: 'teacher_left',
    });
    expect(parseServerMessage({ type: 'transcript', text: 12 })).toBeNull();
  });
});
