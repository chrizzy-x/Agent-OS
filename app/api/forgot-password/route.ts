import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import {
  buildPasswordResetUrl,
  createPasswordResetRecord,
  createPasswordResetToken,
  shouldExposePasswordResetLink,
} from '@/src/auth/password-reset';

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
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: agents, error: lookupError, count } = await supabase
    .from('agents')
    .select('id, metadata', { count: 'exact' })
    .eq('metadata->>email', email)
    .limit(2);

  if (lookupError) {
    console.error('[forgot-password] lookup error:', lookupError);
    return NextResponse.json({ error: 'Failed to request a reset link. Please try again.' }, { status: 500 });
  }

  if ((count ?? agents?.length ?? 0) > 1) {
    console.error(`[forgot-password] duplicate agent accounts detected for email ${email}; refusing password reset request.`);
    return NextResponse.json({ success: true });
  }

  if (!agents?.[0]) {
    return NextResponse.json({ success: true });
  }

  const agent = agents[0];
  const token = createPasswordResetToken();
  const updatedMetadata = {
    ...((agent.metadata as Record<string, unknown> | null | undefined) ?? {}),
    password_reset: createPasswordResetRecord(token),
  };

  const { error: updateError } = await supabase
    .from('agents')
    .update({ metadata: updatedMetadata })
    .eq('id', agent.id);

  if (updateError) {
    console.error('[forgot-password] request error:', updateError);
    return NextResponse.json({ error: 'Failed to request a reset link. Please try again.' }, { status: 500 });
  }

  const response: Record<string, unknown> = { success: true };
  if (shouldExposePasswordResetLink()) {
    response.resetUrl = buildPasswordResetUrl(email, token);
  }

  return NextResponse.json(response);
}
