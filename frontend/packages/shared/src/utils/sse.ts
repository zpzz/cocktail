export type SseEventHandler = (event: unknown) => void;

function extractDataLines(block: string): string[] {
  return block
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(line.startsWith('data: ') ? 6 : 5));
}

export function consumeSseBuffer(
  buffer: string,
  onEvent: SseEventHandler,
): string {
  const parts = buffer.split('\n\n');
  const leftover = parts.pop() ?? '';
  for (const part of parts) {
    for (const payload of extractDataLines(part)) {
      if (!payload || payload === '[DONE]') {
        continue;
      }
      onEvent(JSON.parse(payload) as unknown);
    }
  }
  return leftover;
}

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: SseEventHandler,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = consumeSseBuffer(buffer, onEvent);
    }
    buffer += decoder.decode();
    consumeSseBuffer(`${buffer}\n\n`, onEvent);
  } finally {
    reader.releaseLock();
  }
}
