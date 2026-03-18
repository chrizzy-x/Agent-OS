import crypto from 'crypto';
import { getPublicAppUrl } from '../config/env.js';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export type PasswordResetRecord = {
  token_hash: string;
  expires_at: string;
  requested_at: string;
};

export function createPasswordResetToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createPasswordResetRecord(token: string, now = new Date()): PasswordResetRecord {
  return {
    token_hash: hashPasswordResetToken(token),
    requested_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString(),
  };
}

export function parsePasswordResetRecord(raw: unknown): PasswordResetRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.token_hash !== 'string' ||
    typeof candidate.expires_at !== 'string' ||
    typeof candidate.requested_at !== 'string'
  ) {
    return null;
  }

  return {
    token_hash: candidate.token_hash,
    expires_at: candidate.expires_at,
    requested_at: candidate.requested_at,
  };
}

export function isPasswordResetRecordUsable(record: PasswordResetRecord, token: string, now = new Date()): boolean {
  return record.expires_at > now.toISOString() && record.token_hash === hashPasswordResetToken(token);
}

export function buildPasswordResetUrl(email: string, token: string): string {
  const url = new URL('/forgot-password', getPublicAppUrl());
  url.searchParams.set('email', email);
  url.searchParams.set('token', token);
  return url.toString();
}

export function shouldExposePasswordResetLink(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.EXPOSE_PASSWORD_RESET_LINKS === 'true';
}