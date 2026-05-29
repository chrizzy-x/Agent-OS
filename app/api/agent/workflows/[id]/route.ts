import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// PATCH /api/agent/workflows/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = requireAgentContext(req.headers);
    const { id } = await params;

    let body: { status?: string; schedule?: string | null; name?: string };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const allowed = ['active', 'paused'];
    if (body.status && !allowed.includes(body.status)) {
      return NextResponse.json({ error: 'status must be active or paused' }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) patch.status = body.status;
    if (body.schedule !== undefined) patch.schedule = body.schedule;
    if (body.name !== undefined) patch.name = String(body.name).slice(0, 80);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agent_workflows')
      .update(patch)
      .eq('id', id)
      .eq('agent_id', ctx.agentId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });

    if (body.status !== undefined && typeof data.task_id === 'string' && data.task_id.length > 0) {
      await supabase
        .from('scheduled_tasks')
        .update({ enabled: body.status === 'active' })
        .eq('id', data.task_id)
        .eq('agent_id', ctx.agentId);
    }

    return NextResponse.json({ workflow: omitAgentIdentifierFields(data) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

// DELETE /api/agent/workflows/:id
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = requireAgentContext(req.headers);
    const { id } = await params;

    const supabase = getSupabaseAdmin();
    const { data: workflow } = await supabase
      .from('agent_workflows')
      .select('task_id')
      .eq('id', id)
      .eq('agent_id', ctx.agentId)
      .maybeSingle();

    const { error, count } = await supabase
      .from('agent_workflows')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('agent_id', ctx.agentId);

    if (error) throw error;
    if (!count) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });

    if (workflow && typeof workflow.task_id === 'string' && workflow.task_id.length > 0) {
      await supabase
        .from('scheduled_tasks')
        .update({ enabled: false })
        .eq('id', workflow.task_id)
        .eq('agent_id', ctx.agentId);
    }

    return NextResponse.json({ deleted: true });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
