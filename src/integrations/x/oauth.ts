import crypto from 'crypto';
import {
  getXClientId,
  getXClientSecret,
  getXOAuthScopes,
  getXRedirectUri,
} from '../../config/env.js';
import { ValidationError } from '../../utils/errors.js';
import { openJson, sealJson } from './crypto.js';
import type { XTokenResponse } from './types.js';

export const X_OAUTH_STATE_COOKIE = 'x_oauth_state';
const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';

export interface XOAuthStatePayload {
  state: string;
  codeVerifier: string;
  ownerAgentId: string;
  redirectTo: string;
  issuedAt: string;
}

function createPkceCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url');
}

function createPkceCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

function summarizeTokenError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Unknown X token error';
  }

  const record = payload as Record<string, unknown>;
  return String(record.error_description ?? record.detail ?? record.error ?? 'Unknown X token error');
}

function buildTokenRequestBody(params: Record<string, string | undefined>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 0) {
      body.set(key, value);
    }
  }
  return body.toString();
}

export function buildXAuthorizationUrl(params: {
  ownerAgentId: string;
  redirectTo?: string;
}): { authorizationUrl: string; cookieValue: string; state: string } {
  const state = crypto.randomBytes(18).toString('base64url');
  const codeVerifier = createPkceCodeVerifier();
  const url = new URL(X_AUTHORIZE_URL);

  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', getXClientId());
  url.searchParams.set('redirect_uri', getXRedirectUri());
  url.searchParams.set('scope', getXOAuthScopes().join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', createPkceCodeChallenge(codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');

  const payload: XOAuthStatePayload = {
    state,
    codeVerifier,
    ownerAgentId: params.ownerAgentId,
    redirectTo: params.redirectTo ?? '/dashboard',
    issuedAt: new Date().toISOString(),
  };

  return {
    authorizationUrl: url.toString(),
    cookieValue: sealJson(payload),
    state,
  };
}

export function parseXOAuthStateCookie(cookieValue: string | undefined): XOAuthStatePayload | null {
  if (!cookieValue) return null;
  try {
    return openJson<XOAuthStatePayload>(cookieValue);
  } catch {
    return null;
  }
}

async function parseTokenResponse(response: Response): Promise<XTokenResponse> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ValidationError(`X OAuth request failed: ${summarizeTokenError(payload)}`);
  }

  if (!payload || typeof payload !== 'object' || typeof (payload as Record<string, unknown>).access_token !== 'string') {
    throw new ValidationError('X OAuth response did not include an access token');
  }

  return payload as XTokenResponse;
}

export async function exchangeCodeForXTokens(params: {
  code: string;
  codeVerifier: string;
}): Promise<XTokenResponse> {
  const clientId = getXClientId();
  const clientSecret = getXClientSecret();
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const response = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers,
    body: buildTokenRequestBody({
      code: params.code,
      grant_type: 'authorization_code',
      client_id: clientSecret ? undefined : clientId,
      redirect_uri: getXRedirectUri(),
      code_verifier: params.codeVerifier,
    }),
  });

  return parseTokenResponse(response);
}

export async function refreshXAccessToken(refreshToken: string): Promise<XTokenResponse> {
  if (!refreshToken) {
    throw new ValidationError('X refresh token is required');
  }

  const clientId = getXClientId();
  const clientSecret = getXClientSecret();
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const response = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers,
    body: buildTokenRequestBody({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_id: clientSecret ? undefined : clientId,
    }),
  });

  return parseTokenResponse(response);
}