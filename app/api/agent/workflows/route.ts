import { NextRequest, NextResponse } from 'next/server';
import { filterAccessibleResources, normalizeVisibility, resolveViewerWorkspaceIds } from '@/src/access/service';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireRouteCapability } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';
import {
  hydrateWorkflowDocument,
  syncWorkflowDocument,
  type WorkflowAuthoringMode,
} from '@/src/workflows/canonical';
import { assertWorkspaceMembership, resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';

export const runtime = 'nodejs';

function pickMode(body: Record<string, unknown>): WorkflowAuthoringMode {
  if (body.mode === 'conversation' || body.mode === 'visual' || body.mode === 'code') {
    return body.mode;
  }
  if (typeof body.code === 'string') return 'code';
  if (body.graph && typeof body.graph === 'object') return 'visual';
  return 'conversation';
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
      visibility: normalizeVisibility(row.visibility, row.published === true ? 'public' : 'private'),
      canonical_doc: hydrated.canonical,
      steps: hydrated.steps,
      graph_state: hydrated.graphState,
      code_state: hydrated.codeState,
    };
  } catch {
    return row;
  }
}

// GET /api/agent/workflows
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireRouteCapability(req.headers, 'workflows.manage');
    const supabase = getSupabaseAdmin();
    const workspaceId = new URL(req.url).searchParams.get('workspaceId');

    let query = supabase
      .from('agent_workflows')
      .select('*')
      .order('created_at', { ascending: false });
    if (workspaceId) query = query.eq('workspace_id', workspaceId);
    const { data, error } = await query;

    if (error) throw error;
    const workflows = ((data ?? []) as Record<string, unknown>[]).map(mapWorkflow) as Array<Record<string, unknown> & {
      id: string;
      agent_id: string;
      workspace_id?: string | null;
      visibility?: string | null;
    }>;
    const accessible = await filterAccessibleResources({
      viewer: {
        agentId: ctx.agentId,
        workspaceIds: await resolveViewerWorkspaceIds(ctx.agentId),
      },
      resources: workflows.map(workflow => ({
        ...workflow,
        ownerAgentId: String(workflow.agent_id),
        workspaceId: typeof workflow.workspace_id === 'string' ? workflow.workspace_id : null,
      })),
      sourceType: 'workflow',
      permission: 'workflow:execute',
    });
    return NextResponse.json({ workflows: omitAgentIdentifierFields(accessible) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

// POST /api/agent/workflows
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRouteCapability(req.headers, 'workflows.manage');

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'Invalid JSON body', message: 'Invalid JSON body' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const summary = typeof body.summary === 'string' ? body.summary : null;
    const schedule = typeof body.schedule === 'string' ? body.schedule : null;
    const mode = pickMode(body);
    if (!name) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'name is required', message: 'name is required' }, { status: 400 });
    }
    const workspaceIdInput = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
    const workspaceId = workspaceIdInput || (await resolveDefaultWorkspaceForAgent(ctx.agentId))?.id || '';
    if (!workspaceId) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'workspace is required', message: 'workspace is required' }, { status: 400 });
    }
    await assertWorkspaceMembership(workspaceId, ctx.agentId);

    const synced = syncWorkflowDocument({
      mode,
      steps: body.steps,
      graph: body.graph,
      code: typeof body.code === 'string' ? body.code : undefined,
      metadata: { source: mode, createdBy: 'workflow_api' },
    });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agent_workflows')
      .insert({
        agent_id: ctx.agentId,
        workspace_id: workspaceId,
        name: String(name).slice(0, 80),
        summary,
        steps: synced.steps,
        graph_state: synced.graphState,
        code_state: synced.codeState,
        canonical_doc: synced.canonical,
        schedule,
        visibility: body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : 'private',
        status: 'active',
        version: 1,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ workflow: omitAgentIdentifierFields(mapWorkflow(data as Record<string, unknown>)) }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
