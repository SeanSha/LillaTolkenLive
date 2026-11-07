import { TRANSLATION_CALL_URL } from '@lilla/shared';

export function buildTranslationCallRequest(clientSecret: string, sdp: string) {
  return {
    url: TRANSLATION_CALL_URL,
    init: {
      method: 'POST' as const,
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        'Content-Type': 'application/sdp',
      },
      body: sdp,
    },
  };
}
