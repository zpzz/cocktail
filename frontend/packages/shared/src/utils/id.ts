export function createThreadId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `thread-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
