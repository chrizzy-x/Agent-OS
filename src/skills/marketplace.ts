import { randomUUID } from 'crypto';
import { recordMarketplaceInstallEvent } from '../marketplace/install-events.js';
import { scoreSearchMatch } from '../search/scoring.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { PermissionError, ValidationError } from '../utils/errors.js';
import { validateRequiredSecrets } from '../vault/service.js';

export const SKILL_STORE_CATEGORIES = [
  'AI',
  'Automation',
  'Research',
  'Trading',
  'Developer',
  'Browser',
  'System',
  'Data',
  'Communication',
  'Productivity',
];

export type SkillInstallResult = {
  success: true;
  installation: Record<string, unknown>;
  skill: SkillMarketplaceRecord;
  dependenciesInstalled: Array<{ id: string; slug: string; name: string }>;
};

export type SkillMarketplaceRecord = {
  id: string;
  name: string;
  slug: string;
  version: string;
  author_name: string;
  developer_handle: string;
  workspace_id: string | null;
  category: string;
  description: string;
  long_description?: string | null;
  total_installs: number;
  total_calls: number;
  rating: number;
  review_count: number;
  capabilities: Array<Record<string, unknown>>;
  tags: string[];
  primitives_required: string[];
  permissions_required: string[];
  required_secrets: string[];
  required_skills: string[];
  optional_skills: string[];
  compatibility: string[];
  examples: Array<Record<string, unknown>>;
  inputs: Array<Record<string, unknown>>;
  outputs: Array<Record<string, unknown>>;
  dependencies: Record<string, unknown>;
  published: boolean;
  verified: boolean;
  visibility: 'private' | 'workspace' | 'public';
  created_at: string;
  updated_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeHandle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'developer';
}

function normalizeVisibility(value: unknown, fallback: 'private' | 'workspace' | 'public' = 'private') {
  return value === 'workspace' || value === 'public' || value === 'private' ? value : fallback;
}

export function mapSkillMarketplaceRecord(row: Record<string, unknown>): SkillMarketplaceRecord {
  const authorName = String(row.author_name ?? 'AgentOS Publisher');
  const requiredSkills = stringArray(row.required_skills);
  const optionalSkills = stringArray(row.optional_skills);
  const dependencies = isRecord(row.dependencies) ? row.dependencies : {};
  return {
    id: String(row.id),
    name: String(row.name ?? 'Skill'),
    slug: String(row.slug ?? row.id),
    version: String(row.version ?? '1.0.0'),
    author_name: authorName,
    developer_handle: typeof row.developer_handle === 'string' && row.developer_handle.trim()
      ? row.developer_handle
      : normalizeHandle(authorName),
    workspace_id: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    category: String(row.category ?? 'Productivity'),
    description: String(row.description ?? ''),
    long_description: typeof row.long_description === 'string' ? row.long_description : null,
    total_installs: Number(row.total_installs ?? 0),
    total_calls: Number(row.total_calls ?? 0),
    rating: Number(row.rating ?? 0),
    review_count: Number(row.review_count ?? 0),
    capabilities: recordArray(row.capabilities),
    tags: stringArray(row.tags),
    primitives_required: stringArray(row.primitives_required),
    permissions_required: stringArray(row.permissions_required),
    required_secrets: stringArray(row.required_secrets),
    required_skills: requiredSkills.length ? requiredSkills : stringArray(dependencies.required),
    optional_skills: optionalSkills.length ? optionalSkills : stringArray(dependencies.optional),
    compatibility: stringArray(row.compatibility).length
      ? stringArray(row.compatibility)
      : ['Super AgentOS', 'Workflows', 'Subagents', 'Apps'],
    examples: recordArray(row.examples),
    inputs: recordArray(row.inputs),
    outputs: recordArray(row.outputs),
    dependencies,
    published: row.published === true,
    verified: row.verified === true,
    visibility: normalizeVisibility(row.visibility, row.published === true ? 'public' : 'private'),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

async function loadSkills(): Promise<SkillMarketplaceRecord[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('skills')
      .select('*')
      .eq('published', true);
    if (!error) return ((data ?? []) as Array<Record<string, unknown>>).map(mapSkillMarketplaceRecord);
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  return state.skills.catalog
    .filter(skill => skill.published)
    .map(skill => mapSkillMarketplaceRecord(skill as unknown as Record<string, unknown>));
}

export async function listSkillDiscovery(params: {
  query?: string | null;
  category?: string | null;
  installedSlugs?: string[];
} = {}): Promise<{ skills: SkillMarketplaceRecord[]; categories: string[]; installedSlugs: string[]; sections: Array<{ id: string; title: string; skills: SkillMarketplaceRecord[] }> }> {
  const query = params.query?.trim() ?? '';
  const category = params.category?.trim();
  const installed = new Set(params.installedSlugs ?? []);
  let skills = await loadSkills();
  if (category && category !== 'All') {
    skills = skills.filter(skill => skill.category.toLowerCase() === category.toLowerCase());
  }
  if (query) {
    skills = skills.filter(skill => scoreSearchMatch(query, skill.name, skill.description, skill.author_name, skill.category, skill.tags.join(' '), skill.capabilities.map(item => String(item.name ?? '')).join(' ')) > 0);
  }
  skills = skills.sort((left, right) => {
    const exactLeft = query && left.name.toLowerCase() === query.toLowerCase() ? 1 : 0;
    const exactRight = query && right.name.toLowerCase() === query.toLowerCase() ? 1 : 0;
    if (exactLeft !== exactRight) return exactRight - exactLeft;
    const installedDelta = (installed.has(right.slug) ? 1 : 0) - (installed.has(left.slug) ? 1 : 0);
    if (installedDelta !== 0) return installedDelta;
    const usageDelta = right.total_installs + right.total_calls - (left.total_installs + left.total_calls);
    if (usageDelta !== 0) return usageDelta;
    return right.rating - left.rating || left.name.localeCompare(right.name);
  });
  const popular = [...skills].sort((left, right) => right.total_installs - left.total_installs).slice(0, 12);
  const recent = [...skills].sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 12);
  const categories = SKILL_STORE_CATEGORIES;
  const categorySections = categories.map(item => ({
    id: `category-${item.toLowerCase()}`,
    title: item,
    skills: skills.filter(skill => skill.category.toLowerCase() === item.toLowerCase()).slice(0, 12),
  })).filter(section => section.skills.length > 0);
  return {
    skills,
    categories,
    installedSlugs: [...installed],
    sections: [
      { id: 'recommended', title: 'Recommended Capabilities', skills: skills.slice(0, 12) },
      { id: 'popular', title: 'Popular', skills: popular },
      { id: 'recent', title: 'New and Updated', skills: recent },
      ...categorySections,
    ],
  };
}

export async function getSkillByIdOrSlug(idOrSlug: string): Promise<SkillMarketplaceRecord | null> {
  const skills = await loadSkills();
  return skills.find(skill => skill.id === idOrSlug || skill.slug === idOrSlug) ?? null;
}

export function buildSkillPreview(skill: SkillMarketplaceRecord) {
  const capability = skill.capabilities[0] ?? {};
  const inputExample = skill.examples[0]?.input ?? Object.fromEntries(Object.entries((capability.params ?? {}) as Record<string, unknown>).map(([key]) => [key, `<${key}>`]));
  const outputExample = skill.examples[0]?.output ?? { result: `Result from ${skill.name}` };
  return {
    inputExample,
    outputExample,
    executionExample: {
      skill: skill.slug,
      capability: String(capability.name ?? 'run'),
      params: inputExample,
    },
    expectedResults: outputExample,
  };
}

async function listInstalledSkillIds(agentId: string): Promise<Set<string>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('skill_installations')
      .select('skill_id,status')
      .eq('agent_id', agentId);
    if (!error) {
      return new Set(((data ?? []) as Array<Record<string, unknown>>)
        .filter(row => row.status !== 'removed' && row.status !== 'disabled')
        .map(row => String(row.skill_id)));
    }
  } catch {
    // Local fallback below.
  }
  const state = await readLocalRuntimeState();
  return new Set((state.skills.installations[agentId] ?? [])
    .filter(item => item.status !== 'removed' && item.status !== 'disabled')
    .map(item => item.skill_id));
}

async function upsertSkillInstallation(params: {
  agentId: string;
  workspaceId?: string | null;
  skill: SkillMarketplaceRecord;
  permissionsApproved: string[];
  dependencyInstall?: boolean;
}): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  try {
    const primary = await getSupabaseAdmin()
      .from('skill_installations')
      .upsert({
        id: randomUUID(),
        agent_id: params.agentId,
        skill_id: params.skill.id,
        workspace_id: params.workspaceId ?? null,
        status: 'active',
        permissions_approved: params.permissionsApproved,
        dependency_install: params.dependencyInstall === true,
        installed_at: now,
        updated_at: now,
      }, { onConflict: 'agent_id,skill_id' })
      .select()
      .single();
    if (!primary.error && primary.data) return primary.data as Record<string, unknown>;

    const legacy = await getSupabaseAdmin()
      .from('skill_installations')
      .insert({ agent_id: params.agentId, skill_id: params.skill.id })
      .select()
      .single();
    if (!legacy.error && legacy.data) return legacy.data as Record<string, unknown>;
    if (legacy.error?.code === '23505') throw new ValidationError('Skill already installed');
  } catch (error) {
    if (error instanceof ValidationError) throw error;
  }

  return updateLocalRuntimeState(state => {
    state.skills.installations[params.agentId] ??= [];
    const existing = state.skills.installations[params.agentId].find(item => item.skill_id === params.skill.id);
    if (existing) {
      existing.status = 'active';
      existing.workspace_id = params.workspaceId ?? null;
      existing.permissions_approved = params.permissionsApproved;
      existing.dependency_install = params.dependencyInstall === true;
      existing.updated_at = now;
      return existing as unknown as Record<string, unknown>;
    }
    const installation = {
      id: randomUUID(),
      skill_id: params.skill.id,
      workspace_id: params.workspaceId ?? null,
      status: 'active' as const,
      permissions_approved: params.permissionsApproved,
      dependency_install: params.dependencyInstall === true,
      installed_at: now,
      updated_at: now,
    };
    state.skills.installations[params.agentId].push(installation);
    return installation as unknown as Record<string, unknown>;
  });
}

export async function installSkillWithDependencies(params: {
  agentId: string;
  skillId?: string | null;
  slug?: string | null;
  workspaceId?: string | null;
  permissionsApproved?: string[];
  installDependencies?: boolean;
  optionalDependencies?: string[];
}): Promise<SkillInstallResult> {
  const target = params.skillId || params.slug;
  if (!target) throw new ValidationError('skill_id or slug is required');
  const skill = await getSkillByIdOrSlug(target);
  if (!skill || !skill.published) throw new ValidationError('Skill not found or not published');

  const requiredSecrets = skill.required_secrets;
  if (requiredSecrets.length > 0) {
    const validation = await validateRequiredSecrets({
      ownerAgentId: params.agentId,
      workspaceId: params.workspaceId ?? undefined,
      names: requiredSecrets,
    });
    if (validation.missing.length > 0) throw new ValidationError(`Missing required secrets: ${validation.missing.join(', ')}`);
  }

  const permissionsApproved = params.permissionsApproved ?? [];
  const missingPermissions = skill.permissions_required.filter(permission => !permissionsApproved.includes(permission));
  if (missingPermissions.length > 0) {
    throw new PermissionError(`Permission approval required: ${missingPermissions.join(', ')}`);
  }

  const installedIds = await listInstalledSkillIds(params.agentId);
  const dependenciesInstalled: Array<{ id: string; slug: string; name: string }> = [];
  if (params.installDependencies !== false) {
    const optional = new Set(params.optionalDependencies ?? []);
    const dependencyRefs = [...skill.required_skills, ...skill.optional_skills.filter(item => optional.has(item))];
    for (const dependencyRef of dependencyRefs) {
      const dependency = await getSkillByIdOrSlug(dependencyRef);
      if (!dependency) throw new ValidationError(`Required skill not found: ${dependencyRef}`);
      if (installedIds.has(dependency.id)) continue;
      const dependencyInstallation = await upsertSkillInstallation({
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        skill: dependency,
        permissionsApproved: dependency.permissions_required,
        dependencyInstall: true,
      });
      installedIds.add(dependency.id);
      dependenciesInstalled.push({ id: dependency.id, slug: dependency.slug, name: dependency.name });
      await recordMarketplaceInstallEvent({
        ownerAgentId: params.agentId,
        workspaceId: params.workspaceId ?? null,
        assetType: 'skill',
        assetId: dependency.id,
        sourceSlug: dependency.slug,
        name: dependency.name,
        description: dependency.description,
        href: `/skills/${dependency.slug}`,
        metadata: { dependencyInstall: true, installationId: dependencyInstallation.id ?? null },
      }).catch(() => undefined);
    }
  } else {
    const missing: string[] = [];
    for (const ref of skill.required_skills) {
      const dependency = await getSkillByIdOrSlug(ref);
      if (!dependency || !installedIds.has(dependency.id)) missing.push(ref);
    }
    if (missing.length > 0) throw new ValidationError(`Missing required skills: ${missing.join(', ')}`);
  }

  const installation = await upsertSkillInstallation({
    agentId: params.agentId,
    workspaceId: params.workspaceId,
    skill,
    permissionsApproved,
  });

  try {
    await getSupabaseAdmin()
      .from('skills')
      .update({ total_installs: skill.total_installs + (installedIds.has(skill.id) ? 0 : 1) })
      .eq('id', skill.id);
  } catch {
    await updateLocalRuntimeState(state => {
      const installedSkill = state.skills.catalog.find(item => item.id === skill.id);
      if (installedSkill && !installedIds.has(skill.id)) installedSkill.total_installs += 1;
    }).catch(() => undefined);
  }

  await recordMarketplaceInstallEvent({
    ownerAgentId: params.agentId,
    workspaceId: params.workspaceId ?? null,
    assetType: 'skill',
    assetId: skill.id,
    sourceSlug: skill.slug,
    name: skill.name,
    description: skill.description,
    href: `/skills/${skill.slug}`,
    metadata: {
      version: skill.version,
      permissionsApproved,
      dependenciesInstalled,
    },
  }).catch(() => undefined);

  return {
    success: true,
    installation,
    skill,
    dependenciesInstalled,
  };
}

export async function updateSkillInstallationPermissions(params: {
  agentId: string;
  skillIdOrSlug: string;
  permissionsApproved?: string[];
  status?: 'active' | 'disabled' | 'removed';
}): Promise<{ skill: SkillMarketplaceRecord; installation: Record<string, unknown> }> {
  const skill = await getSkillByIdOrSlug(params.skillIdOrSlug);
  if (!skill) throw new ValidationError('Skill not found');
  const now = new Date().toISOString();
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('skill_installations')
      .update({
        ...(params.permissionsApproved ? { permissions_approved: params.permissionsApproved } : {}),
        ...(params.status ? { status: params.status } : {}),
        updated_at: now,
      })
      .eq('agent_id', params.agentId)
      .eq('skill_id', skill.id)
      .select()
      .single();
    if (!error && data) return { skill, installation: data as Record<string, unknown> };
  } catch {
    // Local fallback below.
  }

  const installation = await updateLocalRuntimeState(state => {
    const entry = (state.skills.installations[params.agentId] ?? []).find(item => item.skill_id === skill.id);
    if (!entry) throw new ValidationError('Skill is not installed');
    if (params.permissionsApproved) entry.permissions_approved = params.permissionsApproved;
    if (params.status) entry.status = params.status;
    entry.updated_at = now;
    return entry as unknown as Record<string, unknown>;
  });
  return { skill, installation };
}
