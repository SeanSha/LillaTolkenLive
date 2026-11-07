import { AppError, type ErrorCode, type InputProfile } from '@lilla/shared';

import { preferPlayAndRecord } from './player';

export type AudioSourceKind = InputProfile;

type CapabilityScope = {
  RTCPeerConnection?: unknown;
  AudioContext?: unknown;
  mediaDevices?: { getUserMedia?: unknown; getDisplayMedia?: unknown };
};

export type BrowserCapabilities = {
  webrtc: boolean;
  microphone: boolean;
  tabAudio: boolean;
  audio: boolean;
};

export function detectBrowserCapabilities(scope: CapabilityScope = defaultScope()): BrowserCapabilities {
  return {
    webrtc: typeof scope.RTCPeerConnection === 'function',
    microphone: typeof scope.mediaDevices?.getUserMedia === 'function',
    tabAudio: typeof scope.mediaDevices?.getDisplayMedia === 'function',
    audio: typeof scope.AudioContext === 'function',
  };
}

export function buildMicrophoneConstraints(): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };
}

export function buildDisplayMediaOptions(supported: { suppressLocalAudioPlayback?: boolean } = {}) {
  const audio: MediaTrackConstraints & { suppressLocalAudioPlayback?: boolean } = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (supported.suppressLocalAudioPlayback) {
    audio.suppressLocalAudioPlayback = true;
  }

  return {
    video: { displaySurface: 'browser' },
    audio,
    preferCurrentTab: false,
    selfBrowserSurface: 'exclude' as const,
    surfaceSwitching: 'include' as const,
    systemAudio: 'include' as const,
  };
}

export async function captureAudio(source: AudioSourceKind): Promise<MediaStream> {
  const capabilities = detectBrowserCapabilities();
  if (!capabilities.webrtc || !capabilities.audio) {
    throw new AppError('unsupported_browser', 'This browser cannot run live translation.');
  }
  if (source === 'microphone' && !capabilities.microphone) {
    throw new AppError('unsupported_browser', 'Microphone capture is unavailable.');
  }
  if (source === 'tab' && !capabilities.tabAudio) {
    throw new AppError('unsupported_browser', 'Tab audio capture is unavailable.');
  }
  if (!navigator.mediaDevices) {
    throw new AppError('unsupported_browser', 'mediaDevices is unavailable.');
  }

  try {
    if (source === 'microphone') {
      preferPlayAndRecord();
      return await navigator.mediaDevices.getUserMedia(buildMicrophoneConstraints());
    }
    const supported = (navigator.mediaDevices.getSupportedConstraints?.() ?? {}) as {
      suppressLocalAudioPlayback?: boolean;
    };
    const stream = await navigator.mediaDevices.getDisplayMedia(
      buildDisplayMediaOptions(supported) as DisplayMediaStreamOptions,
    );
    if (stream.getAudioTracks().length === 0) {
      stopStream(stream);
      throw new AppError('no_tab_audio', 'No tab audio was shared.');
    }
    return stream;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw mapMediaError(source, error);
  }
}

export function mapMediaError(source: AudioSourceKind, error: unknown): AppError {
  const name = readName(error);
  const message = error instanceof Error ? error.message : 'Could not capture audio.';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return new AppError(source === 'microphone' ? 'mic_denied' : 'tab_denied', message);
  }
  if (name === 'AbortError') {
    return new AppError('capture_cancelled', message);
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return new AppError(source === 'microphone' ? 'mic_not_found' : 'no_tab_audio', message);
  }
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return new AppError('unsupported_browser', message);
  }
  return new AppError('unknown', message);
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function describeCapture(stream: MediaStream): string {
  const audio = stream.getAudioTracks()[0];
  const settings = (audio?.getSettings?.() ?? {}) as MediaTrackSettings & {
    suppressLocalAudioPlayback?: boolean;
  };
  const suppressed =
    typeof settings.suppressLocalAudioPlayback === 'boolean' ? String(settings.suppressLocalAudioPlayback) : 'n/a';
  return `audio=${audio?.readyState ?? 'none'}, video=${stream.getVideoTracks().length}, suppressed=${suppressed}`;
}

export function isAbortError(error: unknown): boolean {
  return readName(error) === 'AbortError';
}

function readName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return '';
}

function defaultScope(): CapabilityScope {
  if (typeof window === 'undefined') {
    return {};
  }
  return {
    RTCPeerConnection: window.RTCPeerConnection,
    AudioContext: window.AudioContext,
    mediaDevices: navigator.mediaDevices,
  };
}

export function errorCodeOf(error: unknown): ErrorCode {
  return error instanceof AppError ? error.code : 'unknown';
}
