export const DEFAULT_TRANSLATION_MODEL = 'gpt-realtime-translate';
export const DEFAULT_INPUT_TRANSCRIPTION_MODEL = 'gpt-realtime-whisper';
export const TRANSLATION_CLIENT_SECRET_URL =
  'https://api.openai.com/v1/realtime/translations/client_secrets';
export const TRANSLATION_CALL_URL = 'https://api.openai.com/v1/realtime/translations/calls';

export const SUPPORTED_TARGET_LANGUAGES = [
  { code: 'zh', label: '中文', englishName: 'Chinese' },
  { code: 'en', label: 'English', englishName: 'English' },
  { code: 'es', label: 'Español', englishName: 'Spanish' },
  { code: 'pt', label: 'Português', englishName: 'Portuguese' },
  { code: 'fr', label: 'Français', englishName: 'French' },
  { code: 'de', label: 'Deutsch', englishName: 'German' },
  { code: 'it', label: 'Italiano', englishName: 'Italian' },
  { code: 'ja', label: '日本語', englishName: 'Japanese' },
  { code: 'ko', label: '한국어', englishName: 'Korean' },
  { code: 'ru', label: 'Русский', englishName: 'Russian' },
  { code: 'hi', label: 'हिन्दी', englishName: 'Hindi' },
  { code: 'id', label: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { code: 'vi', label: 'Tiếng Việt', englishName: 'Vietnamese' },
] as const;

export type TargetLanguageCode = (typeof SUPPORTED_TARGET_LANGUAGES)[number]['code'];
export type InputProfile = 'microphone' | 'tab';

const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/;
const SUPPORTED_CODES = new Set<string>(SUPPORTED_TARGET_LANGUAGES.map((language) => language.code));

export function normalizeTargetLanguage(targetLanguage: string): TargetLanguageCode {
  if (typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
    throw new Error('A target language code is required.');
  }

  const normalized = targetLanguage.trim().toLowerCase();
  if (!LANGUAGE_TAG_PATTERN.test(normalized)) {
    throw new Error('Use a compact supported target language code such as zh, en, or es.');
  }
  if (!SUPPORTED_CODES.has(normalized)) {
    throw new Error(
      `Use a supported target language code: ${SUPPORTED_TARGET_LANGUAGES.map((language) => language.code).join(', ')}.`,
    );
  }

  return normalized as TargetLanguageCode;
}

export function languageLabel(code: string): string {
  return SUPPORTED_TARGET_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

/**
 * Documented Realtime Translation noise reduction.
 * A classroom desk microphone is far-field. Tab audio keeps the null setting
 * used by the official browser demo so already-processed media is not altered.
 */
export function noiseReductionFor(
  profile: InputProfile | undefined,
): { type: 'near_field' | 'far_field' } | null {
  if (profile === 'microphone') {
    return { type: 'far_field' };
  }
  return null;
}
