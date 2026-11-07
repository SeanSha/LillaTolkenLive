export const CLASSROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CLASSROOM_CODE_LENGTH = 6;
export const MAX_CLASSROOM_STUDENTS = 12;
export const MAX_TRANSCRIPT_CHARS = 100_000;

export function generateClassroomCode(
  randomInt: (maxExclusive: number) => number,
  length = CLASSROOM_CODE_LENGTH,
): string {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    const choice = randomInt(CLASSROOM_CODE_ALPHABET.length);
    code += CLASSROOM_CODE_ALPHABET[choice] ?? 'A';
  }
  return code;
}

export function normalizeClassroomCode(input: string): string {
  return [...input.toUpperCase()]
    .filter((character) => CLASSROOM_CODE_ALPHABET.includes(character))
    .join('')
    .slice(0, CLASSROOM_CODE_LENGTH);
}

export function isClassroomCode(input: string): boolean {
  return (
    input.length === CLASSROOM_CODE_LENGTH &&
    [...input].every((character) => CLASSROOM_CODE_ALPHABET.includes(character))
  );
}

export function tailText(text: string, max = MAX_TRANSCRIPT_CHARS): string {
  if (text.length <= max) {
    return text;
  }
  return text.slice(text.length - max);
}
