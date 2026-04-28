import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getExternalAgentRegistration } from '@/src/external-agents/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse, NotFoundError, PermissionError } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = requireAgentContext(request.headers);
    const { id } = await params;

    const registration = await getExternalAgentRegistration(id);
    if (!registration) {
      throw new NotFoundError(`Agent '${id}' not found`);
    }
    if (registration.owner_email !== ctx.agentId.toLowerCase()) {
      throw new PermissionError('Access denied');
    }

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('audit_logs')
      .select('primitive, operation, success, duration_ms, error, created_at')
      .eq('agent_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({ agentId: id, activity: data ?? [] });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
