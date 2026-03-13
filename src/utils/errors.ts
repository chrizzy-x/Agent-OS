// Custom error hierarchy for AgentOS - each error type maps to a specific failure mode

export class AgentOSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AgentOSError';
  }
}

// Agent attempted an operation that would exceed their allocated quota
export class QuotaError extends AgentOSError {
  constructor(message: string) {
    super(message, 'QUOTA_EXCEEDED', 429);
    this.name = 'QuotaError';
  }
}

// Request was blocked due to a security policy violation
export class SecurityError extends AgentOSError {
  constructor(message: string) {
    super(message, 'SECURITY_VIOLATION', 403);
    this.name = 'SecurityError';
  }
}

// Requested resource does not exist
export class NotFoundError extends AgentOSError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

// Agent lacks permission for the requested operation
export class PermissionError extends AgentOSError {
  constructor(message: string) {
    super(message, 'PERMISSION_DENIED', 403);
    this.name = 'PermissionError';
  }
}

// Input validation failed
export class ValidationError extends AgentOSError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

// Authentication token is missing or invalid
export class AuthError extends AgentOSError {
  constructor(message: string) {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'AuthError';
  }
}

// Rate limit exceeded
export class RateLimitError extends AgentOSError {
  constructor(message: string) {
    super(message, 'RATE_LIMITED', 429);
    this.name = 'RateLimitError';
  }
}

// Serialize any error to a safe JSON-compatible response object
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
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    statusCode: 500,
  };
}
