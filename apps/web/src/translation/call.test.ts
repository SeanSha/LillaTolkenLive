import { TRANSLATION_CALL_URL } from '@lilla/shared';
import { describe, expect, it } from 'vitest';

import { buildTranslationCallRequest } from './call';

describe('translation call request', () => {
  it('authorizes the SDP exchange with the short-lived secret only', () => {
    const request = buildTranslationCallRequest('ek_browser_secret', 'v=0');
    expect(request.url).toBe(TRANSLATION_CALL_URL);
    expect(request.init.headers.Authorization).toBe('Bearer ek_browser_secret');
    expect(request.init.headers['Content-Type']).toBe('application/sdp');
    expect(request.init.body).toBe('v=0');
    expect(request.init.headers.Authorization).not.toContain('sk-');
  });
});
