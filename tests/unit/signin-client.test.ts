import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasExistingBrowserSigninSession, postBrowserSignin } from '../../src/auth/signin-client.js';

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

describe('signin client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries once when the sign-in request is aborted by the client timeout', async () => {
    const response = new Response(JSON.stringify({ success: true }), { status: 200 });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await postBrowserSignin({
      email: 'user@example.com',
      password: 'password',
      signinHint: 'hint',
    }, {
      retries: 1,
      retryDelayMs: 0,
    });

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/signin', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password', signinHint: 'hint' }),
    }));
  });

  it('does not retry non-timeout sign-in failures', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postBrowserSignin({
      email: 'user@example.com',
      password: 'password',
    })).rejects.toThrow('network down');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checks existing sign-in state without refreshing the browser session', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(hasExistingBrowserSigninSession()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/session?optional=1', {
      cache: 'no-store',
      credentials: 'include',
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/session/refresh', expect.anything());
  });
});
