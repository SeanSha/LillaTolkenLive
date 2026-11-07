import { describe, expect, it } from 'vitest';

import { formatElapsed, shouldStickToBottom } from './format';

describe('view helpers', () => {
  it('formats elapsed time', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(65_100)).toBe('01:05');
  });

  it('sticks to the bottom only when the reader is already near it', () => {
    expect(shouldStickToBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 80 })).toBe(true);
    expect(shouldStickToBottom({ scrollTop: 100, scrollHeight: 1000, clientHeight: 80 })).toBe(false);
  });
});
