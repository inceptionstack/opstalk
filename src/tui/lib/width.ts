export function safeWidth(value: number | undefined, fallback = 80): number {
  if (!value || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return value;
}
