import type { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from './agent-identity.js';
import { createBrowserRefreshSession, rotateBrowserRefreshSession } from './browser-sessions.js';
import { getCookieRequestContext, setAgentSessionCookies } from './session-cookie.js';

const BROWSER_ACCESS_TOKEN_TTL = '1d';

export async function issueBrowserSession(response: NextResponse, params: {
  agentId: string;
  request: NextRequest;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = createAgentToken(params.agentId, { expiresIn: BROWSER_ACCESS_TOKEN_TTL });
  const refresh = await createBrowserRefreshSession({
    agentId: params.agentId,
    headers: params.request.headers,
  });
  setAgentSessionCookies(response, {
    accessToken,
    refreshToken: refresh.refreshToken,
  }, getCookieRequestContext(params.request));
  return {
    accessToken,
    refreshToken: refresh.refreshToken,
  };
}

export async function rotateBrowserSession(response: NextResponse, params: {
  rawRefreshToken: string;
  request: NextRequest;
}): Promise<{ accessToken: string; refreshToken: string; agentId: string }> {
  const refresh = await rotateBrowserRefreshSession({
    rawToken: params.rawRefreshToken,
    headers: params.request.headers,
  });
  const accessToken = createAgentToken(refresh.session.agentId, { expiresIn: BROWSER_ACCESS_TOKEN_TTL });
  setAgentSessionCookies(response, {
    accessToken,
    refreshToken: refresh.refreshToken,
  }, getCookieRequestContext(params.request));
  return {
    accessToken,
    refreshToken: refresh.refreshToken,
    agentId: refresh.session.agentId,
  };
}
