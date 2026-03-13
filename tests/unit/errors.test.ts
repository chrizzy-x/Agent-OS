import { describe, it, expect } from 'vitest';
import {
  AgentOSError,
  QuotaError,
  SecurityError,
  NotFoundError,
  PermissionError,
  ValidationError,
  AuthError,
  RateLimitError,
  toErrorResponse,
} from '../../src/utils/errors.js';

describe('error classes', () => {
  it('QuotaError has correct code and status', () => {
    const err = new QuotaError('limit exceeded');
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.statusCode).toBe(429);
    expect(err).toBeInstanceOf(AgentOSError);
  });

  it('SecurityError has correct code and status', () => {
    const err = new SecurityError('blocked');
    expect(err.code).toBe('SECURITY_VIOLATION');
    expect(err.statusCode).toBe(403);
  });

  it('NotFoundError has correct code and status', () => {
    const err = new NotFoundError('not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('AuthError has correct code and status', () => {
    const err = new AuthError('bad token');
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.statusCode).toBe(401);
  });

  it('RateLimitError has correct code and status', () => {
    const err = new RateLimitError('slow down');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.statusCode).toBe(429);
  });
});

describe('toErrorResponse', () => {
  it('serializes AgentOSError correctly', () => {
    const err = new NotFoundError('file missing');
    const resp = toErrorResponse(err);
    expect(resp).toEqual({
      code: 'NOT_FOUND',
      message: 'file missing',
      statusCode: 404,
    });
  });

  it('sanitizes generic Error (does not leak message)', () => {
    const err = new Error('internal details');
    const resp = toErrorResponse(err);
    expect(resp.code).toBe('INTERNAL_ERROR');
    expect(resp.message).not.toContain('internal details');
    expect(resp.statusCode).toBe(500);
  });

  it('handles non-Error values', () => {
    const resp = toErrorResponse('string error');
    expect(resp.code).toBe('UNKNOWN_ERROR');
    expect(resp.statusCode).toBe(500);
  });
});
