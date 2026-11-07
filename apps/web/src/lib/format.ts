export function formatElapsed(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatOptionalMs(value: number | null, empty = '—'): string {
  if (value == null) {
    return empty;
  }
  return `${Math.round(value)} ms`;
}

export function shouldStickToBottom(
  element: { scrollTop: number; scrollHeight: number; clientHeight: number },
  threshold = 80,
): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}
