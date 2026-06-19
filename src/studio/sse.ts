export type StudioStreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

export function parseStudioSseFrames(input: string): {
  events: StudioStreamEvent[];
  remainder: string;
} {
  const normalized = input.replace(/\r\n/g, '\n');
  const frames = normalized.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events = frames.flatMap(frame => {
    let event = 'message';
    const dataLines: string[] = [];

    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) return [];
    try {
      const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
      return [{ event, data }];
    } catch {
      return [];
    }
  });

  return { events, remainder };
}

export async function consumeStudioSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: StudioStreamEvent) => void | Promise<void>,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parsed = parseStudioSseFrames(done ? `${buffer}\n\n` : buffer);
    buffer = parsed.remainder;

    for (const event of parsed.events) {
      await onEvent(event);
    }

    if (done) break;
  }
}
