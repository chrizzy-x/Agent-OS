import type { IncomingMessage, ServerResponse } from 'http';
import { extractBearerToken, verifyAgentToken } from '../auth/agent-identity.js';
import { getExternalAgentProfile } from '../external-agents/service.js';
import { NotFoundError, toErrorResponse } from '../utils/errors.js';
import { sendJson } from './http.js';

export async function handleAgentMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      sendJson(res, 401, { error: 'Authorization: Bearer <token> header required' });
      return;
    }

    const agentContext = verifyAgentToken(token);
    const profile = await getExternalAgentProfile(agentContext.agentId);
    sendJson(res, 200, profile);
  } catch (error) {
    if (error instanceof NotFoundError) {
      sendJson(res, 404, { error: error.message });
      return;
    }

    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err.message });
  }
}
