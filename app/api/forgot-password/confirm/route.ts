import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { hashPassword } from '@/src/auth/password';
import { isPasswordResetRecordUsable, parsePasswordResetRecord } from '@/src/auth/password-reset';

export const runtime = 'nodejs';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: 'Reset token required' }, { status: 400 });
  }

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: agents, error: lookupError, count } = await supabase
    .from('agents')
    .select('id, metadata', { count: 'exact' })
    .eq('metadata->>email', email)
    .limit(2);

  if (lookupError) {
    console.error('Password reset confirm lookup error:', lookupError);
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 });
  }

  if ((count ?? agents?.length ?? 0) !== 1 || !agents?.[0]) {
    return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
  }

  const agent = agents[0];
  const metadata = ((agent.metadata as Record<string, unknown> | null | undefined) ?? {});
  const record = parsePasswordResetRecord(metadata.password_reset);

  if (!record || !isPasswordResetRecordUsable(record, token)) {
    return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
  }

  const updatedMetadata: Record<string, unknown> = { ...metadata, password_hash: await hashPassword(newPassword) };
  delete updatedMetadata.password_reset;

  const { error: updateError } = await supabase
    .from('agents')
    .update({ metadata: updatedMetadata })
    .eq('id', agent.id);

  if (updateError) {
    console.error('Password reset confirm error:', updateError);
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
