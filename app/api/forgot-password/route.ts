import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { hashPassword } from '@/src/auth/password';

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
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: agent } = await supabase
    .from('agents')
    .select('id, metadata')
    .eq('metadata->>email', email)
    .maybeSingle();

  if (!agent) {
    // Don't reveal whether email exists
    return NextResponse.json({ success: true });
  }

  const newHash = await hashPassword(newPassword);
  const updatedMetadata = { ...(agent.metadata as Record<string, unknown>), password_hash: newHash };

  const { error } = await supabase
    .from('agents')
    .update({ metadata: updatedMetadata })
    .eq('id', agent.id);

  if (error) {
    console.error('Password reset error:', error);
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
