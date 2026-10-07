/** JSON is untrusted until each boundary has checked its own fields. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isWord(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= 100
  );
}
