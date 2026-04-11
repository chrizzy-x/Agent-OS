import { NextRequest, NextResponse } from 'next/server';
import {
  buildPasswordResetUrl,
  createPasswordResetRecord,
  createPasswordResetToken,
  shouldExposePasswordResetLink,
} from '@/src/auth/password-reset';
import { findAccountsByEmail, setPasswordResetToken } from '@/src/auth/agent-store';

export const runtime = 'nodejs';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'invalid_email', message: 'Valid email required' }, { status: 400 });
  }

  const accounts = await findAccountsByEmail(email);
  if (accounts.length > 1 || accounts.length === 0) {
    return NextResponse.json({ success: true });
  }

  const token = createPasswordResetToken();
  const record = createPasswordResetRecord(token);
  const updated = await setPasswordResetToken(email, record.token_hash, record.expires_at, record.requested_at);

  if (!updated) {
    return NextResponse.json(
      { error: 'reset_unavailable', message: 'Failed to request a reset link. Please try again.' },
      { status: 400 },
    );
  }

  const response: Record<string, unknown> = { success: true };
  if (shouldExposePasswordResetLink()) {
    response.resetUrl = buildPasswordResetUrl(email, token);
  }

  return NextResponse.json(response);
}
