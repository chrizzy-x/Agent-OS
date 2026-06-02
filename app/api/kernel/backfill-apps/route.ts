import { NextRequest, NextResponse } from 'next/server';
import { findAccountById } from '@/src/auth/agent-store';
import { getAgentAppBySlug, listAgentApps, normalizeAgentAppSlug, upsertExternalSdkAgentApp } from '@/src/appstore/service';
import { getPlanDescriptor } from '@/src/auth/capabilities';
import { hasAdminAccess, requireOpsAdminAccess } from '@/src/auth/request';
import { normalizePlan } from '@/src/auth/tiers';
import { resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

type KernelRow = {
  agent_id?: unknown;
  workspace_id?: unknown;
  product?: unknown;
  command_topic?: unknown;
  status_topic?: unknown;
  available_commands?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    if (!hasAdminAccess(request.headers)) {
      await requireOpsAdminAccess(request.headers);
    }

    const supabase = getSupabaseAdmin();
    const primary = await supabase
      .from('kernel_registry')
      .select('agent_id,workspace_id,product,command_topic,status_topic,available_commands');
    const compat = primary.error
      ? await supabase
        .from('kernel_registry')
        .select('agent_id,product,command_topic,status_topic,available_commands')
      : { data: primary.data, error: primary.error };

    if (compat.error) throw compat.error;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let blockedMetadata = 0;
    const existingApps = await listAgentApps({ includeHidden: true, canManageAll: true });

    for (const row of (compat.data ?? []) as KernelRow[]) {
      const agentId = typeof row.agent_id === 'string' ? row.agent_id : '';
      const product = typeof row.product === 'string' ? row.product : '';
      const commandTopic = typeof row.command_topic === 'string' ? row.command_topic : '';
      const statusTopic = typeof row.status_topic === 'string' ? row.status_topic : '';
      if (!agentId || !product || !commandTopic || !statusTopic) {
        skipped += 1;
        continue;
      }

      const slug = normalizeAgentAppSlug(product);
      const existing = existingApps.find(app => app.kernelProduct === product || app.slug === slug)
        ?? await getAgentAppBySlug(slug, { canManageAll: true });
      const publisher = await findAccountById(agentId);
      const publisherPlan = normalizePlan(String(publisher?.metadata.plan ?? 'retail_free'));
      if (!getPlanDescriptor(publisherPlan).enterprise) {
        skipped += 1;
        continue;
      }
      const workspaceId = typeof row.workspace_id === 'string' && row.workspace_id.trim().length > 0
        ? row.workspace_id
        : (await resolveDefaultWorkspaceForAgent(agentId))?.id ?? null;

      try {
        await upsertExternalSdkAgentApp({
          workspaceId,
          publisherId: agentId,
          publisherName: publisher?.name ?? undefined,
          product,
          commandTopic,
          statusTopic,
          availableCommands: Array.isArray(row.available_commands)
            ? row.available_commands
                .filter((item): item is { name: string; description?: string } => Boolean(item) && typeof item === 'object' && typeof (item as { name?: string }).name === 'string')
                .map(command => ({ name: command.name, description: command.description }))
            : [],
          app: existing ? {
            name: existing.name,
            slug: existing.slug,
            category: existing.category,
            description: existing.description,
            longDescription: existing.longDescription,
            appUrl: existing.appUrl ?? undefined,
            repositoryUrl: existing.repositoryUrl ?? undefined,
            deviceTargets: existing.deviceTargets,
            manifest: existing.manifest,
            defaultConfig: existing.defaultConfig,
            visibility: existing.visibility,
          } : undefined,
        });
      } catch {
        blockedMetadata += 1;
        continue;
      }

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    return NextResponse.json({ created, updated, skipped, blockedMetadata });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
