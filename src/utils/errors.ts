import { redactSecretsInString } from '../security/secret-redaction.js';

// Custom error hierarchy for AgentOS - each error type maps to a specific failure mode

export class AgentOSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AgentOSError';
  }
}

export class QuotaError extends AgentOSError {
  constructor(message: string) {
    super(message, 'QUOTA_EXCEEDED', 429);
    this.name = 'QuotaError';
  }
}

export class SecurityError extends AgentOSError {
  constructor(message: string) {
    super(message, 'SECURITY_VIOLATION', 403);
    this.name = 'SecurityError';
  }
}

export class NotFoundError extends AgentOSError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class PermissionError extends AgentOSError {
  constructor(message: string) {
    super(message, 'PERMISSION_DENIED', 403);
    this.name = 'PermissionError';
  }
}

export class AppUnavailableError extends AgentOSError {
  constructor(message: string) {
    super(message, 'APP_UNAVAILABLE', 409);
    this.name = 'AppUnavailableError';
  }
}

export class ValidationError extends AgentOSError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class AuthError extends AgentOSError {
  constructor(message: string) {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends AgentOSError {
  constructor(message: string) {
    super(message, 'RATE_LIMITED', 429);
    this.name = 'RateLimitError';
  }
}

export type DiagnosticErrorResponse = {
  code: string;
  message: string;
  statusCode: number;
  whatFailed: string;
  why: string;
  where: string;
  possibleFix: string;
};

function buildDiagnostic(params: {
  code: string;
  message: string;
  statusCode: number;
  where: string;
  why?: string;
}): DiagnosticErrorResponse {
  const message = redactSecretsInString(params.message);
  return {
    code: params.code,
    message,
    statusCode: params.statusCode,
    whatFailed: message,
    why: redactSecretsInString(params.why ?? message),
    where: params.where,
    possibleFix: params.statusCode >= 500
      ? 'Retry the action, then inspect execution logs if it fails again.'
      : 'Review the request input, permissions, and connected account state before retrying.',
  };
}

export function toErrorResponse(error: unknown): DiagnosticErrorResponse {
  if (error instanceof AgentOSError) {
    return buildDiagnostic({
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      where: error.name,
    });
  }

  if (error instanceof Error) {
    return buildDiagnostic({
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
      statusCode: 500,
      where: error.name || 'Runtime',
      why: 'The server hit an unexpected failure while processing the request.',
    });
  }

  return buildDiagnostic({
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    statusCode: 500,
    where: 'Runtime',
  });
}
