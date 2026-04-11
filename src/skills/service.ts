import { executeSkillCapability } from './executor.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { NotFoundError, PermissionError, SecurityError, ValidationError } from '../utils/errors.js';

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

export async function runInstalledSkill(params: {
  agentId: string;
  skillSlug: string;
  capability: string;
  input: unknown;
}): Promise<InstalledSkillExecution> {
  const { agentId, skillSlug, capability, input } = params;
  const startedAt = Date.now();

  try {
    const supabase = getSupabaseAdmin();
    const { data: skill, error: skillError } = await supabase
      .from('skills')
      .select('id,slug,source_code,capabilities,price_per_call,total_calls,published')
      .eq('slug', skillSlug)
      .single();

    if (skillError || !skill) {
      throw new NotFoundError(`Skill '${skillSlug}' not found`);
    }

    if (!skill.published) {
      throw new PermissionError(`Skill '${skillSlug}' is not published`);
    }

    const { data: installation, error: installationError } = await supabase
      .from('skill_installations')
      .select('id')
      .eq('agent_id', agentId)
      .eq('skill_id', skill.id)
      .single();

    if (installationError || !installation) {
      throw new PermissionError(`Skill '${skillSlug}' is not installed. Call POST /api/skills/install first.`);
    }

    const execution = capability === 'run'
      ? buildGenericExecution(skill.slug, capability, input, startedAt)
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

    const state = await readLocalRuntimeState();
    const skill = state.skills.catalog.find(item => item.slug === skillSlug && item.published);
    if (!skill) {
      throw new NotFoundError(`Skill '${skillSlug}' not found`);
    }

    const installation = (state.skills.installations[agentId] ?? []).find(item => item.skill_id === skill.id);
    if (!installation) {
      throw new PermissionError(`Skill '${skillSlug}' is not installed. Call POST /api/skills/install first.`);
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