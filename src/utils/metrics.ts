// Lightweight metrics utilities — timing and counters for observability

// Measure how long an async operation takes and return both the result and duration
export async function timed<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

// Simple in-memory counter map — useful for tracking call counts within a request
export class Counter {
  private counts = new Map<string, number>();

  increment(key: string, amount = 1): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + amount);
  }

  get(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  toObject(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
}

// Format bytes into a human-readable string
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
