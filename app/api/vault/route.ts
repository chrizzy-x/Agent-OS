import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import {
  deleteVaultSecret,
  listVaultSecrets,
  rotateVaultSecret,
  setVaultSecretStatus,
  upsertVaultSecret,
} from '@/src/vault/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') ?? undefined;
    const result = await listVaultSecrets({
      ownerAgentId: ctx.agentId,
      workspaceId,
      search: searchParams.get('search') ?? undefined,
    });

    const assignmentQuery = getSupabaseAdmin()
      .from('vault_assignments')
      .select('secret_id,subject_type,status')
      .eq('owner_agent_id', ctx.agentId)
      .eq('status', 'active');
    const scopedAssignments = workspaceId ? assignmentQuery.eq('workspace_id', workspaceId) : assignmentQuery;
    const assignmentsResult = await scopedAssignments;
    const assignments = (assignmentsResult.data ?? []) as Array<Record<string, unknown>>;
    const countsBySecret = new Map<string, { apps: number; subagents: number; workflows: number; skills: number; total: number }>();

    for (const row of assignments) {
      const secretId = String(row.secret_id ?? '');
      if (!secretId) continue;
      const subjectType = typeof row.subject_type === 'string' ? row.subject_type : '';
      const current = countsBySecret.get(secretId) ?? { apps: 0, subagents: 0, workflows: 0, skills: 0, total: 0 };
      current.total += 1;
      if (subjectType === 'app') current.apps += 1;
      if (subjectType === 'subagent') current.subagents += 1;
      if (subjectType === 'workflow') current.workflows += 1;
      if (subjectType === 'skill') current.skills += 1;
      countsBySecret.set(secretId, current);
    }

    return NextResponse.json({
      ...result,
      secrets: result.secrets.map(secret => {
        const counts = countsBySecret.get(secret.id) ?? { apps: 0, subagents: 0, workflows: 0, skills: 0, total: 0 };
        return {
          ...secret,
          assignedAppsCount: counts.apps,
          assignedSubagentsCount: counts.subagents,
          assignedWorkflowsCount: counts.workflows,
          assignedSkillsCount: counts.skills,
          assignmentCount: counts.total,
        };
      }),
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const secret = await upsertVaultSecret({
      ownerAgentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
      name: typeof body.name === 'string' ? body.name : '',
      value: typeof body.value === 'string' ? body.value : '',
    });
    return NextResponse.json({ secret }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const secretId = typeof body.secretId === 'string' ? body.secretId : '';
    if (!secretId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'secretId is required', message: 'secretId is required' }, { status: 400 });
    }

    if (action === 'disable' || action === 'enable') {
      const secret = await setVaultSecretStatus({
        ownerAgentId: ctx.agentId,
        secretId,
        status: action === 'disable' ? 'disabled' : 'active',
      });
      return NextResponse.json({ secret });
    }

    if (action === 'rotate') {
      const secret = await rotateVaultSecret({
        ownerAgentId: ctx.agentId,
        secretId,
        value: typeof body.value === 'string' ? body.value : '',
      });
      return NextResponse.json({ secret });
    }

    return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'Unsupported vault action', message: 'Unsupported vault action' }, { status: 400 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const { searchParams } = new URL(request.url);
    const secretId = searchParams.get('secretId');
    if (!secretId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'secretId is required', message: 'secretId is required' }, { status: 400 });
    }
    const result = await deleteVaultSecret({ ownerAgentId: ctx.agentId, secretId });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
