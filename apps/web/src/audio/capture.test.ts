import { describe, expect, it } from 'vitest';

import { buildDisplayMediaOptions, buildMicrophoneConstraints, detectBrowserCapabilities, mapMediaError } from './capture';

describe('capture options', () => {
  it('keeps microphone processing and avoids playing the microphone back', () => {
    expect(buildMicrophoneConstraints()).toEqual({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  });

  it('excludes this browser surface and suppresses local tab playback when supported', () => {
    const options = buildDisplayMediaOptions({ suppressLocalAudioPlayback: true });
    expect(options.selfBrowserSurface).toBe('exclude');
    expect(options.preferCurrentTab).toBe(false);
    expect(options.audio).toMatchObject({ suppressLocalAudioPlayback: true, echoCancellation: false });
  });

  it('maps permission failures without depending on a live device', () => {
    expect(mapMediaError('microphone', { name: 'NotAllowedError', message: 'denied' }).code).toBe('mic_denied');
    expect(mapMediaError('tab', { name: 'NotAllowedError', message: 'denied' }).code).toBe('tab_denied');
    expect(mapMediaError('tab', { name: 'AbortError', message: 'closed' }).code).toBe('capture_cancelled');
    expect(mapMediaError('microphone', { name: 'NotFoundError', message: 'none' }).code).toBe('mic_not_found');
  });

  it('detects missing browser APIs from an injected scope', () => {
    expect(detectBrowserCapabilities({})).toEqual({
      webrtc: false,
      microphone: false,
      tabAudio: false,
      audio: false,
    });
  });
});
