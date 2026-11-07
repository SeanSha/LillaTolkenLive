export const ERROR_CODES = [
  'missing_api_key',
  'invalid_api_key',
  'unsupported_browser',
  'mic_denied',
  'mic_not_found',
  'tab_denied',
  'no_tab_audio',
  'capture_cancelled',
  'webrtc_failed',
  'api_error',
  'rate_limited',
  'network',
  'track_ended',
  'reconnect_failed',
  'invalid_language',
  'unknown_classroom',
  'classroom_full',
  'invalid_message',
  'unknown',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function classifyOpenAIStatus(status: number): ErrorCode {
  if (status === 401 || status === 403) {
    return 'invalid_api_key';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  return 'api_error';
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: string;

  constructor(code: ErrorCode, message: string, details?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}
