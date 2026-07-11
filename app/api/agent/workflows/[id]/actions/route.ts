import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireRouteCapability } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';
import { normalizeVisibility } from '@/src/access/service';
import { resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';
import { sanitizeForkableWorkflow } from '@/src/workflows/discovery';

export const runtime = 'nodejs';

function workflowTitle(row: Record<string, unknown>): string {
  return String(row.name ?? 'Public workflow').slice(0, 80);
}

function workflowSummary(row: Record<string, unknown>): string {
  return typeof row.summary === 'string' && row.summary
    ? row.summary
    : 'Shared public workflow.';
}

async function upsertLibraryItem(params: {
  ownerAgentId: string;
  workspaceId: string | null;
  sourceType: 'published_asset' | 'forked_asset';
  sourceId: string;
  name: string;
  description: string;
  href: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('library_items')
    .upsert({
      owner_agent_id: params.ownerAgentId,
      workspace_id: params.workspaceId,
      project_id: null,
      source_type: params.sourceType,
      source_id: params.sourceId,
      name: params.name,
      description: params.description,
      visibility: 'private',
      metadata: params.metadata,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_agent_id,source_type,source_id' });
  if (error) throw error;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(req.headers, 'workflows.manage');
    const { id } = await params;
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'Invalid JSON body', message: 'Invalid JSON body' }, { status: 400 });
    }
    const action = body.action;
    if (action !== 'star' && action !== 'fork') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'action must be star or fork', message: 'action must be star or fork' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: source, error: sourceError } = await supabase
      .from('agent_workflows')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (sourceError) throw sourceError;
    if (!source) return NextResponse.json({ code: 'NOT_FOUND', error: 'Workflow not found', message: 'Workflow not found' }, { status: 404 });

    const sourceRow = source as Record<string, unknown>;
    if (normalizeVisibility(sourceRow.visibility) !== 'public') {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'Only public workflows can be starred or forked from discovery.',
        message: 'Only public workflows can be starred or forked from discovery.',
      }, { status: 400 });
    }

    const sanitized = sanitizeForkableWorkflow(sourceRow);
    const title = workflowTitle(sourceRow);
    const summary = workflowSummary(sourceRow);

    if (action === 'star') {
      await upsertLibraryItem({
        ownerAgentId: ctx.agentId,
        workspaceId: null,
        sourceType: 'published_asset',
        sourceId: id,
        name: title,
        description: summary,
        href: `/workflows/${id}`,
        metadata: {
          sourceType: 'workflow',
          action: 'star',
          originalWorkflowId: id,
          monetization: 'not_monetized',
          requiresVaultConfiguration: sanitized.requiresVaultConfiguration,
          privateContextRemoved: sanitized.privateContextRemoved,
        },
      });
      return NextResponse.json({ starred: true, monetization: 'not_monetized' });
    }

    const workspace = await resolveDefaultWorkspaceForAgent(ctx.agentId);
    if (!workspace?.id) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'workspace is required before forking a workflow', message: 'workspace is required before forking a workflow' }, { status: 400 });
    }

    const { data: forked, error: forkError } = await supabase
      .from('agent_workflows')
      .insert({
        agent_id: ctx.agentId,
        workspace_id: workspace.id,
        project_id: null,
        name: `Fork of ${title}`.slice(0, 80),
        summary: `${summary} Configure your own Vault secrets before running.`,
        steps: sanitized.steps,
        graph_state: sanitized.graphState,
        code_state: sanitized.codeState,
        canonical_doc: sanitized.canonicalDoc,
        schedule: null,
        visibility: 'private',
        status: 'paused',
        version: 1,
      })
      .select()
      .single();
    if (forkError) throw forkError;

    const forkedId = String((forked as Record<string, unknown>).id);
    await upsertLibraryItem({
      ownerAgentId: ctx.agentId,
      workspaceId: workspace.id,
      sourceType: 'forked_asset',
      sourceId: forkedId,
      name: String((forked as Record<string, unknown>).name ?? `Fork of ${title}`),
      description: String((forked as Record<string, unknown>).summary ?? summary),
      href: `/workflows/${forkedId}`,
      metadata: {
        sourceType: 'workflow',
        action: 'fork',
        originalWorkflowId: id,
        monetization: 'not_monetized',
        requiresVaultConfiguration: sanitized.requiresVaultConfiguration,
        privateContextRemoved: sanitized.privateContextRemoved,
      },
    });

    return NextResponse.json({
      forked: true,
      workflow: omitAgentIdentifierFields(forked as Record<string, unknown>),
      monetization: 'not_monetized',
      privacy: 'Forked workflow is private and does not include source Vault secrets or private project context.',
    }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
