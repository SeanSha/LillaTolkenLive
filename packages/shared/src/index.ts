export {
  DEFAULT_INPUT_TRANSCRIPTION_MODEL,
  DEFAULT_TRANSLATION_MODEL,
  SUPPORTED_TARGET_LANGUAGES,
  TRANSLATION_CALL_URL,
  TRANSLATION_CLIENT_SECRET_URL,
  languageLabel,
  noiseReductionFor,
  normalizeTargetLanguage,
} from './languages.js';
export type { InputProfile, TargetLanguageCode } from './languages.js';

export { DEFAULT_TRANSLATED_MIX, buildAudioMixState, clampTranslatedMix, clampVolume } from './audioMix.js';
export type { AudioMixState } from './audioMix.js';

export { redactSecrets } from './redact.js';
export { AppError, ERROR_CODES, classifyOpenAIStatus } from './errors.js';
export type { ErrorCode } from './errors.js';

export {
  CLASSROOM_CODE_ALPHABET,
  CLASSROOM_CODE_LENGTH,
  MAX_CLASSROOM_STUDENTS,
  MAX_TRANSCRIPT_CHARS,
  generateClassroomCode,
  isClassroomCode,
  normalizeClassroomCode,
  tailText,
} from './classroomCode.js';

export { appendApiError, createSessionMetrics, elapsedStreamingMs } from './metrics.js';
export type { SessionMetrics } from './metrics.js';

export {
  INPUT_TRANSCRIPT_DELTA,
  OUTPUT_AUDIO_BUFFER_STARTED,
  OUTPUT_TRANSCRIPT_DELTA,
  createTranslationViewState,
  reduceTranslationEvent,
} from './translationEvents.js';
export type { TranslationEvent, TranslationViewState } from './translationEvents.js';

export { parseClientMessage, parseServerMessage } from './protocol.js';
export type { ClientMessage, ServerMessage, SignalPayload } from './protocol.js';
