import { randomUUID } from 'crypto';
import {
  readLocalRuntimeState,
  updateLocalRuntimeState,
  type LocalProjectRecord,
} from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { PermissionError, ValidationError } from '../utils/errors.js';
import { appendStudioEvent } from '../studio/persistence.js';
import { assertWorkspaceMembership, assertWorkspaceOwnership, listWorkspaces, type Workspace } from '../workspaces/service.js';

export type ProjectStatus = 'active' | 'archived';

export type ProjectRecord = {
  id: string;
  workspaceId: string;
  ownerAgentId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function normalizeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50) || `project-${randomUUID().slice(0, 8)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapRow(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    ownerAgentId: String(row.owner_agent_id),
    name: typeof row.name === 'string' ? row.name : 'Project',
    slug: typeof row.slug === 'string' ? row.slug : normalizeSlug(String(row.id)),
    description: typeof row.description === 'string' ? row.description : null,
    status: row.status === 'archived' ? 'archived' : 'active',
    metadata: asRecord(row.metadata),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapLocalProject(row: LocalProjectRecord): ProjectRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ownerAgentId: row.ownerAgentId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLocalProject(row: ProjectRecord): LocalProjectRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ownerAgentId: row.ownerAgentId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function defaultProjectSeed(workspace: Workspace): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id: `project_${workspace.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_default`,
    workspaceId: workspace.id,
    ownerAgentId: workspace.ownerId,
    name: 'Default Project',
    slug: 'default',
    description: 'Default project for this workspace',
    status: 'active',
    metadata: { system: true },
    createdAt: now,
    updatedAt: now,
  };
}

export async function listProjects(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  search?: string;
  status?: ProjectStatus | 'all';
}): Promise<ProjectRecord[]> {
  const workspaceIds = params.workspaceId
    ? [params.workspaceId]
    : (await listWorkspaces(params.ownerAgentId)).map(workspace => workspace.id);

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('projects')
      .select('*')
      .in('workspace_id', workspaceIds)
      .order('updated_at', { ascending: false });

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }

    const { data, error } = await query;
    if (!error) {
      let projects = ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
      if (params.search?.trim()) {
        const search = params.search.trim().toLowerCase();
        projects = projects.filter(project =>
          `${project.name} ${project.slug} ${project.description ?? ''}`.toLowerCase().includes(search),
        );
      }
      return projects;
    }
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  const projects = workspaceIds.flatMap(workspaceId => (state.projects[workspaceId] ?? []).map(mapLocalProject));
  return projects.filter(project => {
    if (params.status && params.status !== 'all' && project.status !== params.status) return false;
    if (!params.search?.trim()) return true;
    const search = params.search.trim().toLowerCase();
    return `${project.name} ${project.slug} ${project.description ?? ''}`.toLowerCase().includes(search);
  });
}

export async function getProject(params: {
  ownerAgentId: string;
  projectId: string;
}): Promise<ProjectRecord> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.projectId)
      .maybeSingle();

    if (!error && data) {
      const project = mapRow(data as Record<string, unknown>);
      await assertWorkspaceMembership(project.workspaceId, params.ownerAgentId);
      return project;
    }
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  for (const workspaceProjects of Object.values(state.projects)) {
    const project = workspaceProjects.find(item => item.id === params.projectId);
    if (project) {
      await assertWorkspaceMembership(project.workspaceId, params.ownerAgentId);
      return mapLocalProject(project);
    }
  }

  throw new PermissionError('Project not found or not accessible');
}

export async function ensureWorkspaceDefaultProject(params: {
  ownerAgentId: string;
  workspaceId: string;
}): Promise<ProjectRecord> {
  const membership = await assertWorkspaceMembership(params.workspaceId, params.ownerAgentId);
  const existing = (await listProjects({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    status: 'all',
  })).find(project => project.slug === 'default');

  if (existing) return existing;

  const seed = defaultProjectSeed(membership.workspace);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .upsert({
        id: seed.id,
        workspace_id: seed.workspaceId,
        owner_agent_id: seed.ownerAgentId,
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        status: seed.status,
        metadata: seed.metadata,
        created_at: seed.createdAt,
        updated_at: seed.updatedAt,
      }, { onConflict: 'id' })
      .select('*')
      .single();

    if (!error && data) {
      return mapRow(data as Record<string, unknown>);
    }
  } catch {
    // Fall through to local state.
  }

  return updateLocalRuntimeState(state => {
    const current = state.projects[seed.workspaceId] ?? [];
    const existingProject = current.find(item => item.slug === 'default');
    if (existingProject) return mapLocalProject(existingProject);
    state.projects[seed.workspaceId] = [toLocalProject(seed), ...current];
    return seed;
  });
}

export async function resolveProjectForWorkspace(params: {
  ownerAgentId: string;
  workspaceId: string;
  projectId?: string | null;
}): Promise<ProjectRecord> {
  if (params.projectId) {
    const project = await getProject({ ownerAgentId: params.ownerAgentId, projectId: params.projectId });
    if (project.workspaceId !== params.workspaceId) {
      throw new ValidationError('Project does not belong to the selected workspace');
    }
    return project;
  }

  const projects = await listProjects({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    status: 'active',
  });
  return projects[0] ?? ensureWorkspaceDefaultProject({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
  });
}

export async function createProject(params: {
  ownerAgentId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ProjectRecord> {
  await assertWorkspaceOwnership(params.workspaceId, params.ownerAgentId);
  const name = params.name.trim();
  if (!name) throw new ValidationError('Project name is required');

  const now = new Date().toISOString();
  const slug = normalizeSlug(name);
  const project: ProjectRecord = {
    id: randomUUID(),
    workspaceId: params.workspaceId,
    ownerAgentId: params.ownerAgentId,
    name,
    slug,
    description: params.description?.trim() || null,
    status: 'active',
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .insert({
        id: project.id,
        workspace_id: project.workspaceId,
        owner_agent_id: project.ownerAgentId,
        name: project.name,
        slug: project.slug,
        description: project.description,
        status: project.status,
        metadata: project.metadata,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      })
      .select('*')
      .single();

    if (!error && data) {
      return mapRow(data as Record<string, unknown>);
    }
  } catch {
    // Fall through to local state.
  }

  return updateLocalRuntimeState(state => {
    const current = state.projects[project.workspaceId] ?? [];
    state.projects[project.workspaceId] = [toLocalProject(project), ...current];
    return project;
  });
}

export async function updateProject(params: {
  ownerAgentId: string;
  projectId: string;
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  metadata?: Record<string, unknown>;
}): Promise<ProjectRecord> {
  const current = await getProject({
    ownerAgentId: params.ownerAgentId,
    projectId: params.projectId,
  });
  await assertWorkspaceOwnership(current.workspaceId, params.ownerAgentId);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.name !== undefined) {
    const name = params.name.trim();
    if (!name) throw new ValidationError('Project name is required');
    patch.name = name;
    patch.slug = normalizeSlug(name);
  }
  if (params.description !== undefined) patch.description = params.description?.trim() || null;
  if (params.status !== undefined) patch.status = params.status;
  if (params.metadata !== undefined) patch.metadata = params.metadata;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .update(patch)
      .eq('id', params.projectId)
      .select('*')
      .maybeSingle();

    if (!error && data) return mapRow(data as Record<string, unknown>);
  } catch {
    // Fall through to local state.
  }

  return updateLocalRuntimeState(state => {
    for (const [workspaceId, projects] of Object.entries(state.projects)) {
      const index = projects.findIndex(project => project.id === params.projectId);
      if (index < 0) continue;
      const next = {
        ...projects[index],
        ...(patch.name !== undefined ? { name: String(patch.name), slug: String(patch.slug) } : {}),
        ...(patch.description !== undefined ? { description: patch.description as string | null } : {}),
        ...(patch.status !== undefined ? { status: patch.status as ProjectStatus } : {}),
        ...(patch.metadata !== undefined ? { metadata: patch.metadata as Record<string, unknown> } : {}),
        updatedAt: String(patch.updated_at),
      };
      state.projects[workspaceId][index] = next;
      return mapLocalProject(next);
    }
    throw new PermissionError('Project not found or not accessible');
  });
}

export async function deleteProject(params: {
  ownerAgentId: string;
  projectId: string;
}): Promise<void> {
  const current = await getProject({
    ownerAgentId: params.ownerAgentId,
    projectId: params.projectId,
  });
  await assertWorkspaceOwnership(current.workspaceId, params.ownerAgentId);
  if (current.slug === 'default') {
    throw new ValidationError('Default project cannot be deleted');
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', params.projectId);
    if (!error) return;
  } catch {
    // Fall through to local state.
  }

  await updateLocalRuntimeState(state => {
    for (const [workspaceId, projects] of Object.entries(state.projects)) {
      const next = projects.filter(project => project.id !== params.projectId);
      if (next.length !== projects.length) {
        state.projects[workspaceId] = next;
        return;
      }
    }
    throw new PermissionError('Project not found or not accessible');
  });
}

export async function summarizeProjectActivity(params: {
  ownerAgentId: string;
  projectId: string;
}): Promise<{ summary: string }> {
  const project = await getProject(params);
  const sessionCount = await countProjectSessions(params.ownerAgentId, project.id);
  return {
    summary: `${project.name} has ${sessionCount} studio session${sessionCount === 1 ? '' : 's'}.`,
  };
}

async function countProjectSessions(ownerAgentId: string, projectId: string): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('nl_studio_sessions')
      .select('id')
      .eq('owner_agent_id', ownerAgentId)
      .eq('project_id', projectId);
    if (!error) return (data ?? []).length;
  } catch {
    // Fall through to local state.
  }
  return 0;
}

export async function announceProjectContext(params: {
  ownerAgentId: string;
  sessionId: string;
  projectId: string;
}): Promise<void> {
  const project = await getProject({
    ownerAgentId: params.ownerAgentId,
    projectId: params.projectId,
  });
  await appendStudioEvent({
    ownerAgentId: params.ownerAgentId,
    sessionId: params.sessionId,
    type: 'task_progress',
    payload: { summary: `Project context: ${project.name}` },
  });
}
