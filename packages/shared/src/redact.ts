const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]+/g,
  /ek_[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, (match) => (match.toLowerCase().startsWith('bearer') ? 'Bearer [redacted]' : '[redacted]')),
    value,
  );
}
