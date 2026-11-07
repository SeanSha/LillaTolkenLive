/**
 * Client-side session measurements.
 * Timestamps are monotonic milliseconds from performance.now(), not wall-clock
 * instants and not audio-playback latency.
 */
export type SessionMetrics = {
  localSessionId: string;
  providerSessionId: string | null;
  model: string | null;
  targetLanguage: string;
  /** Translation connect start -> RTCPeerConnection "connected". */
  connectionSetupMs: number | null;
  /** Translation connect start -> first output transcript delta. Not playback latency. */
  firstTranscriptArrivalMs: number | null;
  /** Translation connect start -> first remote translated audio track. Not playback latency. */
  firstTranslatedAudioArrivalMs: number | null;
  /** Translation connect start -> output_audio_buffer.started, when that event exists. */
  firstOutputAudioEventMs: number | null;
  interruptions: number;
  reconnectionAttempts: number;
  apiErrors: string[];
  transcriptDeltaCount: number;
  remoteAudioTracks: number;
  streamingStartedAt: number | null;
  streamingEndedAt: number | null;
  /**
   * The Realtime Translation responses used here do not include a price.
   * Duration is measured; USD cost is intentionally unknown rather than invented.
   */
  estimatedCostUsd: null;
};

export function createSessionMetrics(input: {
  targetLanguage: string;
  localSessionId?: string;
}): SessionMetrics {
  return {
    localSessionId: input.localSessionId ?? globalThis.crypto.randomUUID(),
    providerSessionId: null,
    model: null,
    targetLanguage: input.targetLanguage,
    connectionSetupMs: null,
    firstTranscriptArrivalMs: null,
    firstTranslatedAudioArrivalMs: null,
    firstOutputAudioEventMs: null,
    interruptions: 0,
    reconnectionAttempts: 0,
    apiErrors: [],
    transcriptDeltaCount: 0,
    remoteAudioTracks: 0,
    streamingStartedAt: null,
    streamingEndedAt: null,
    estimatedCostUsd: null,
  };
}

export function elapsedStreamingMs(
  metrics: Pick<SessionMetrics, 'streamingStartedAt' | 'streamingEndedAt'>,
  now: number,
): number {
  if (metrics.streamingStartedAt == null) {
    return 0;
  }
  const end = metrics.streamingEndedAt ?? now;
  return Math.max(0, end - metrics.streamingStartedAt);
}

export function appendApiError(errors: string[], message: string, limit = 20): string[] {
  return [...errors, message].slice(-limit);
}
