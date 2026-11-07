import {
  AppError,
  classifyOpenAIStatus,
  redactSecrets,
  type ErrorCode,
  type InputProfile,
  type TranslationEvent,
} from '@lilla/shared';

import { isAbortError } from '../audio/capture';
import { RemoteAudioPlayer, type PlaybackState } from '../audio/player';
import { buildTranslationCallRequest } from './call';

export type TranslationListeners = {
  onEvent: (event: TranslationEvent) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onIceState: (state: RTCIceConnectionState) => void;
  onDataChannelState: (state: RTCDataChannelState) => void;
  onPlayback: (state: PlaybackState) => void;
  onSession: (info: { model: string | null; providerSessionId: string | null }) => void;
};

type SessionPayload = {
  client_secret?: unknown;
  model?: unknown;
  session?: unknown;
  error?: unknown;
  code?: unknown;
  details?: unknown;
};

/**
 * Browser WebRTC client for gpt-realtime-translate.
 * Configuration is applied when the server mints the client secret.
 * This class never receives or logs the permanent OpenAI API key.
 */
export class OpenAIRealtimeTranslationProvider {
  async connect(input: {
    stream: MediaStream;
    targetLanguage: string;
    inputProfile: InputProfile;
    playOriginal: boolean;
    signal?: AbortSignal;
    translatedPlayer?: RemoteAudioPlayer;
    listeners: TranslationListeners;
  }): Promise<TranslationConnection> {
    const session = await requestClientSecret(input);
    input.listeners.onSession({
      model: typeof session.model === 'string' ? session.model : null,
      providerSessionId: readSessionId(session.session),
    });

    const pc = new RTCPeerConnection();
    const channel = pc.createDataChannel('oai-events');
    const translated = input.translatedPlayer ?? new RemoteAudioPlayer();
    const original = input.playOriginal ? new RemoteAudioPlayer() : null;
    const connection = new TranslationConnection(pc, channel, translated, original);

    pc.onconnectionstatechange = () => {
      input.listeners.onConnectionState(pc.connectionState);
    };
    pc.oniceconnectionstatechange = () => {
      input.listeners.onIceState(pc.iceConnectionState);
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      input.listeners.onRemoteStream(stream);
      void translated.attach(stream).then((state) => input.listeners.onPlayback(state));
    };
    channel.onopen = () => input.listeners.onDataChannelState(channel.readyState);
    channel.onclose = () => input.listeners.onDataChannelState('closed');
    channel.onmessage = (message) => {
      input.listeners.onEvent(parseEvent(message.data));
    };

    try {
      for (const track of input.stream.getAudioTracks()) {
        pc.addTrack(track, input.stream);
      }
      if (original) {
        void original.attach(input.stream).then((state) => input.listeners.onPlayback(state));
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      throwIfAborted(input.signal);

      const call = buildTranslationCallRequest(String(session.client_secret), offer.sdp ?? '');
      let answerResponse: Response;
      try {
        answerResponse = await fetch(call.url, { ...call.init, signal: input.signal });
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        throw new AppError('network', 'Could not reach the translation service.');
      }

      const answer = await answerResponse.text();
      if (!answerResponse.ok) {
        throw new AppError(
          classifyOpenAIStatus(answerResponse.status),
          'Translation connection was rejected.',
          redactSecrets(answer).slice(0, 500),
        );
      }

      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      return connection;
    } catch (error) {
      await connection.close();
      throw error;
    }
  }
}

export class TranslationConnection {
  private closed = false;

  constructor(
    private readonly pc: RTCPeerConnection,
    private readonly channel: RTCDataChannel,
    private readonly translated: RemoteAudioPlayer,
    private readonly original: RemoteAudioPlayer | null,
  ) {}

  setTranslatedVolume(volume: number): void {
    this.translated.setVolume(volume);
  }

  setOriginalVolume(volume: number): void {
    this.original?.setVolume(volume);
  }

  setTranslatedMuted(muted: boolean): void {
    this.translated.setMuted(muted);
  }

  resumePlayback(): Promise<PlaybackState> {
    return this.translated.resume();
  }

  async close(options?: { keepPlayback?: boolean }): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.channel.onmessage = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    try {
      this.channel.close();
    } catch {
      /* already closed */
    }
    try {
      this.pc.close();
    } catch {
      /* already closed */
    }
    if (options?.keepPlayback) {
      this.translated.detach();
    } else {
      this.translated.release();
    }
    this.original?.release();
  }
}

export const translationProvider = new OpenAIRealtimeTranslationProvider();

async function requestClientSecret(input: {
  targetLanguage: string;
  inputProfile: InputProfile;
  signal?: AbortSignal;
}): Promise<SessionPayload> {
  let response: Response;
  try {
    response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetLanguage: input.targetLanguage,
        inputProfile: input.inputProfile,
      }),
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new AppError('network', 'Could not reach the local translation server.');
  }

  const body = (await response.json().catch(() => ({}))) as SessionPayload;
  if (!response.ok) {
    const code = isErrorCode(body.code) ? body.code : 'api_error';
    throw new AppError(
      code,
      typeof body.error === 'string' ? body.error : 'Could not start translation.',
      typeof body.details === 'string' ? body.details : undefined,
    );
  }
  if (typeof body.client_secret !== 'string' || !body.client_secret) {
    throw new AppError('api_error', 'Translation session did not include a client secret.');
  }
  return body;
}

function parseEvent(data: unknown): TranslationEvent {
  if (typeof data !== 'string') {
    return { type: 'unknown' };
  }
  try {
    const parsed = JSON.parse(data) as TranslationEvent;
    return parsed && typeof parsed === 'object' ? parsed : { type: 'unknown' };
  } catch {
    return { type: 'unknown' };
  }
}

function readSessionId(session: unknown): string | null {
  if (!session || typeof session !== 'object' || !('id' in session)) {
    return null;
  }
  const id = (session as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return (
    value === 'missing_api_key' ||
    value === 'invalid_api_key' ||
    value === 'unsupported_browser' ||
    value === 'mic_denied' ||
    value === 'mic_not_found' ||
    value === 'tab_denied' ||
    value === 'no_tab_audio' ||
    value === 'capture_cancelled' ||
    value === 'webrtc_failed' ||
    value === 'api_error' ||
    value === 'rate_limited' ||
    value === 'network' ||
    value === 'track_ended' ||
    value === 'reconnect_failed' ||
    value === 'invalid_language' ||
    value === 'unknown_classroom' ||
    value === 'classroom_full' ||
    value === 'invalid_message' ||
    value === 'unknown'
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}
