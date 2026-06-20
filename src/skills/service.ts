import { executeSkillCapability } from './executor.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { NotFoundError, PermissionError, SecurityError, ValidationError } from '../utils/errors.js';
import { withRuntimeSecretsAccess } from '../vault/service.js';

export type InstalledSkillExecution = {
  result: unknown;
  executionTimeMs: number;
  stderr: string;
};

function buildGenericExecution(skillSlug: string, capability: string, input: unknown, startedAt: number): InstalledSkillExecution {
  return {
    result: {
      skill: skillSlug,
      capability,
      params: input,
    },
    executionTimeMs: Date.now() - startedAt,
    stderr: '',
  };
}

function allowLocalSkillFallback(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK === '1';
}

export async function runInstalledSkill(params: {
  agentId: string;
  skillSlug: string;
  capability: string;
  input: unknown;
  studioSessionId?: string | null;
}): Promise<InstalledSkillExecution> {
  const { agentId, skillSlug, capability, input } = params;
  const startedAt = Date.now();

  try {
    const supabase = getSupabaseAdmin();
    const primarySkill = await supabase
      .from('skills')
      .select('id,slug,source_code,capabilities,price_per_call,total_calls,published,required_secrets,permissions_required')
      .eq('slug', skillSlug)
      .single();
    const legacySkill = primarySkill.error
      ? await supabase
        .from('skills')
        .select('id,slug,source_code,capabilities,price_per_call,total_calls,published,required_secrets')
        .eq('slug', skillSlug)
        .single()
      : primarySkill;
    const skill = legacySkill.data;
    const skillError = legacySkill.error;

    if (skillError || !skill) {
      throw new NotFoundError(`Skill '${skillSlug}' not found`);
    }

    if (!skill.published) {
      throw new PermissionError(`Skill '${skillSlug}' is not published`);
    }

    const primaryInstallation = await supabase
      .from('skill_installations')
      .select('id,status,permissions_approved')
      .eq('agent_id', agentId)
      .eq('skill_id', skill.id)
      .single();
    const legacyInstallation = primaryInstallation.error
      ? await supabase
        .from('skill_installations')
        .select('id')
        .eq('agent_id', agentId)
        .eq('skill_id', skill.id)
        .single()
      : primaryInstallation;
    const installation = legacyInstallation.data as Record<string, unknown> | null;
    const installationError = legacyInstallation.error;

    if (installationError || !installation) {
      throw new PermissionError(`Skill '${skillSlug}' is not installed. Call POST /api/skills/install first.`);
    }
    if (installation.status === 'disabled' || installation.status === 'removed') {
      throw new PermissionError(`Skill '${skillSlug}' is not active.`);
    }
    const requiredPermissions = Array.isArray((skill as Record<string, unknown>).permissions_required)
      ? ((skill as Record<string, unknown>).permissions_required as unknown[]).filter((item): item is string => typeof item === 'string')
      : [];
    const approvedPermissions = new Set(Array.isArray(installation.permissions_approved)
      ? (installation.permissions_approved as unknown[]).filter((item): item is string => typeof item === 'string')
      : []);
    const missingPermissions = requiredPermissions.filter(permission => !approvedPermissions.has(permission));
    if (missingPermissions.length > 0) {
      throw new PermissionError(`Skill permission approval required: ${missingPermissions.join(', ')}`);
    }

    const runtimeSecrets = Array.isArray(skill.required_secrets)
      ? skill.required_secrets.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    const execution = runtimeSecrets.length > 0
        ? await withRuntimeSecretsAccess({
            ownerAgentId: agentId,
            names: runtimeSecrets,
            subjectType: 'skill',
            subjectId: String(skill.id),
            sessionId: params.studioSessionId,
            handler: async secrets => executeSkillCapability({
              sourceCode: skill.source_code,
              capability,
              capabilityDefinitions: skill.capabilities,
              input,
              secrets,
            }),
          })
        : await executeSkillCapability({
            sourceCode: skill.source_code,
            capability,
            capabilityDefinitions: skill.capabilities,
            input,
          });

    await supabase.from('skill_usage').insert({
      agent_id: agentId,
      skill_id: skill.id,
      capability_name: capability,
      execution_time_ms: execution.executionTimeMs,
      success: true,
      error_message: execution.stderr || null,
      cost: skill.price_per_call ?? 0,
    });

    await supabase.from('skills').update({ total_calls: (skill.total_calls ?? 0) + 1 }).eq('id', skill.id);
    return execution;
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof PermissionError ||
      error instanceof ValidationError ||
      error instanceof SecurityError
    ) {
      throw error;
    }

    if (!allowLocalSkillFallback()) {
      throw new Error(`Failed to execute skill '${skillSlug}': ${error instanceof Error ? error.message : String(error)}`);
    }

    const state = await readLocalRuntimeState();
    const skill = state.skills.catalog.find(item => item.slug === skillSlug && item.published);
    if (!skill) {
      throw new NotFoundError(`Skill '${skillSlug}' not found`);
    }

    const installation = (state.skills.installations[agentId] ?? []).find(item => item.skill_id === skill.id && item.status !== 'disabled' && item.status !== 'removed');
    if (!installation) {
      throw new PermissionError(`Skill '${skillSlug}' is not installed. Call POST /api/skills/install first.`);
    }
    const requiredPermissions = Array.isArray(skill.permissions_required) ? skill.permissions_required : [];
    const approvedPermissions = new Set(installation.permissions_approved ?? []);
    const missingPermissions = requiredPermissions.filter(permission => !approvedPermissions.has(permission));
    if (missingPermissions.length > 0) {
      throw new PermissionError(`Skill permission approval required: ${missingPermissions.join(', ')}`);
    }

    const execution = buildGenericExecution(skill.slug, capability, input, startedAt);
    await updateLocalRuntimeState(nextState => {
      const target = nextState.skills.catalog.find(item => item.id === skill.id);
      if (target) {
        target.total_calls += 1;
      }
    });

    return execution;
  }
}
