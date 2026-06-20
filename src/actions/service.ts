import { randomUUID } from 'crypto';
import { assertCapability, type Capability } from '../auth/capabilities.js';
import type { AgentContext } from '../auth/permissions.js';
import {
  getAgentAppReadiness,
  installAgentApp,
  recordAgentAppOpen,
  updateAgentAppInstallation,
  type AgentAppOpenTarget,
} from '../appstore/service.js';
import { executeUniversalToolCall } from '../mcp/registry.js';
import { runTrackedExecution, updateExecution } from '../execution/service.js';
import { createNotification } from '../notifications/service.js';
import { executePanicAction, type PanicAction } from '../panic/service.js';
import { createProject, updateProject } from '../projects/service.js';
import { logOperation } from '../runtime/audit.js';
import { createPrivateSubagent } from '../subagents/service.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { appendStudioEvent } from '../studio/persistence.js';
import { withStudioDefaultAllowedDomains } from '../studio/domains.js';
import { validateRequiredSecrets } from '../vault/service.js';
import { assertWorkspaceMembership, resolveDefaultWorkspaceForAgent } from '../workspaces/service.js';
import { hydrateWorkflowDocument, syncWorkflowDocument, type WorkflowAuthoringMode } from '../workflows/canonical.js';
import { ValidationError } from '../utils/errors.js';
import { sanitizeErrorMessage, sanitizeOutput } from '../utils/output-sanitizer.js';

export type AgentOSActionType =
  | 'install_app'
  | 'open_app'
  | 'configure_app'
  | 'update_app'
  | 'uninstall_app'
  | 'pin_app'
  | 'install_skill'
  | 'uninstall_skill'
  | 'create_workflow'
  | 'run_workflow'
  | 'publish_workflow'
  | 'create_project'
  | 'update_project'
  | 'create_subagent'
  | 'publish_app'
  | 'publish_skill'
  | 'panic_pause'
  | 'panic_stop_all'
  | 'panic_lockdown';

export type AgentOSActionSource = 'natural_language' | 'manual_ui' | 'api' | 'system';

export type AgentOSActionInput = {
  action: AgentOSActionType;
  source?: AgentOSActionSource;
  workspaceId?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  payload?: Record<string, unknown>;
  canManageAll?: boolean;
};

export type AgentOSActionResult = {
  action: AgentOSActionType;
  source: AgentOSActionSource;
  status: 'completed' | 'requires_ui';
  result: unknown;
  execution?: unknown;
  executionId?: string | null;
  notificationId?: string | null;
  auditId?: string | null;
  deepLink?: string | null;
};

const ACTION_CAPABILITIES: Partial<Record<AgentOSActionType, Capability>> = {
  install_app: 'install_app',
  open_app: 'install_app',
  configure_app: 'install_app',
  update_app: 'install_app',
  uninstall_app: 'install_app',
  pin_app: 'install_app',
  install_skill: 'install_skill',
  uninstall_skill: 'install_skill',
  create_workflow: 'create_private_workflow',
  run_workflow: 'run_workflow',
  publish_workflow: 'create_app',
  create_project: 'use_nl_studio',
  update_project: 'use_nl_studio',
  create_subagent: 'create_private_subagent',
  publish_app: 'publish_app',
  publish_skill: 'publish_skill',
  panic_pause: 'use_nl_studio',
  panic_stop_all: 'use_nl_studio',
  panic_lockdown: 'use_nl_studio',
};

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = typeof payload[key] === 'string' ? payload[key].trim() : '';
  if (!value) throw new ValidationError(`${key} is required`);
  return value;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function workflowMode(payload: Record<string, unknown>): WorkflowAuthoringMode {
  if (payload.mode === 'conversation' || payload.mode === 'visual' || payload.mode === 'code') return payload.mode;
  if (typeof payload.code === 'string') return 'code';
  if (payload.graph && typeof payload.graph === 'object') return 'visual';
  return 'conversation';
}

function findRunnableWorkflowStep(workflow: Record<string, unknown>): { tool: string; input: Record<string, unknown> } | null {
  let steps: unknown[] = Array.isArray(workflow.steps) ? workflow.steps : [];
  try {
    steps = hydrateWorkflowDocument({
      canonicalDoc: workflow.canonical_doc,
      steps: workflow.steps,
      graphState: workflow.graph_state,
      codeState: typeof workflow.code_state === 'string' ? workflow.code_state : null,
    }).steps;
  } catch {
    // Legacy workflow rows can still carry plain steps.
  }
  for (const raw of steps) {
    const step = objectPayload(raw);
    if (typeof step.tool !== 'string' || !step.tool.trim()) continue;
    const input = objectPayload(step.input);
    return { tool: step.tool, input };
  }
  return null;
}

async function runWorkflowNow(params: {
  ctx: AgentContext;
  workspaceId?: string | null;
  sessionId?: string | null;
  workflowId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: workflow, error } = await supabase
    .from('agent_workflows')
    .select('*')
    .eq('id', params.workflowId)
    .eq('agent_id', params.ctx.agentId)
    .maybeSingle();
  if (error) throw error;
  if (!workflow) throw new ValidationError('Workflow not found');
  const workflowRow = workflow as Record<string, unknown>;
  const step = findRunnableWorkflowStep(workflowRow);
  if (!step) {
    throw new ValidationError('Workflow has no runnable step. Add an executable tool step before running it.');
  }

  const tracked = await runTrackedExecution({
    agentId: params.ctx.agentId,
    workspaceId: params.workspaceId ?? (typeof workflowRow.workspace_id === 'string' ? workflowRow.workspace_id : null),
    projectId: typeof workflowRow.project_id === 'string' ? workflowRow.project_id : null,
    sessionId: params.sessionId,
    sourceType: 'workflow',
    type: 'WORKFLOW_EXECUTION',
    sourceId: params.workflowId,
    workflowId: params.workflowId,
    title: `Run workflow ${String(workflowRow.name ?? params.workflowId)}`,
    input: { workflowId: params.workflowId, step },
    metadata: {
      resumeCheckpoint: {
        workflowId: params.workflowId,
        nodePosition: 0,
        variables: {},
        pendingToolCalls: [step.tool],
        memoryState: {},
      },
    },
    run: async () => {
      try {
        const result = sanitizeOutput(await executeUniversalToolCall({
          agentContext: withStudioDefaultAllowedDomains({ ...params.ctx, studioSessionId: params.sessionId ?? null }),
          name: step.tool,
          server: undefined,
          arguments: step.input,
        }));
        const ranAt = new Date().toISOString();
        await supabase
          .from('agent_workflows')
          .update({ last_run_at: ranAt, last_result: result, last_error: null, updated_at: ranAt })
          .eq('id', params.workflowId)
          .eq('agent_id', params.ctx.agentId);
        return { workflowId: params.workflowId, tool: step.tool, result };
      } catch (error) {
        const message = sanitizeErrorMessage(error);
        const ranAt = new Date().toISOString();
        await supabase
          .from('agent_workflows')
          .update({ last_run_at: ranAt, last_error: message, updated_at: ranAt })
          .eq('id', params.workflowId)
          .eq('agent_id', params.ctx.agentId);
        throw error;
      }
    },
  });

  return { result: tracked.result, execution: tracked.execution };
}

function getStringField(value: unknown, key: string): string | null {
  return value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>)[key] === 'string'
    ? String((value as Record<string, unknown>)[key])
    : null;
}

function getExecutionId(execution: unknown): string | null {
  return getStringField(execution, 'id');
}

function getSourceId(action: AgentOSActionType, payload: Record<string, unknown>): string | null {
  if (typeof payload.slug === 'string') return payload.slug;
  if (typeof payload.skillId === 'string') return payload.skillId;
  if (typeof payload.workflowId === 'string') return payload.workflowId;
  if (typeof payload.projectId === 'string') return payload.projectId;
  if (typeof payload.name === 'string') return payload.name;
  return action;
}

function deepLinkForAction(action: AgentOSActionType, result: unknown, payload: Record<string, unknown>): string | null {
  const navigateTo = getStringField(result, 'navigateTo');
  if (navigateTo) return navigateTo;
  if (action.includes('app') && typeof payload.slug === 'string') return `/appstore/${encodeURIComponent(payload.slug)}`;
  if (action.includes('skill')) return '/library?section=skills';
  if (action.includes('workflow')) return typeof payload.workflowId === 'string' ? `/workflows/${encodeURIComponent(payload.workflowId)}` : '/workflows';
  if (action.includes('project')) return typeof payload.projectId === 'string' ? `/projects/${encodeURIComponent(payload.projectId)}` : '/projects';
  if (action.includes('subagent')) return '/library?section=subagents';
  if (action.startsWith('panic')) return '/workflows';
  return null;
}

function actionTitle(action: AgentOSActionType): string {
  return action.replace(/_/g, ' ');
}

async function recordActionSuccess(params: {
  ctx: AgentContext;
  input: AgentOSActionInput;
  source: AgentOSActionSource;
  payload: Record<string, unknown>;
  result: unknown;
  execution: unknown;
}): Promise<{ auditId: string | null; notificationId: string | null; deepLink: string | null }> {
  const executionId = getExecutionId(params.execution);
  const deepLink = deepLinkForAction(params.input.action, params.result, params.payload);
  const sourceId = getSourceId(params.input.action, params.payload);
  const auditId = await logOperation({
    agentId: params.ctx.agentId,
    workspaceId: params.input.workspaceId ?? null,
    sessionId: params.input.sessionId ?? null,
    executionId,
    sourceType: 'action',
    sourceId,
    primitive: 'action',
    operation: params.input.action,
    success: true,
    metadata: {
      action: params.input.action,
      source: params.source,
      projectId: params.input.projectId ?? null,
      deepLink,
    },
  });
  const notification = await createNotification({
    agentId: params.ctx.agentId,
    workspaceId: params.input.workspaceId ?? null,
    sessionId: params.input.sessionId ?? null,
    executionId,
    type: params.input.action.startsWith('panic') ? 'panic' : 'action_completed',
    title: `Action completed: ${actionTitle(params.input.action)}`,
    body: deepLink ? `Open ${deepLink} to inspect the result.` : 'The requested AgentOS action completed.',
    metadata: {
      action: params.input.action,
      source: params.source,
      sourceId,
      deepLink,
    },
  }).catch(() => null);
  if (executionId) {
    await updateExecution({
      agentId: params.ctx.agentId,
      executionId,
      patch: {
        actionType: params.input.action,
        actionSource: params.source,
        notificationId: notification?.id ?? null,
        deepLink,
        statusDetail: {
          actionStatus: 'completed',
          action: params.input.action,
          source: params.source,
        },
      },
    }).catch(() => undefined);
  }
  return {
    auditId,
    notificationId: notification?.id ?? null,
    deepLink,
  };
}

async function installSkill(params: {
  ctx: AgentContext;
  workspaceId?: string | null;
  sessionId?: string | null;
  skillId: string;
}) {
  const tracked = await runTrackedExecution({
    agentId: params.ctx.agentId,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    sourceType: 'skill',
    sourceId: params.skillId,
    skillId: params.skillId,
    title: `Install skill ${params.skillId}`,
    input: { skillId: params.skillId },
    run: async () => {
      try {
        const supabase = getSupabaseAdmin();
        const { data: skill, error: skillErr } = await supabase
          .from('skills')
          .select('id, name, total_installs, required_secrets')
          .eq('id', params.skillId)
          .eq('published', true)
          .single();

        if (!skillErr && skill) {
          const requiredSecrets = stringArray(skill.required_secrets);
          if (requiredSecrets.length > 0) {
            const validation = await validateRequiredSecrets({
              ownerAgentId: params.ctx.agentId,
              workspaceId: params.workspaceId ?? undefined,
              names: requiredSecrets,
            });
            if (validation.missing.length > 0) {
              if (params.sessionId) {
                await appendStudioEvent({
                  ownerAgentId: params.ctx.agentId,
                  sessionId: params.sessionId,
                  type: 'secret_required',
                  payload: { skillId: params.skillId, missing: validation.missing },
                });
              }
              throw new ValidationError(`Missing required secrets: ${validation.missing.join(', ')}`);
            }
          }

          const { data, error } = await supabase
            .from('skill_installations')
            .insert({ agent_id: params.ctx.agentId, skill_id: params.skillId })
            .select()
            .single();

          if (!error) {
            await supabase.from('skills').update({ total_installs: (skill.total_installs ?? 0) + 1 }).eq('id', params.skillId);
            if (params.sessionId) {
              await appendStudioEvent({
                ownerAgentId: params.ctx.agentId,
                sessionId: params.sessionId,
                type: 'skill_installed',
                payload: { skillId: params.skillId, name: skill.name ?? null },
              });
            }
            return { success: true, installation: data };
          }

          if (error.code === '23505') throw new ValidationError('Skill already installed');
        }
      } catch (error) {
        if (error instanceof ValidationError) throw error;
      }

      const state = await readLocalRuntimeState();
      const skill = state.skills.catalog.find(item => item.id === params.skillId && item.published);
      if (!skill) throw new ValidationError('Skill not found or not published');
      const existing = (state.skills.installations[params.ctx.agentId] ?? []).find(item => item.skill_id === params.skillId);
      if (existing) throw new ValidationError('Skill already installed');
      const installation = {
        id: randomUUID(),
        skill_id: params.skillId,
        installed_at: new Date().toISOString(),
      };
      await updateLocalRuntimeState(nextState => {
        nextState.skills.installations[params.ctx.agentId] ??= [];
        nextState.skills.installations[params.ctx.agentId].push(installation);
        const installedSkill = nextState.skills.catalog.find(item => item.id === params.skillId);
        if (installedSkill) installedSkill.total_installs += 1;
      });
      return { success: true, installation };
    },
  });
  return { result: tracked.result, execution: tracked.execution };
}

async function uninstallSkill(params: {
  ctx: AgentContext;
  skillId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
}) {
  const tracked = await runTrackedExecution({
    agentId: params.ctx.agentId,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    sourceType: 'skill',
    sourceId: params.skillId,
    skillId: params.skillId,
    title: `Uninstall skill ${params.skillId}`,
    input: { skillId: params.skillId },
    run: async () => {
      try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase
          .from('skill_installations')
          .delete()
          .eq('agent_id', params.ctx.agentId)
          .eq('skill_id', params.skillId);
        if (!error) {
          try {
            await supabase.rpc('decrement_skill_installs', { skill_id: params.skillId });
          } catch {
            // Best-effort install count maintenance.
          }
          return { success: true };
        }
      } catch {
        // Fall through to local state.
      }
      await updateLocalRuntimeState(state => {
        state.skills.installations[params.ctx.agentId] = (state.skills.installations[params.ctx.agentId] ?? [])
          .filter(item => item.skill_id !== params.skillId);
      });
      return { success: true };
    },
  });
  return { result: tracked.result, execution: tracked.execution };
}

async function createWorkflow(params: {
  ctx: AgentContext;
  workspaceId?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  payload: Record<string, unknown>;
}) {
  const name = requireString(params.payload, 'name');
  const workspaceId = params.workspaceId || (typeof params.payload.workspaceId === 'string' ? params.payload.workspaceId : '') || (await resolveDefaultWorkspaceForAgent(params.ctx.agentId))?.id || '';
  if (!workspaceId) throw new ValidationError('workspaceId is required');
  await assertWorkspaceMembership(workspaceId, params.ctx.agentId);
  const synced = syncWorkflowDocument({
    mode: workflowMode(params.payload),
    steps: params.payload.steps,
    graph: params.payload.graph,
    code: typeof params.payload.code === 'string' ? params.payload.code : undefined,
    metadata: { source: 'agentos_action' },
  });
  const tracked = await runTrackedExecution({
    agentId: params.ctx.agentId,
    workspaceId,
    sessionId: params.sessionId,
    sourceType: 'workflow',
    title: `Create workflow ${name}`,
    input: { ...params.payload, workspaceId, projectId: params.projectId ?? null },
    run: async () => {
      const { data, error } = await getSupabaseAdmin()
        .from('agent_workflows')
        .insert({
          agent_id: params.ctx.agentId,
          workspace_id: workspaceId,
          project_id: params.projectId ?? (typeof params.payload.projectId === 'string' ? params.payload.projectId : null),
          name: name.slice(0, 80),
          summary: typeof params.payload.summary === 'string' ? params.payload.summary : null,
          steps: synced.steps,
          graph_state: synced.graphState,
          code_state: synced.codeState,
          canonical_doc: synced.canonical,
          schedule: typeof params.payload.schedule === 'string' ? params.payload.schedule : null,
          visibility: params.payload.visibility === 'workspace' || params.payload.visibility === 'public' ? params.payload.visibility : 'private',
          status: 'active',
          version: 1,
        })
        .select()
        .single();
      if (error) throw error;
      return { workflow: data };
    },
  });
  return { result: tracked.result, execution: tracked.execution };
}

export async function executeAgentOSAction(ctx: AgentContext, input: AgentOSActionInput): Promise<AgentOSActionResult> {
  const source = input.source ?? 'api';
  const payload = objectPayload(input.payload);
  const capability = ACTION_CAPABILITIES[input.action];
  if (capability) assertCapability(ctx.tier, capability);

  let output: { result: unknown; execution?: unknown };

  if (input.action === 'install_app') {
    const slug = requireString(payload, 'slug');
    const permissionsApproved = stringArray(payload.permissionsApproved);
    const readiness = await getAgentAppReadiness({
      agentId: ctx.agentId,
      slug,
      workspaceId: input.workspaceId,
      canManageAll: input.canManageAll,
      permissionsApproved,
    });
    const tracked = await runTrackedExecution({
      agentId: ctx.agentId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      sourceType: 'app',
      sourceId: slug,
      appId: readiness.app.id,
      title: `Install app ${slug}`,
      input: { slug, permissionsApproved },
      run: () => installAgentApp({
        agentId: ctx.agentId,
        slug,
        workspaceId: input.workspaceId,
        canManageAll: input.canManageAll,
        permissionsApproved,
      }),
    });
    output = { result: tracked.result, execution: tracked.execution };
  } else if (input.action === 'open_app') {
    const slug = requireString(payload, 'slug');
    const target: AgentAppOpenTarget = payload.target === 'android' || payload.target === 'ios' ? payload.target : 'web';
    const tracked = await runTrackedExecution({
      agentId: ctx.agentId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      sourceType: 'app',
      sourceId: slug,
      title: `Open app ${slug}`,
      input: { slug, target },
      run: () => recordAgentAppOpen({ agentId: ctx.agentId, slug, target }),
    });
    output = { result: tracked.result, execution: tracked.execution };
  } else if (input.action === 'configure_app' || input.action === 'update_app' || input.action === 'uninstall_app' || input.action === 'pin_app') {
    const slug = requireString(payload, 'slug');
    const status = input.action === 'uninstall_app'
      ? 'removed'
      : payload.status === 'active' || payload.status === 'disabled' || payload.status === 'removed'
        ? payload.status
        : undefined;
    const favorite = input.action === 'pin_app'
      ? payload.favorite !== false
      : typeof payload.favorite === 'boolean'
        ? payload.favorite
        : undefined;
    const tracked = await runTrackedExecution({
      agentId: ctx.agentId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      sourceType: 'app',
      sourceId: slug,
      title: `${input.action.replace(/_/g, ' ')} ${slug}`,
      input: payload,
      run: () => updateAgentAppInstallation({
        agentId: ctx.agentId,
        slug,
        favorite,
        permissionsApproved: stringArray(payload.permissionsApproved),
        status,
        installedVersion: typeof payload.installedVersion === 'string' ? payload.installedVersion : undefined,
      }),
    });
    output = { result: tracked.result, execution: tracked.execution };
  } else if (input.action === 'install_skill') {
    output = await installSkill({
      ctx,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      skillId: requireString(payload, 'skillId'),
    });
  } else if (input.action === 'uninstall_skill') {
    output = await uninstallSkill({
      ctx,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      skillId: requireString(payload, 'skillId'),
    });
  } else if (input.action === 'create_project') {
    const workspaceId = input.workspaceId || requireString(payload, 'workspaceId');
    const tracked = await runTrackedExecution({
      agentId: ctx.agentId,
      workspaceId,
      sessionId: input.sessionId,
      sourceType: 'system',
      title: `Create project ${String(payload.name ?? '')}`,
      input: payload,
      run: () => createProject({
        ownerAgentId: ctx.agentId,
        workspaceId,
        name: requireString(payload, 'name'),
        description: typeof payload.description === 'string' ? payload.description : null,
        metadata: objectPayload(payload.metadata),
      }),
    });
    output = { result: { project: tracked.result }, execution: tracked.execution };
  } else if (input.action === 'update_project') {
    const projectId = input.projectId || requireString(payload, 'projectId');
    const tracked = await runTrackedExecution({
      agentId: ctx.agentId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      sourceType: 'system',
      sourceId: projectId,
      title: `Update project ${projectId}`,
      input: payload,
      run: () => updateProject({
        ownerAgentId: ctx.agentId,
        projectId,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        description: typeof payload.description === 'string' || payload.description === null ? payload.description : undefined,
        status: payload.status === 'active' || payload.status === 'archived' ? payload.status : undefined,
        metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata) ? payload.metadata as Record<string, unknown> : undefined,
      }),
    });
    output = { result: { project: tracked.result }, execution: tracked.execution };
  } else if (input.action === 'create_subagent') {
    const workspaceId = input.workspaceId || requireString(payload, 'workspaceId');
    const tracked = await runTrackedExecution({
      agentId: ctx.agentId,
      workspaceId,
      sessionId: input.sessionId,
      sourceType: 'system',
      title: `Create subagent ${String(payload.name ?? '')}`,
      input: payload,
      run: () => createPrivateSubagent({
        ownerAgentId: ctx.agentId,
        workspaceId,
        projectId: input.projectId ?? (typeof payload.projectId === 'string' ? payload.projectId : null),
        name: requireString(payload, 'name'),
        description: typeof payload.description === 'string' ? payload.description : null,
        instructions: typeof payload.instructions === 'string' ? payload.instructions : undefined,
        visibility: payload.visibility === 'workspace' || payload.visibility === 'public' ? payload.visibility : 'private',
        exposedCapabilities: Array.isArray(payload.exposedCapabilities) ? stringArray(payload.exposedCapabilities) : undefined,
      }),
    });
    output = { result: { subagent: tracked.result }, execution: tracked.execution };
  } else if (input.action === 'create_workflow') {
    output = await createWorkflow({ ctx, workspaceId: input.workspaceId, projectId: input.projectId, sessionId: input.sessionId, payload });
  } else if (input.action === 'run_workflow') {
    output = await runWorkflowNow({
      ctx,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      workflowId: requireString(payload, 'workflowId'),
    });
  } else if (input.action === 'publish_workflow') {
    output = {
      result: {
        navigateTo: payload.workflowId ? `/publishing/new?workflowId=${encodeURIComponent(String(payload.workflowId))}` : '/publishing/new',
      },
    };
  } else if (input.action === 'publish_app') {
    output = { result: { navigateTo: '/developer/publish' } };
  } else if (input.action === 'publish_skill') {
    output = { result: { navigateTo: '/developer' } };
  } else {
    const panicAction: PanicAction = input.action === 'panic_pause' ? 'pause' : input.action === 'panic_lockdown' ? 'lockdown' : 'stop_all';
    const tracked = await runTrackedExecution({
      agentId: ctx.agentId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      sourceType: 'system',
      title: `Panic ${panicAction}`,
      input: { panicAction },
      run: () => executePanicAction({
        agentId: ctx.agentId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        action: panicAction,
      }),
    });
    output = { result: tracked.result, execution: tracked.execution };
  }

  const metadata = await recordActionSuccess({
    ctx,
    input,
    source,
    payload,
    result: output.result,
    execution: output.execution,
  });

  return {
    action: input.action,
    source,
    status: 'completed',
    result: output.result,
    execution: output.execution,
    executionId: getExecutionId(output.execution),
    notificationId: metadata.notificationId,
    auditId: metadata.auditId,
    deepLink: metadata.deepLink,
  };
}
