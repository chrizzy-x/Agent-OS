import type { IncomingMessage, ServerResponse } from 'http';
import { registerExternalAgent } from '../external-agents/service.js';
import { toErrorResponse, ValidationError } from '../utils/errors.js';
import { readJsonBody, sendJson } from './http.js';

export async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const result = await registerExternalAgent(body);
    sendJson(res, 200, {
      token: result.token,
      expiresIn: result.expiresIn,
      allowedDomains: result.allowedDomains,
      allowedTools: result.allowedTools,
      mcpEndpoint: result.mcpEndpoint,
      toolsEndpoint: result.toolsEndpoint,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    const status = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : undefined;

    if (status === 409 || error instanceof Error && error.message === 'Agent already registered') {
      sendJson(res, 409, { error: 'Agent name already registered' });
      return;
    }

    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err.message === 'An unexpected error occurred' ? 'Registration failed' : err.message });
  }
}
