import { DEFAULT_TRANSLATION_MODEL, TRANSLATION_CLIENT_SECRET_URL } from '@lilla/shared';
import { describe, expect, it } from 'vitest';

import { buildClientSecretRequest } from './openaiSession.js';

describe('OpenAI translation session', () => {
  it('builds the documented client-secret payload without putting the key in the body', () => {
    const request = buildClientSecretRequest({
      apiKey: 'sk-test-should-stay-in-header',
      targetLanguage: ' ZH ',
      inputProfile: 'microphone',
    });

    expect(request.url).toBe(TRANSLATION_CLIENT_SECRET_URL);
    expect(request.init.headers.Authorization).toBe('Bearer sk-test-should-stay-in-header');
    const body = JSON.parse(request.init.body);
    expect(body.session.model).toBe(DEFAULT_TRANSLATION_MODEL);
    expect(body.session.audio.output.language).toBe('zh');
    expect(body.session.audio.input.transcription.model).toBe('gpt-realtime-whisper');
    expect(body.session.audio.input.noise_reduction).toEqual({ type: 'far_field' });
    expect(JSON.stringify(body)).not.toContain('sk-test');
    expect(body.session.instructions).toBeUndefined();
    expect(body.session.voice).toBeUndefined();
  });

  it('leaves noise reduction null for tab audio', () => {
    const request = buildClientSecretRequest({
      apiKey: 'sk-test',
      targetLanguage: 'en',
      inputProfile: 'tab',
    });
    const body = JSON.parse(request.init.body);
    expect(body.session.audio.input.noise_reduction).toBeNull();
  });
});
