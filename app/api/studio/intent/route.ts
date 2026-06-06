import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { capabilityMessage, hasCapability } from '@/src/auth/capabilities';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { registerExternalAgent } from '@/src/external-agents/service';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { executeStudioCommand } from '@/src/studio/service';
import { generateStudioChatReply, formatExecutionReply } from '@/src/studio/conversation';
import { tokenDel, tokenGet, tokenSet, TOKEN_TTL_SECONDS } from '@/src/studio/confirm-tokens';
import { detectAgentOSIntent, humanStatusForIntent, isWorkflowIntent, translateMessageToStudioCommand, type AgentOSIntent } from '@/src/studio/intents';
import { withStudioDefaultAllowedDomains } from '@/src/studio/domains';
import { callClaude, tokenDel as legacyTokenDel, tokenGet as legacyTokenGet } from '@/src/studio/planner';
import { appendStudioEvent, appendStudioMessage, getStudioSessionBundle, updateStudioSession } from '@/src/studio/persistence';
import { syncWorkflowDocument } from '@/src/workflows/canonical';
import { resolveProjectForWorkspace, createProject, updateProject } from '@/src/projects/service';
import { listVaultSecrets } from '@/src/vault/service';
import { toErrorResponse } from '@/src/utils/errors';
import { sanitizeErrorMessage, sanitizeOutput } from '@/src/utils/output-sanitizer';
import { createPrivateSubagent } from '@/src/subagents/service';
import { listAgentApps } from '@/src/appstore/service';

export const runtime = 'nodejs';

type WorkflowPlan = {
  summary: string;
  steps: Array<{ order: number; tool: string; input: Record<string, unknown>; description: string }>;
  schedule: string | null;
};

type PendingStudioAction =
  | {
    type: 'studio_command';
    agentId: string;
    sessionId: string | null;
    command: string;
    innerConfirmToken: string;
    intent: AgentOSIntent;
  }
  | {
    type: 'workflow_plan';
    agentId: string;
    sessionId: string | null;
    workspaceId: string | null;
    projectId: string | null;
    workflowName: string;
    plan: WorkflowPlan;
    intent: AgentOSIntent;
  }
  | {
    type: 'project_create';
    agentId: string;
    sessionId: string | null;
    workspaceId: string;
    name: string;
    description: string | null;
    intent: AgentOSIntent;
  }
  | {
    type: 'project_update';
    agentId: string;
    sessionId: string | null;
    projectId: string;
    name?: string;
    status?: 'active' | 'archived';
    intent: AgentOSIntent;
  }
  | {
    type: 'subagent_create';
    agentId: string;
    sessionId: string | null;
    workspaceId: string;
    projectId: string | null;
    name: string;
    intent: AgentOSIntent;
  };

const READ_ONLY_INTENT_TOOLS = new Set([
  'net_http_get',
  'net_dns_resolve',
  'mem_get',
  'mem_list',
  'mem_recall',
  'db_query',
  'fs_read',
  'fs_list',
  'events_subscribe',
]);

function normalizeToolName(tool: string): string {
  return tool.replace(/^agentos\./, '');
}

function shouldPersistWorkflow(plan: WorkflowPlan): boolean {
  if (plan.schedule) return true;
  return plan.steps.some(step => !READ_ONLY_INTENT_TOOLS.has(normalizeToolName(step.tool)));
}

function parseJsonBody(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatNaturalAnswer(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const payload = value as Record<string, unknown>;
    const bitcoin = payload.bitcoin as { usd?: unknown } | undefined;
    const ethereum = payload.ethereum as { usd?: unknown } | undefined;

    if (typeof bitcoin?.usd === 'number') return `Bitcoin is $${bitcoin.usd.toLocaleString('en-US')} USD.`;
    if (typeof ethereum?.usd === 'number') return `Ethereum is $${ethereum.usd.toLocaleString('en-US')} USD.`;
  }

  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function buildStudioAnswer(results: unknown[]): string | null {
  const last = [...results].reverse().find(item => {
    if (!item || typeof item !== 'object') return false;
    const result = (item as { result?: unknown }).result;
    return Boolean(result && typeof result === 'object' && 'body' in (result as Record<string, unknown>));
  }) ?? results.at(-1);
  if (!last || typeof last !== 'object') return null;

  const result = (last as { result?: unknown }).result;
  if (!result || typeof result !== 'object') return result === undefined ? null : JSON.stringify(result, null, 2);
  const payload = result as Record<string, unknown>;
  if ('body' in payload) {
    const parsed = parseJsonBody(payload.body);
    return formatNaturalAnswer(parsed);
  }
  return formatNaturalAnswer(result);
}

function findScheduledTaskId(results: unknown[]): string | null {
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const result = (item as { result?: unknown }).result;
    if (!result || typeof result !== 'object') continue;
    const taskId = (result as { taskId?: unknown }).taskId;
    if (typeof taskId === 'string' && taskId.length > 0) return taskId;
  }
  return null;
}

function restrictedStudioCapability(instruction: string): 'access_sdk' | 'create_app' | 'create_skill' | null {
  const lower = instruction.toLowerCase();
  if (/\b(sdk|developer console|manifest|webhook|publishing panel)\b/.test(lower)) return 'access_sdk';
  if (/\b(create|build|publish|submit|package|convert)\b.*\bapp\b|\bapp\b.*\b(create|publish|submit|manifest)\b/.test(lower)) return 'create_app';
  if (/\b(create|build|publish|submit)\b.*\bskill\b|\bskill\b.*\b(create|publish|submit)\b/.test(lower)) return 'create_skill';
  return null;
}

function parseProjectAction(message: string, projectId: string | null): { kind: 'create' | 'rename' | 'archive'; name?: string } | null {
  const createMatch = message.match(/\bcreate project\s+(.+)$/i);
  if (createMatch) return { kind: 'create', name: createMatch[1].trim() };
  const renameMatch = message.match(/\brename project(?:\s+to)?\s+(.+)$/i);
  if (renameMatch && projectId) return { kind: 'rename', name: renameMatch[1].trim() };
  if (/\barchive project\b/i.test(message) && projectId) return { kind: 'archive' };
  return null;
}

function parseCreateAgentName(message: string): string | null {
  const match = message.match(/\bcreate(?:\s+private)?\s+(?:agent|subagent)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function parseInspectReference(message: string, subject: 'app' | 'skill'): string | null {
  const match = message.match(new RegExp(`\\b(?:inspect|open|show)\\s+${subject}\\s+(.+)$`, 'i'));
  return match?.[1]?.trim() || null;
}

function parsePublishWorkflowReference(message: string): string | null {
  const match = message.match(/\bpublish workflow(?:\s+(.+))?$/i);
  return match?.[1]?.trim() || null;
}

function parseSaveResultLabel(message: string): string | null {
  const match = message.match(/\bsave result(?:\s+(?:as|to)\s+(.+))?$/i);
  return match?.[1]?.trim() || null;
}

function isStoreNavigationRequest(message: string, target: 'appstore' | 'skillstore' | 'marketplace'): boolean {
  if (target === 'appstore') return /\b(open|show|browse)\b.*\b(app store|appstore)\b/i.test(message);
  if (target === 'skillstore') return /\b(open|show|browse)\b.*\b(skill store|skills store|skills marketplace|skill marketplace)\b/i.test(message);
  return /\b(open|show|browse)\b.*\bmarketplace\b/i.test(message);
}

function parseRouteTarget(message: string): { kind: 'app' | 'skill' | 'workflow'; reference: string | null } | null {
  const match = message.match(/\broute\b.+\bthrough\b\s+(app|skill|workflow)(?:\s+(.+))?$/i);
  if (!match) return null;
  return {
    kind: match[1].toLowerCase() as 'app' | 'skill' | 'workflow',
    reference: match[2]?.trim() || null,
  };
}

async function findSkillRecord(reference: string): Promise<{ id: string; name: string; slug: string } | null> {
  const supabase = getSupabaseAdmin();
  const needle = reference.trim();
  if (!needle) return null;

  const exact = await supabase
    .from('skills')
    .select('id,name,slug')
    .or(`slug.eq.${needle},id.eq.${needle}`)
    .limit(1)
    .maybeSingle();

  if (!exact.error && exact.data) {
    return {
      id: String(exact.data.id),
      name: String(exact.data.name ?? exact.data.slug ?? 'Skill'),
      slug: String(exact.data.slug ?? exact.data.id),
    };
  }

  const fallback = await supabase
    .from('skills')
    .select('id,name,slug')
    .ilike('name', `%${needle}%`)
    .limit(1)
    .maybeSingle();

  if (fallback.error || !fallback.data) return null;
  return {
    id: String(fallback.data.id),
    name: String(fallback.data.name ?? fallback.data.slug ?? 'Skill'),
    slug: String(fallback.data.slug ?? fallback.data.id),
  };
}

async function findWorkflowRecord(params: {
  agentId: string;
  projectId: string | null;
  reference?: string | null;
}): Promise<{ id: string; name: string } | null> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('agent_workflows')
    .select('id,name,project_id,updated_at')
    .eq('agent_id', params.agentId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (params.projectId) {
    query = query.eq('project_id', params.projectId);
  }

  const { data, error } = await query;
  if (error) return null;
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    name: String(row.name ?? 'Workflow'),
  }));

  if (!params.reference) return rows[0] ?? null;
  const needle = params.reference.toLowerCase();
  return rows.find(row => row.name.toLowerCase().includes(needle) || row.id === params.reference) ?? null;
}

async function findAppRecord(params: {
  agentId: string;
  workspaceId: string | null;
  reference: string;
}): Promise<{ id: string; name: string; slug: string } | null> {
  const apps = await listAgentApps({
    viewerAgentId: params.agentId,
    viewerWorkspaceIds: params.workspaceId ? [params.workspaceId] : undefined,
    includeHidden: true,
    search: params.reference,
    sort: 'recent',
  });
  const needle = params.reference.toLowerCase();
  const match = apps.find(app => app.slug === params.reference || app.name.toLowerCase().includes(needle));
  return match ? { id: match.id, name: match.name, slug: match.slug } : null;
}

async function recordStudioTurn(agentId: string, sessionId: string | undefined | null, role: 'user' | 'assistant', content: string): Promise<void> {
  if (!sessionId) return;
  try {
    await appendStudioMessage({ ownerAgentId: agentId, sessionId, role, content });
  } catch {
    // Non-fatal for conversation flow.
  }
}

async function recordStudioEvent(agentId: string, sessionId: string | undefined | null, type: Parameters<typeof appendStudioEvent>[0]['type'], payload: Record<string, unknown>): Promise<void> {
  if (!sessionId) return;
  try {
    await appendStudioEvent({ ownerAgentId: agentId, sessionId, type, payload });
  } catch {
    // Non-fatal for conversation flow.
  }
}

async function resolveSessionContext(agentId: string, sessionId: string | undefined | null): Promise<{
  workspaceId: string | null;
  projectId: string | null;
  title: string | null;
}> {
  if (!sessionId) return { workspaceId: null, projectId: null, title: null };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_sessions')
    .select('workspace_id,project_id,title')
    .eq('id', sessionId)
    .eq('owner_agent_id', agentId)
    .maybeSingle();
  if (error || !data) return { workspaceId: null, projectId: null, title: null };
  return {
    workspaceId: typeof data.workspace_id === 'string' ? data.workspace_id : null,
    projectId: typeof data.project_id === 'string' ? data.project_id : null,
    title: typeof data.title === 'string' ? data.title : null,
  };
}

async function loadContextNames(workspaceId: string | null, projectId: string | null): Promise<{
  workspaceName: string | null;
  projectName: string | null;
}> {
  const supabase = getSupabaseAdmin();
  const [workspaceResult, projectResult] = await Promise.all([
    workspaceId
      ? supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    projectId
      ? supabase.from('projects').select('name').eq('id', projectId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  return {
    workspaceName: workspaceResult.data && typeof workspaceResult.data.name === 'string' ? workspaceResult.data.name : null,
    projectName: projectResult.data && typeof projectResult.data.name === 'string' ? projectResult.data.name : null,
  };
}

async function executeWorkflowPlan(params: {
  ctx: Awaited<ReturnType<typeof requireRouteCapability>>;
  sessionId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  workflowName: string;
  plan: WorkflowPlan;
  intent: AgentOSIntent;
}) {
  const studioCtx = withStudioDefaultAllowedDomains({ ...params.ctx, studioSessionId: params.sessionId });
  await recordStudioEvent(params.ctx.agentId, params.sessionId, 'task_started', {
    summary: params.plan.summary,
    stepCount: params.plan.steps.length,
  });

  const results: unknown[] = [];
  for (const step of params.plan.steps.sort((a, b) => a.order - b.order)) {
    const toolName = step.tool.replace(/^agentos\./, '');

    if (step.tool === 'agentos.agent_deploy') {
      const agentName = typeof step.input.name === 'string' && step.input.name.trim() ? step.input.name.trim() : 'Studio Agent';
      const desc = typeof step.input.description === 'string' ? step.input.description : null;
      const suffix = crypto.randomBytes(4).toString('hex');
      const agentId = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) + '-' + suffix;
      const deployResult = await registerExternalAgent({
        agentId,
        name: agentName,
        description: desc,
        ownerEmail: params.ctx.agentId,
        allowedDomains: ['*'],
        allowedTools: [],
      });
      results.push({ step: step.order, tool: 'agent_deploy', result: { token: deployResult.token, message: 'Agent deployed successfully' } });
      continue;
    }

    await recordStudioEvent(params.ctx.agentId, params.sessionId, 'task_progress', { step: step.order, tool: toolName });
    const result = await executeUniversalToolCall({
      agentContext: studioCtx,
      name: step.tool,
      server: undefined,
      arguments: step.input,
    });
    results.push({ step: step.order, tool: toolName, result });
  }

  const answer = buildStudioAnswer(results);
  const taskId = findScheduledTaskId(results);
  const publicResults = sanitizeOutput(results);
  const publicAnswer = answer ? sanitizeErrorMessage(answer) : null;
  let workflowId: string | null = null;

  if (shouldPersistWorkflow(params.plan)) {
    const supabase = getSupabaseAdmin();
    const workflowSync = syncWorkflowDocument({
      mode: 'conversation',
      steps: params.plan.steps,
      metadata: { source: 'studio_conversation_workflow' },
    });
    const { data: workflow } = await supabase
      .from('agent_workflows')
      .insert({
        agent_id: params.ctx.agentId,
        workspace_id: params.workspaceId,
        project_id: params.projectId,
        name: params.workflowName,
        summary: params.plan.summary,
        steps: workflowSync.steps,
        graph_state: workflowSync.graphState,
        code_state: workflowSync.codeState,
        canonical_doc: workflowSync.canonical,
        schedule: params.plan.schedule,
        task_id: taskId,
        last_result: publicAnswer ? { answer: publicAnswer, results: publicResults } : { results: publicResults },
        last_run_at: new Date().toISOString(),
        status: 'active',
      })
      .select('id')
      .single();
    workflowId = workflow?.id ?? null;

    if (workflowId && taskId) {
      await supabase
        .from('scheduled_tasks')
        .update({ workflow_id: workflowId })
        .eq('id', taskId)
        .eq('agent_id', params.ctx.agentId);
    }
  }

  await recordStudioEvent(params.ctx.agentId, params.sessionId, 'task_completed', {
    workflowId,
    schedule: params.plan.schedule,
  });

  const reply = publicAnswer ?? `${params.plan.summary}\nDone.`;
  await recordStudioTurn(params.ctx.agentId, params.sessionId, 'assistant', reply);

  return NextResponse.json({
    kind: 'completed',
    intent: params.intent,
    statusText: 'Done.',
    reply,
    executed: true,
    results: publicResults,
    answer: reply,
    workflowId,
    schedule: params.plan.schedule,
  });
}

async function executePendingAction(params: {
  ctx: Awaited<ReturnType<typeof requireRouteCapability>>;
  pending: PendingStudioAction;
}) {
  if (params.pending.type === 'studio_command') {
    const result = await executeStudioCommand({
      agentContext: withStudioDefaultAllowedDomains({ ...params.ctx, studioSessionId: params.pending.sessionId }),
      command: params.pending.command,
      confirmToken: params.pending.innerConfirmToken,
    });
    const reply = formatExecutionReply(result.summary, result.result);
    await recordStudioTurn(params.ctx.agentId, params.pending.sessionId, 'assistant', reply);
    await recordStudioEvent(params.ctx.agentId, params.pending.sessionId, 'task_completed', {
      summary: result.summary,
      command: params.pending.command,
    });
    return NextResponse.json({
      kind: 'completed',
      intent: params.pending.intent,
      statusText: 'Done.',
      reply,
      executed: true,
      answer: reply,
      result: sanitizeOutput(result.result),
      warnings: result.warnings?.map(warning => sanitizeErrorMessage(warning)),
    });
  }

  if (params.pending.type === 'workflow_plan') {
    return executeWorkflowPlan({
      ctx: params.ctx,
      sessionId: params.pending.sessionId,
      workspaceId: params.pending.workspaceId,
      projectId: params.pending.projectId,
      workflowName: params.pending.workflowName,
      plan: params.pending.plan,
      intent: params.pending.intent,
    });
  }

  if (params.pending.type === 'project_create') {
    const project = await createProject({
      ownerAgentId: params.ctx.agentId,
      workspaceId: params.pending.workspaceId,
      name: params.pending.name,
      description: params.pending.description,
    });
    const reply = `Created project ${project.name}.`;
    await recordStudioTurn(params.ctx.agentId, params.pending.sessionId, 'assistant', reply);
    return NextResponse.json({
      kind: 'completed',
      intent: params.pending.intent,
      statusText: 'Done.',
      reply,
      executed: true,
      project,
    });
  }

  if (params.pending.type === 'subagent_create') {
    const subagent = await createPrivateSubagent({
      ownerAgentId: params.ctx.agentId,
      workspaceId: params.pending.workspaceId,
      projectId: params.pending.projectId,
      name: params.pending.name,
    });
    const reply = `Created private agent ${subagent.name}.`;
    await recordStudioTurn(params.ctx.agentId, params.pending.sessionId, 'assistant', reply);
    await recordStudioEvent(params.ctx.agentId, params.pending.sessionId, 'subagent_created', {
      subagentId: subagent.id,
      name: subagent.name,
    });
    return NextResponse.json({
      kind: 'completed',
      intent: params.pending.intent,
      statusText: 'Done.',
      reply,
      executed: true,
      subagent,
      navigateTo: `/agents/${subagent.id}`,
    });
  }

  const project = await updateProject({
    ownerAgentId: params.ctx.agentId,
    projectId: params.pending.projectId,
    name: params.pending.name,
    status: params.pending.status,
  });
  const reply = params.pending.status === 'archived'
    ? `Archived project ${project.name}.`
    : `Updated project ${project.name}.`;
  await recordStudioTurn(params.ctx.agentId, params.pending.sessionId, 'assistant', reply);
  return NextResponse.json({
    kind: 'completed',
    intent: params.pending.intent,
    statusText: 'Done.',
    reply,
    executed: true,
    project,
  });
}

function buildWorkflowPreview(plan: WorkflowPlan): string {
  const steps = plan.steps.slice(0, 4).map(step => `${step.order}. ${step.description}`).join('\n');
  return [plan.summary, steps].filter(Boolean).join('\n');
}

async function saveStudioResultArtifact(params: {
  agentId: string;
  sessionId: string;
  label?: string | null;
  explicitContent?: string | null;
}) {
  const bundle = await getStudioSessionBundle(params.agentId, params.sessionId);
  const state = bundle.session.state && typeof bundle.session.state === 'object' && !Array.isArray(bundle.session.state)
    ? bundle.session.state as Record<string, unknown>
    : {};
  const currentArtifacts = Array.isArray(state.artifacts) ? state.artifacts.filter(item => item && typeof item === 'object') as Record<string, unknown>[] : [];
  const latestAssistant = [...bundle.messages].reverse().find(message => message.role === 'assistant');
  const latestEvent = bundle.events.at(-1) ?? null;
  const artifact = {
    id: crypto.randomUUID(),
    type: 'saved_result',
    label: params.label || latestAssistant?.content.slice(0, 80) || 'Saved Studio result',
    content: params.explicitContent || latestAssistant?.content || 'No assistant result was available to save.',
    sourceMessageId: latestAssistant?.id ?? null,
    sourceEventId: latestEvent?.id ?? null,
    createdAt: new Date().toISOString(),
  };

  await updateStudioSession({
    ownerAgentId: params.agentId,
    sessionId: params.sessionId,
    statePatch: {
      artifacts: [artifact, ...currentArtifacts].slice(0, 30),
    },
  });
  await recordStudioEvent(params.agentId, params.sessionId, 'artifact_created', {
    artifactId: artifact.id,
    label: artifact.label,
  });
  return artifact;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRouteCapability(req.headers, 'studio.intent');
    const body = await req.json().catch(() => ({})) as {
      message?: string;
      instruction?: string;
      approval?: boolean;
      confirm?: boolean;
      confirmToken?: string | null;
      sessionId?: string | null;
      workspaceId?: string | null;
      projectId?: string | null;
    };

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    const message = typeof body.message === 'string' ? body.message : typeof body.instruction === 'string' ? body.instruction : '';
    const approval = body.approval === true || body.confirm === true;

    if (approval) {
      const confirmToken = typeof body.confirmToken === 'string' ? body.confirmToken : '';
      if (!confirmToken) {
        return NextResponse.json({ kind: 'error', error: 'confirmToken is required' }, { status: 400 });
      }
      const stored = await tokenGet(`studio:confirm:${confirmToken}`);
      let pending: PendingStudioAction | null = stored ? JSON.parse(stored) as PendingStudioAction : null;
      if (!pending) {
        const legacyStored = await legacyTokenGet(`intent:token:${confirmToken}`);
        if (legacyStored) {
          await legacyTokenDel(`intent:token:${confirmToken}`);
          const legacyPlan = JSON.parse(legacyStored) as {
            summary: string;
            steps: WorkflowPlan['steps'];
            schedule: string | null;
            workflowName: string;
            agentId: string;
          };
          const sessionContext = await resolveSessionContext(ctx.agentId, sessionId);
          pending = {
            type: 'workflow_plan',
            agentId: legacyPlan.agentId,
            sessionId,
            workspaceId: sessionContext.workspaceId,
            projectId: sessionContext.projectId,
            workflowName: legacyPlan.workflowName,
            plan: {
              summary: legacyPlan.summary,
              steps: legacyPlan.steps,
              schedule: legacyPlan.schedule,
            },
            intent: 'WORKFLOW_EXECUTION',
          };
        }
      }
      if (!pending) {
        return NextResponse.json({
          kind: 'error',
          intent: 'UNKNOWN',
          statusText: 'Approval expired.',
          reply: 'Approval expired. Submit the request again.',
        }, { status: 400 });
      }
      if (stored) {
        await tokenDel(`studio:confirm:${confirmToken}`);
      }
      if (pending.agentId !== ctx.agentId) {
        return NextResponse.json({ kind: 'error', error: 'Token mismatch' }, { status: 403 });
      }
      return executePendingAction({ ctx, pending });
    }

    if (!message.trim()) {
      return NextResponse.json({ kind: 'error', error: 'message is required' }, { status: 400 });
    }

    const trimmedMessage = message.trim();
    await recordStudioTurn(ctx.agentId, sessionId, 'user', trimmedMessage);

    const restricted = restrictedStudioCapability(trimmedMessage);
    if (restricted && !hasCapability(ctx.tier, restricted)) {
      const reply = capabilityMessage(restricted);
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'forbidden',
        intent: restricted === 'access_sdk' ? 'SDK_TASK' : restricted === 'create_app' ? 'APP_BUILD' : 'SKILL_BUILD',
        statusText: 'Blocked.',
        reply,
        blocked: true,
        code: 'FORBIDDEN',
      }, { status: 403 });
    }

    const intent = await detectAgentOSIntent(trimmedMessage);
    const statusText = humanStatusForIntent(intent);
    await recordStudioEvent(ctx.agentId, sessionId, 'thinking_started', {
      intent,
      statusText,
    });

    const sessionContext = await resolveSessionContext(ctx.agentId, sessionId);
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : sessionContext.workspaceId;
    const projectId = typeof body.projectId === 'string' ? body.projectId : sessionContext.projectId;

    if (isStoreNavigationRequest(trimmedMessage, 'marketplace')) {
      const reply = 'Opening the marketplace discovery layer.';
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'completed',
        intent,
        statusText: 'Done.',
        reply,
        navigateTo: '/marketplace',
      });
    }

    if (isStoreNavigationRequest(trimmedMessage, 'appstore')) {
      const reply = 'Opening the App Store.';
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'completed',
        intent,
        statusText: 'Done.',
        reply,
        navigateTo: '/appstore',
      });
    }

    if (isStoreNavigationRequest(trimmedMessage, 'skillstore')) {
      const reply = 'Opening the Skill Store.';
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'completed',
        intent,
        statusText: 'Done.',
        reply,
        navigateTo: '/skills',
      });
    }

    const inspectSkillReference = parseInspectReference(trimmedMessage, 'skill');
    if (inspectSkillReference) {
      const skill = await findSkillRecord(inspectSkillReference);
      if (!skill) {
        const reply = `No skill matched "${inspectSkillReference}".`;
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'unsupported',
          intent,
          statusText: 'Unavailable.',
          reply,
          code: 'NOT_FOUND',
        }, { status: 404 });
      }
      const reply = `Opening skill ${skill.name}.`;
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'completed',
        intent,
        statusText: 'Done.',
        reply,
        navigateTo: `/skills/${skill.slug}`,
        skill,
      });
    }

    const inspectAppReference = parseInspectReference(trimmedMessage, 'app');
    if (inspectAppReference) {
      const app = await findAppRecord({
        agentId: ctx.agentId,
        workspaceId,
        reference: inspectAppReference,
      });
      if (!app) {
        const reply = `No app matched "${inspectAppReference}".`;
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'unsupported',
          intent,
          statusText: 'Unavailable.',
          reply,
          code: 'NOT_FOUND',
        }, { status: 404 });
      }
      const reply = `Opening app ${app.name}.`;
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'completed',
        intent,
        statusText: 'Done.',
        reply,
        navigateTo: `/appstore/${app.slug}`,
        app,
      });
    }

    if (/\bsave result\b/i.test(trimmedMessage)) {
      if (!sessionId) {
        const reply = 'Save result needs an active Studio session.';
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'unsupported',
          intent,
          statusText: 'Unavailable.',
          reply,
          code: 'SESSION_REQUIRED',
        }, { status: 400 });
      }
      const artifact = await saveStudioResultArtifact({
        agentId: ctx.agentId,
        sessionId,
        label: parseSaveResultLabel(trimmedMessage),
      });
      const reply = `Saved result to this session as "${artifact.label}".`;
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'completed',
        intent,
        statusText: 'Done.',
        reply,
        artifact,
      });
    }

    const createAgentName = parseCreateAgentName(trimmedMessage);
    if (createAgentName && workspaceId) {
      const confirmToken = crypto.randomUUID().replace(/-/g, '');
      await tokenSet(`studio:confirm:${confirmToken}`, TOKEN_TTL_SECONDS, JSON.stringify({
        type: 'subagent_create',
        agentId: ctx.agentId,
        sessionId,
        workspaceId,
        projectId,
        name: createAgentName,
        intent,
      } satisfies PendingStudioAction));
      const reply = `Create private agent ${createAgentName}?`;
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'approval_required',
        intent,
        statusText: 'Approval required.',
        reply,
        confirmToken,
      });
    }

    if (/\bcreate private app\b/i.test(trimmedMessage) || /\bcreate app\b/i.test(trimmedMessage)) {
      if (!hasCapability(ctx.tier, 'create_app')) {
        const reply = capabilityMessage('create_app');
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'forbidden',
          intent,
          statusText: 'Blocked.',
          reply,
          code: 'FORBIDDEN',
        }, { status: 403 });
      }
      const reply = 'Opening the app publishing flow for a private or workspace-scoped app.';
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'completed',
        intent,
        statusText: 'Done.',
        reply,
        navigateTo: '/developer/publish',
      });
    }

    if (/\bpublish workflow\b/i.test(trimmedMessage)) {
      if (!hasCapability(ctx.tier, 'create_app')) {
        const reply = capabilityMessage('create_app');
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'forbidden',
          intent,
          statusText: 'Blocked.',
          reply,
          code: 'FORBIDDEN',
        }, { status: 403 });
      }
      const workflow = await findWorkflowRecord({
        agentId: ctx.agentId,
        projectId,
        reference: parsePublishWorkflowReference(trimmedMessage),
      });
      if (!workflow) {
        const reply = 'No publishable workflow was found in the current scope.';
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'unsupported',
          intent,
          statusText: 'Unavailable.',
          reply,
          code: 'NOT_FOUND',
        }, { status: 404 });
      }
      const reply = `Opening publishing for workflow ${workflow.name}.`;
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'completed',
        intent,
        statusText: 'Done.',
        reply,
        workflow,
        navigateTo: `/publishing/new?workflowId=${encodeURIComponent(workflow.id)}`,
      });
    }

    const routeTarget = parseRouteTarget(trimmedMessage);
    if (routeTarget) {
      const reply = routeTarget.reference
        ? `Routing through ${routeTarget.kind} ${routeTarget.reference} is ready for execution, but this request still needs an explicit run path.`
        : `Routing through a ${routeTarget.kind} is available, but this request still needs an explicit run path.`;
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'action_preview',
        intent,
        statusText: 'Preview ready.',
        reply,
        target: routeTarget,
      });
    }

    if (intent === 'PROJECT_TASK' && workspaceId) {
      const projectAction = parseProjectAction(trimmedMessage, projectId);
      if (projectAction?.kind === 'create' && projectAction.name) {
        const confirmToken = crypto.randomUUID().replace(/-/g, '');
        await tokenSet(`studio:confirm:${confirmToken}`, TOKEN_TTL_SECONDS, JSON.stringify({
          type: 'project_create',
          agentId: ctx.agentId,
          sessionId,
          workspaceId,
          name: projectAction.name,
          description: null,
          intent,
        } satisfies PendingStudioAction));
        const reply = `Create project ${projectAction.name}?`;
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'approval_required',
          intent,
          statusText: 'Approval required.',
          reply,
          confirmToken,
        });
      }
      if (projectAction?.kind === 'rename' && projectAction.name && projectId) {
        const confirmToken = crypto.randomUUID().replace(/-/g, '');
        await tokenSet(`studio:confirm:${confirmToken}`, TOKEN_TTL_SECONDS, JSON.stringify({
          type: 'project_update',
          agentId: ctx.agentId,
          sessionId,
          projectId,
          name: projectAction.name,
          intent,
        } satisfies PendingStudioAction));
        const reply = `Rename the current project to ${projectAction.name}?`;
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'approval_required',
          intent,
          statusText: 'Approval required.',
          reply,
          confirmToken,
        });
      }
      if (projectAction?.kind === 'archive' && projectId) {
        const confirmToken = crypto.randomUUID().replace(/-/g, '');
        await tokenSet(`studio:confirm:${confirmToken}`, TOKEN_TTL_SECONDS, JSON.stringify({
          type: 'project_update',
          agentId: ctx.agentId,
          sessionId,
          projectId,
          status: 'archived',
          intent,
        } satisfies PendingStudioAction));
        const reply = 'Archive the current project?';
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'approval_required',
          intent,
          statusText: 'Approval required.',
          reply,
          confirmToken,
        });
      }
    }

    if (intent === 'VAULT_TASK' && workspaceId && /\b(list|show|what|which)\b/i.test(trimmedMessage)) {
      const vault = await listVaultSecrets({ ownerAgentId: ctx.agentId, workspaceId });
      const names = vault.secrets.slice(0, 8).map(secret => secret.name);
      const reply = names.length > 0
        ? `Available secrets: ${names.join(', ')}.`
        : 'No secrets are available in this workspace yet.';
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: 'chat_reply',
        intent,
        statusText,
        reply,
      });
    }

    const command = translateMessageToStudioCommand(trimmedMessage);
    if (command) {
      const result = await executeStudioCommand({
        agentContext: withStudioDefaultAllowedDomains({ ...ctx, studioSessionId: sessionId }),
        command,
      });

      if (result.kind === 'preview' && result.confirmToken) {
        const confirmToken = crypto.randomUUID().replace(/-/g, '');
        await tokenSet(`studio:confirm:${confirmToken}`, TOKEN_TTL_SECONDS, JSON.stringify({
          type: 'studio_command',
          agentId: ctx.agentId,
          sessionId,
          command,
          innerConfirmToken: result.confirmToken,
          intent,
        } satisfies PendingStudioAction));
        const reply = result.preview?.payloadSummary || result.summary;
        await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
        return NextResponse.json({
          kind: 'approval_required',
          intent,
          statusText: 'Approval required.',
          reply,
          confirmToken,
          preview: result.preview,
        });
      }

      const reply = formatExecutionReply(result.summary, result.result);
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      return NextResponse.json({
        kind: result.kind === 'result' ? 'completed' : 'chat_reply',
        intent,
        statusText: result.kind === 'result' ? 'Done.' : statusText,
        reply,
        result: sanitizeOutput(result.result),
        warnings: result.warnings?.map(warning => sanitizeErrorMessage(warning)),
      });
    }

    if (isWorkflowIntent(intent)) {
      const plan = await callClaude(trimmedMessage);
      const confirmToken = crypto.randomUUID().replace(/-/g, '');
      let resolvedProjectId = projectId;
      if (workspaceId) {
        const project = await resolveProjectForWorkspace({
          ownerAgentId: ctx.agentId,
          workspaceId,
          projectId,
        });
        resolvedProjectId = project.id;
      }
      await tokenSet(`studio:confirm:${confirmToken}`, TOKEN_TTL_SECONDS, JSON.stringify({
        type: 'workflow_plan',
        agentId: ctx.agentId,
        sessionId,
        workspaceId,
        projectId: resolvedProjectId,
        workflowName: trimmedMessage.slice(0, 80),
        plan,
        intent,
      } satisfies PendingStudioAction));
      const reply = buildWorkflowPreview(plan);
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
      await recordStudioEvent(ctx.agentId, sessionId, 'plan_created', {
        summary: plan.summary,
        stepCount: plan.steps.length,
      });
      return NextResponse.json({
        kind: 'approval_required',
        intent,
        statusText: 'Approval required.',
        reply,
        confirmToken,
      });
    }

    const names = await loadContextNames(workspaceId, projectId);
    const reply = await generateStudioChatReply({
      message: trimmedMessage,
      intent,
      workspaceName: names.workspaceName,
      projectName: names.projectName,
      sessionTitle: sessionContext.title,
    });
    await recordStudioTurn(ctx.agentId, sessionId, 'assistant', reply);
    return NextResponse.json({
      kind: 'chat_reply',
      intent,
      statusText,
      reply,
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({
      kind: 'error',
      intent: 'UNKNOWN',
      statusText: 'Failed.',
      reply: sanitizeErrorMessage(err.message),
      code: err.code,
    }, { status: err.statusCode });
  }
}
