import { z } from 'zod';
import { ValidationError } from './errors.js';

// Validate and parse input against a zod schema, throwing a ValidationError on failure
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new ValidationError(`Invalid input: ${issues}`);
  }
  return result.data;
}

// Sanitize a filesystem path: remove traversal sequences, normalize slashes, strip leading slash
export function sanitizePath(path: string): string {
  // Normalize to forward slashes and collapse multiple slashes
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/');

  // Split and filter out traversal components
  const parts = normalized.split('/').filter(part => part !== '' && part !== '.');

  // Reject any path that tries to traverse upward
  for (const part of parts) {
    if (part === '..') {
      throw new ValidationError(`Path traversal attempt detected: ${path}`);
    }
  }

  return parts.join('/');
}

// Build an agent-scoped path and verify it stays within the agent's namespace
export function buildAgentPath(agentId: string, userPath: string): string {
  const sanitized = sanitizePath(userPath);
  return `${agentId}/${sanitized}`;
}

// Check that a resolved path still starts with the expected agent prefix
export function assertPathOwnership(agentId: string, resolvedPath: string): void {
  const prefix = `${agentId}/`;
  if (!resolvedPath.startsWith(prefix) && resolvedPath !== agentId) {
    throw new ValidationError(`Path escapes agent namespace: ${resolvedPath}`);
  }
}

// Common input schemas reused across primitives

export const keySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[a-zA-Z0-9_:.\-/]+$/, 'Key may only contain alphanumeric chars, underscores, colons, dots, hyphens, slashes');

export const pathSchema = z
  .string()
  .min(1)
  .max(1024);

export const sqlSchema = z
  .string()
  .min(1)
  .max(100_000);

export const urlSchema = z
  .string()
  .url()
  .max(2048);

export const headersSchema = z
  .record(z.string())
  .optional()
  .default({});

export const ttlSchema = z
  .number()
  .int()
  .min(1)
  .max(60 * 60 * 24 * 30) // max 30 days in seconds
  .optional();
