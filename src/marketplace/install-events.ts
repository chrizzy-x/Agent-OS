import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { updateLocalRuntimeState } from '../storage/local-state.js';

export type MarketplaceAssetType = 'app' | 'skill' | 'workflow' | 'subagent' | 'file' | 'vault_asset' | 'memory_asset' | 'mcp_connection';

export type MarketplaceInstallEventInput = {
  ownerAgentId: string;
  workspaceId?: string | null;
  assetType: MarketplaceAssetType;
  assetId: string;
  sourceSlug: string;
  name: string;
  description: string;
  href: string;
  visibility?: 'private' | 'workspace' | 'public';
  status?: 'active' | 'disabled' | 'removed';
  metadata?: Record<string, unknown>;
};

export type MarketplacePermissionEventInput = {
  ownerAgentId: string;
  workspaceId?: string | null;
  assetType: 'app' | 'skill';
  assetId: string;
  permissionsApproved: string[];
  action: 'approve' | 'modify' | 'revoke';
  metadata?: Record<string, unknown>;
};

function librarySourceType(assetType: MarketplaceAssetType): string {
  if (assetType === 'app') return 'installed_app';
  if (assetType === 'skill') return 'installed_skill';
  if (assetType === 'workflow') return 'saved_workflow';
  if (assetType === 'subagent') return 'subagent';
  if (assetType === 'file') return 'file';
  if (assetType === 'mcp_connection') return 'mcp_connection';
  return assetType;
}

function searchText(input: MarketplaceInstallEventInput): string {
  return [
    input.name,
    input.description,
    input.assetType,
    input.sourceSlug,
    JSON.stringify(input.metadata ?? {}),
  ].join(' ').toLowerCase();
}

export async function recordMarketplaceInstallEvent(input: MarketplaceInstallEventInput): Promise<void> {
  const now = new Date().toISOString();
  const visibility = input.visibility ?? 'private';
  const status = input.status ?? 'active';
  const metadata = input.metadata ?? {};
  const libraryKind = librarySourceType(input.assetType);
  const registrySearchText = searchText(input);

  try {
    const supabase = getSupabaseAdmin();
    await Promise.all([
      input.assetType === 'app' || input.assetType === 'skill'
        ? supabase.from('marketplace_ownership').upsert({
        id: randomUUID(),
        owner_agent_id: input.ownerAgentId,
        workspace_id: input.workspaceId ?? null,
        asset_type: input.assetType,
        asset_id: input.assetId,
        source_slug: input.sourceSlug,
        status: 'owned',
        metadata,
        acquired_at: now,
        updated_at: now,
        }, { onConflict: 'owner_agent_id,asset_type,asset_id' })
        : Promise.resolve(),
      supabase.from('library_items').upsert({
        id: randomUUID(),
        owner_agent_id: input.ownerAgentId,
        workspace_id: input.workspaceId ?? null,
        project_id: null,
        source_type: libraryKind,
        source_id: input.assetId,
        name: input.name,
        description: input.description,
        visibility,
        metadata: { ...metadata, href: input.href, slug: input.sourceSlug },
        created_at: now,
        updated_at: now,
      }, { onConflict: 'owner_agent_id,source_type,source_id' }),
      supabase.from('workspace_asset_registry').upsert({
        id: randomUUID(),
        owner_agent_id: input.ownerAgentId,
        workspace_id: input.workspaceId ?? null,
        asset_type: input.assetType,
        asset_id: input.assetId,
        source_id: input.sourceSlug,
        name: input.name,
        description: input.description,
        href: input.href,
        status,
        search_text: registrySearchText,
        metadata,
        created_at: now,
        updated_at: now,
      }, { onConflict: 'owner_agent_id,asset_type,asset_id' }),
      input.assetType === 'app' || input.assetType === 'skill' || input.assetType === 'workflow' || input.assetType === 'subagent'
        ? supabase.from('marketplace_install_history').insert({
          owner_agent_id: input.ownerAgentId,
          workspace_id: input.workspaceId ?? null,
          asset_type: input.assetType,
          asset_id: input.assetId,
          source_slug: input.sourceSlug,
          version: typeof metadata.version === 'string' ? metadata.version : typeof metadata.installedVersion === 'string' ? metadata.installedVersion : null,
          device_target: typeof metadata.deviceTarget === 'string' ? metadata.deviceTarget : null,
          action: typeof metadata.historyAction === 'string' ? metadata.historyAction : 'install',
          metadata,
          created_at: now,
        })
        : Promise.resolve(),
    ]);
    return;
  } catch {
    // Fall through to local state for development and tests.
  }

  await updateLocalRuntimeState(state => {
    if (input.assetType === 'app' || input.assetType === 'skill') {
      state.marketplaceOwnership = [
        {
          id: randomUUID(),
          ownerAgentId: input.ownerAgentId,
          workspaceId: input.workspaceId ?? null,
          assetType: input.assetType,
          assetId: input.assetId,
          sourceSlug: input.sourceSlug,
          status: 'owned',
          metadata,
          acquiredAt: now,
          updatedAt: now,
        },
        ...(state.marketplaceOwnership ?? []).filter(item => !(
          item.ownerAgentId === input.ownerAgentId
          && item.assetType === input.assetType
          && item.assetId === input.assetId
        )),
      ];
    }
    state.workspaceAssetRegistry = [
      {
        id: randomUUID(),
        ownerAgentId: input.ownerAgentId,
        workspaceId: input.workspaceId ?? null,
        assetType: input.assetType,
        assetId: input.assetId,
        sourceId: input.sourceSlug,
        name: input.name,
        description: input.description,
        href: input.href,
        status,
        searchText: registrySearchText,
        metadata,
        createdAt: now,
        updatedAt: now,
      },
      ...(state.workspaceAssetRegistry ?? []).filter(item => !(
        item.ownerAgentId === input.ownerAgentId
        && item.assetType === input.assetType
        && item.assetId === input.assetId
      )),
    ];
    state.libraryItems = [
      {
        id: randomUUID(),
        ownerAgentId: input.ownerAgentId,
        workspaceId: input.workspaceId ?? null,
        projectId: null,
        sourceType: libraryKind,
        sourceId: input.assetId,
        name: input.name,
        description: input.description,
        visibility,
        metadata: { ...metadata, href: input.href, slug: input.sourceSlug },
        createdAt: now,
        updatedAt: now,
      },
      ...state.libraryItems.filter(item => !(
        item.ownerAgentId === input.ownerAgentId
        && item.sourceType === libraryKind
        && item.sourceId === input.assetId
      )),
    ];
  });
}

export async function recordMarketplacePermissionEvent(input: MarketplacePermissionEventInput): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from('marketplace_permission_history')
      .insert({
        owner_agent_id: input.ownerAgentId,
        workspace_id: input.workspaceId ?? null,
        asset_type: input.assetType,
        asset_id: input.assetId,
        permissions_approved: input.permissionsApproved,
        action: input.action,
        metadata: input.metadata ?? {},
      });
  } catch {
    // Permission history is additive and should never block install/update flows.
  }
}
