export type AgentOSFetch = typeof fetch;

export type AgentOSClientOptions = {
  baseUrl?: string;
  fetch?: AgentOSFetch;
  headers?: HeadersInit;
};

export class AgentOSClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: AgentOSFetch;
  private readonly headers: HeadersInit;

  constructor(options: AgentOSClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? fetch;
    this.headers = options.headers ?? {};
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...this.headers,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    const payload = await response.json().catch(() => ({})) as T & { error?: string; message?: string };
    if (!response.ok) {
      throw new Error(payload.message ?? payload.error ?? `Request failed: ${response.status}`);
    }
    return payload;
  }
}

export function createAgentOSClient(options: AgentOSClientOptions = {}): AgentOSClient {
  return new AgentOSClient(options);
}
