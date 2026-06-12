import { filterAccessibleResources } from '../access/service.js';
import { scoreSearchMatch } from '../search/scoring.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { listWorkspaces } from '../workspaces/service.js';
import { PermissionError, ValidationError } from '../utils/errors.js';

export type ChatSearchMatch = {
  messageId: string;
  sessionId: string;
  sessionTitle: string;
  snippet: string;
  senderType: 'user' | 'assistant' | 'system';
  timestamp: string;
  matchPositions: Array<{ start: number; end: number }>;
};

type SearchableSession = {
  id: string;
  ownerAgentId: string;
  workspaceId: string | null;
  visibility: 'private' | 'workspace' | 'public';
  title: string;
};

type SearchableMessage = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  searchText: string;
  createdAt: string;
};

function normalizeSessionVisibility(value: unknown): 'private' | 'workspace' | 'public' {
  return value === 'workspace' || value === 'public' ? value : 'private';
}

function normalizeQuery(query: string): string {
  const normalized = query.trim().toLowerCase();
  if (!normalized) throw new ValidationError('Search query is required');
  return normalized;
}

function buildMatchPositions(haystack: string, needle: string): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < haystack.length) {
    const next = haystack.indexOf(needle, cursor);
    if (next < 0) break;
    positions.push({ start: next, end: next + needle.length });
    cursor = next + needle.length;
    if (positions.length >= 20) break;
  }
  return positions;
}

function buildSnippet(content: string, start: number, end: number): string {
  const prefix = Math.max(0, start - 40);
  const suffix = Math.min(content.length, end + 80);
  return content.slice(prefix, suffix).trim();
}

async function listAccessibleSessions(viewerAgentId: string): Promise<SearchableSession[]> {
  const workspaceIds = (await listWorkspaces(viewerAgentId)).map(workspace => workspace.id);
  const supabase = getSupabaseAdmin();
  const [owned, workspaceVisible, publicVisible] = await Promise.all([
    supabase
      .from('nl_studio_sessions')
      .select('id,owner_agent_id,workspace_id,visibility,title')
      .eq('owner_agent_id', viewerAgentId),
    workspaceIds.length > 0
      ? supabase
        .from('nl_studio_sessions')
        .select('id,owner_agent_id,workspace_id,visibility,title')
        .in('workspace_id', workspaceIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('nl_studio_sessions')
      .select('id,owner_agent_id,workspace_id,visibility,title')
      .eq('visibility', 'public'),
  ]);

  for (const result of [owned, workspaceVisible, publicVisible]) {
    if (result.error) throw new Error(`Failed to load searchable sessions: ${result.error.message}`);
  }

  const sessionMap = new Map<string, SearchableSession>();
  for (const row of [...(owned.data ?? []), ...(workspaceVisible.data ?? []), ...(publicVisible.data ?? [])] as Array<Record<string, unknown>>) {
    sessionMap.set(String(row.id), {
      id: String(row.id),
      ownerAgentId: String(row.owner_agent_id),
      workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
      visibility: normalizeSessionVisibility(row.visibility),
      title: typeof row.title === 'string' ? row.title : 'Studio Session',
    });
  }

  return filterAccessibleResources({
    viewer: { agentId: viewerAgentId, workspaceIds },
    resources: [...sessionMap.values()],
    sourceType: 'session',
    permission: 'session:read',
  });
}

function mapMessage(row: Record<string, unknown>): SearchableMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
    content: String(row.content ?? ''),
    searchText: typeof row.search_text === 'string' && row.search_text.trim()
      ? row.search_text
      : String(row.content ?? '').toLowerCase(),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function searchStudioSessionMessages(params: {
  viewerAgentId: string;
  sessionId: string;
  query: string;
  limit?: number;
}): Promise<ChatSearchMatch[]> {
  const normalized = normalizeQuery(params.query);
  const sessions = await listAccessibleSessions(params.viewerAgentId);
  const session = sessions.find(item => item.id === params.sessionId);
  if (!session) throw new PermissionError('Studio session not found or not accessible');

  const { data, error } = await getSupabaseAdmin()
    .from('nl_studio_messages')
    .select('id,session_id,role,content,search_text,created_at')
    .eq('session_id', params.sessionId)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(params.limit ?? 200, 500)));

  if (error) throw new Error(`Failed to search Studio session: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[])
    .map(mapMessage)
    .flatMap(message => {
      const positions = buildMatchPositions(message.searchText, normalized);
      if (positions.length === 0) return [];
      const first = positions[0];
      return [{
        messageId: message.id,
        sessionId: session.id,
        sessionTitle: session.title,
        snippet: buildSnippet(message.content, first.start, first.end),
        senderType: message.role,
        timestamp: message.createdAt,
        matchPositions: positions,
        score: scoreSearchMatch(normalized, message.searchText, message.content, session.title),
      }];
    })
    .sort((left, right) => right.score - left.score || right.timestamp.localeCompare(left.timestamp))
    .map(({ score: _score, ...match }) => match);
}

export async function searchAccessibleChatMessages(params: {
  viewerAgentId: string;
  query: string;
  scope: 'current' | 'workspace' | 'all';
  currentSessionId?: string | null;
  limit?: number;
}): Promise<ChatSearchMatch[]> {
  const normalized = normalizeQuery(params.query);
  if (params.scope === 'current') {
    if (!params.currentSessionId) throw new ValidationError('Current session is required for current-scope search');
    return searchStudioSessionMessages({
      viewerAgentId: params.viewerAgentId,
      sessionId: params.currentSessionId,
      query: normalized,
      limit: params.limit,
    });
  }

  const sessions = await listAccessibleSessions(params.viewerAgentId);
  const viewerWorkspaceIds = (await listWorkspaces(params.viewerAgentId)).map(workspace => workspace.id);
  const scopedSessions = params.scope === 'workspace'
    ? sessions.filter(session => session.workspaceId && viewerWorkspaceIds.includes(session.workspaceId))
    : sessions;

  if (scopedSessions.length === 0) return [];
  const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
  const { data, error } = await getSupabaseAdmin()
    .from('nl_studio_messages')
    .select('id,session_id,role,content,search_text,created_at')
    .in('session_id', scopedSessions.map(session => session.id))
    .order('created_at', { ascending: false })
    .limit(limit * 8);

  if (error) throw new Error(`Failed to search accessible chats: ${error.message}`);
  const sessionMap = new Map(scopedSessions.map(session => [session.id, session]));

  return ((data ?? []) as Record<string, unknown>[])
    .map(mapMessage)
    .flatMap(message => {
      const session = sessionMap.get(message.sessionId);
      if (!session) return [];
      const positions = buildMatchPositions(message.searchText, normalized);
      const score = scoreSearchMatch(normalized, message.searchText, message.content, session.title);
      if (positions.length === 0 && score === 0) return [];
      const first = positions[0];
      return [{
        messageId: message.id,
        sessionId: message.sessionId,
        sessionTitle: session.title,
        snippet: first ? buildSnippet(message.content, first.start, first.end) : message.content.slice(0, 120).trim(),
        senderType: message.role,
        timestamp: message.createdAt,
        matchPositions: positions,
        score,
      }];
    })
    .sort((left, right) => right.score - left.score || right.timestamp.localeCompare(left.timestamp))
    .map(({ score: _score, ...match }) => match)
    .slice(0, limit);
}
