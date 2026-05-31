import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireRouteCapability } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';
import { hydrateWorkflowDocument, syncWorkflowDocument, type WorkflowAuthoringMode } from '@/src/workflows/canonical';

export const runtime = 'nodejs';

function pickMode(body: Record<string, unknown>): WorkflowAuthoringMode | null {
  if (body.mode === 'conversation' || body.mode === 'visual' || body.mode === 'code') {
    return body.mode;
  }
  if (typeof body.code === 'string') return 'code';
  if (body.graph && typeof body.graph === 'object') return 'visual';
  if (Array.isArray(body.steps)) return 'conversation';
  return null;
}

function mapWorkflow(row: Record<string, unknown>): Record<string, unknown> {
  try {
    const hydrated = hydrateWorkflowDocument({
      canonicalDoc: row.canonical_doc,
      steps: row.steps,
      graphState: row.graph_state,
      codeState: typeof row.code_state === 'string' ? row.code_state : null,
    });
    return {
      ...row,
      canonical_doc: hydrated.canonical,
      steps: hydrated.steps,
      graph_state: hydrated.graphState,
      code_state: hydrated.codeState,
    };
  } catch {
    return row;
  }
}

// GET /api/agent/workflows/:id
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(req.headers, 'workflows.manage');
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('agent_workflows')
      .select('*')
      .eq('id', id)
      .eq('agent_id', ctx.agentId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'Workflow not found', message: 'Workflow not found' }, { status: 404 });
    }

    return NextResponse.json({ workflow: omitAgentIdentifierFields(mapWorkflow(data as Record<string, unknown>)) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

// PATCH /api/agent/workflows/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(req.headers, 'workflows.manage');
    const { id } = await params;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'Invalid JSON body', message: 'Invalid JSON body' }, { status: 400 });
    }

    const allowed = ['active', 'paused'];
    if (typeof body.status === 'string' && !allowed.includes(body.status)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'status must be active or paused', message: 'status must be active or paused' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from('agent_workflows')
      .select('*')
      .eq('id', id)
      .eq('agent_id', ctx.agentId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'Workflow not found', message: 'Workflow not found' }, { status: 404 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.status === 'string') patch.status = body.status;
    if (body.schedule !== undefined) patch.schedule = typeof body.schedule === 'string' ? body.schedule : null;
    if (typeof body.name === 'string') patch.name = body.name.slice(0, 80);
    if (typeof body.summary === 'string' || body.summary === null) patch.summary = body.summary;

    const mode = pickMode(body);
    if (mode) {
      const current = hydrateWorkflowDocument({
        canonicalDoc: (existing as Record<string, unknown>).canonical_doc,
        steps: (existing as Record<string, unknown>).steps,
        graphState: (existing as Record<string, unknown>).graph_state,
        codeState: typeof (existing as Record<string, unknown>).code_state === 'string' ? String((existing as Record<string, unknown>).code_state) : null,
      });
      const synced = syncWorkflowDocument({
        mode,
        steps: mode === 'conversation' ? body.steps : current.steps,
        graph: mode === 'visual' ? body.graph : current.graphState,
        code: mode === 'code' ? (typeof body.code === 'string' ? body.code : '') : current.codeState,
        metadata: {
          ...current.canonical.metadata,
          source: mode,
          updatedBy: 'workflow_api',
        },
      });
      patch.steps = synced.steps;
      patch.graph_state = synced.graphState;
      patch.code_state = synced.codeState;
      patch.canonical_doc = synced.canonical;
      patch.version = Number((existing as Record<string, unknown>).version ?? 1) + 1;
    }

    const { data, error } = await supabase
      .from('agent_workflows')
      .update(patch)
      .eq('id', id)
      .eq('agent_id', ctx.agentId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ code: 'NOT_FOUND', error: 'Workflow not found', message: 'Workflow not found' }, { status: 404 });

    if (body.status !== undefined && typeof data.task_id === 'string' && data.task_id.length > 0) {
      await supabase
        .from('scheduled_tasks')
        .update({ enabled: body.status === 'active' })
        .eq('id', data.task_id)
        .eq('agent_id', ctx.agentId);
    }

    return NextResponse.json({ workflow: omitAgentIdentifierFields(mapWorkflow(data as Record<string, unknown>)) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

// DELETE /api/agent/workflows/:id
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(req.headers, 'workflows.manage');
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
    if (!count) return NextResponse.json({ code: 'NOT_FOUND', error: 'Workflow not found', message: 'Workflow not found' }, { status: 404 });

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
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
