export const DEFAULT_TRANSLATED_MIX = 85;

export function clampTranslatedMix(value: unknown): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TRANSLATED_MIX;
  }
  return Math.min(100, Math.max(0, parsed));
}

export function clampVolume(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(1, Math.max(0, parsed));
}

export type AudioMixState = {
  translatedPercent: number;
  originalPercent: number;
  translatedVolume: number;
  originalVolume: number;
};

/** Balance original monitored audio against translated speech. 100 is translation only. */
export function buildAudioMixState(value: unknown): AudioMixState {
  const translatedPercent = clampTranslatedMix(value);
  const originalPercent = 100 - translatedPercent;
  return {
    translatedPercent,
    originalPercent,
    translatedVolume: translatedPercent / 100,
    originalVolume: originalPercent / 100,
  };
}
