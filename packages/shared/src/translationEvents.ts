import { redactSecrets } from './redact.js';

/**
 * Event names documented for gpt-realtime-translate.
 * General-purpose Realtime voice events are intentionally ignored.
 */
export const OUTPUT_TRANSCRIPT_DELTA = 'session.output_transcript.delta';
export const INPUT_TRANSCRIPT_DELTA = 'session.input_transcript.delta';
export const OUTPUT_AUDIO_BUFFER_STARTED = 'output_audio_buffer.started';

export type TranslationEvent = {
  type?: unknown;
  delta?: unknown;
  error?: unknown;
};

export type TranslationViewState = {
  outputText: string;
  inputText: string;
  deltaCount: number;
  inputDeltaCount: number;
  audioBufferStarted: boolean;
  errors: string[];
  lastEventType: string;
};

export function createTranslationViewState(): TranslationViewState {
  return {
    outputText: '',
    inputText: '',
    deltaCount: 0,
    inputDeltaCount: 0,
    audioBufferStarted: false,
    errors: [],
    lastEventType: 'none',
  };
}

export function reduceTranslationEvent(
  state: TranslationViewState,
  event: TranslationEvent,
): TranslationViewState {
  const type = typeof event.type === 'string' ? event.type : 'unknown';
  const next: TranslationViewState = { ...state, lastEventType: type, errors: state.errors };

  if (type === 'error') {
    return {
      ...next,
      errors: [...state.errors, readErrorMessage(event.error)].slice(-20),
    };
  }

  if (type === OUTPUT_TRANSCRIPT_DELTA && typeof event.delta === 'string' && event.delta.length > 0) {
    return {
      ...next,
      outputText: state.outputText + event.delta,
      deltaCount: state.deltaCount + 1,
    };
  }

  if (type === INPUT_TRANSCRIPT_DELTA && typeof event.delta === 'string' && event.delta.length > 0) {
    return {
      ...next,
      inputText: state.inputText + event.delta,
      inputDeltaCount: state.inputDeltaCount + 1,
    };
  }

  if (type === OUTPUT_AUDIO_BUFFER_STARTED) {
    return { ...next, audioBufferStarted: true };
  }

  return next;
}

function readErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return redactSecrets(error.message).slice(0, 300);
  }
  return 'Translation service error';
}
