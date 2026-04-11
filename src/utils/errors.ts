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

export function toErrorResponse(error: unknown): { code: string; message: string; statusCode: number } {
  if (error instanceof AgentOSError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'REQUEST_FAILED',
      message: error.message || 'Request failed',
      statusCode: 400,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    statusCode: 400,
  };
}
