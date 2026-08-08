export type BrowserSigninPayload = {
  email: string;
  password: string;
  signinHint?: string | null;
};

export type BrowserSigninOptions = {
  attemptTimeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

const DEFAULT_SIGNIN_ATTEMPT_TIMEOUT_MS = 15_000;
const DEFAULT_SIGNIN_RETRIES = 1;
const DEFAULT_SIGNIN_RETRY_DELAY_MS = 400;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postSigninAttempt(payload: BrowserSigninPayload, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch('/api/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function postBrowserSignin(
  payload: BrowserSigninPayload,
  options: BrowserSigninOptions = {},
): Promise<Response> {
  const timeoutMs = Math.max(1_000, options.attemptTimeoutMs ?? DEFAULT_SIGNIN_ATTEMPT_TIMEOUT_MS);
  const retries = Math.max(0, Math.floor(options.retries ?? DEFAULT_SIGNIN_RETRIES));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_SIGNIN_RETRY_DELAY_MS);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await postSigninAttempt(payload, timeoutMs);
      if (response.ok) clearBrowserSessionLogoutBlock();
      return response;
    } catch (error) {
      if (!isAbortError(error) || attempt >= retries) throw error;
      if (retryDelayMs > 0) await delay(retryDelayMs);
    }
  }

  throw new Error('Sign-in request failed');
}
import { clearBrowserSessionLogoutBlock } from './browser-session.js';
