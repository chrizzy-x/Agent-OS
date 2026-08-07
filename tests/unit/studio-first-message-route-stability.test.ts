import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Studio first message route stability', () => {
  it('keeps the streamed first response mounted when the session URL is persisted', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('replaceCurrentHistoryRoute');
    expect(source).toContain('window.history.replaceState');
    expect(source).toContain('const activeProjectId = activeSession.projectId ?? currentProject?.id ?? requestedProjectId ?? null;');
    expect(source).toContain('session: {');
    expect(source).not.toContain('if (createdSession) {');
  });

  it('does not let background session refresh replace active streaming messages', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('const streamingSessionIdRef = useRef<string | null>(null);');
    expect(source).toContain('const currentWorkspaceIdRef = useRef<string | null>(currentWorkspaceId);');
    expect(source).toContain('currentWorkspaceIdRef.current = currentWorkspaceId;');
    expect(source).toContain('nextWorkspaceId && nextWorkspaceId === currentWorkspaceIdRef.current');
    expect(source).toContain('if (!activeStreamingSessionId || nextSession?.id !== activeStreamingSessionId) {');
    expect(source).toContain('if (payload.messages && streamingSessionIdRef.current !== sessionId) {');
    expect(source).toContain('streamingSessionIdRef.current = activeSession.id;');
    expect(source).toContain('streamingSessionIdRef.current = null;');
  });

  it('preserves completed streamed turns when the immediate bundle reload is stale', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('function preserveCompletedStreamedTurn');
    expect(source).toContain('let streamedAssistantContent = \'\';');
    expect(source).toContain('streamedAssistantContent += event.data.text;');
    expect(source).toContain('!hasPersistedAssistantForTurn(bundle?.messages ?? [], createdAt)');
  });

  it('sends an immediate stream status before slow backend work', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'api', 'studio', 'intent', 'stream', 'route.ts'), 'utf8');
    const streamSource = source.slice(source.indexOf('async start(controller)'));
    const firstStatusIndex = streamSource.indexOf("push('status', { text: 'Starting Super AgentOS...' });");
    const authIndex = streamSource.indexOf("requireRouteCapability(request.headers, 'studio.intent')");

    expect(firstStatusIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeGreaterThan(firstStatusIndex);
  });

  it('backfills connected intelligence when bootstrap returns an empty connection list', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('const SHELL_WORKSPACE_STORAGE_KEY = \'agentos.shell.workspace\';');
    expect(source).toContain('const INTELLIGENCE_CONNECTION_BACKFILL_DEDUPE_MS = 10_000;');
    expect(source).toContain('const STUDIO_BOOTSTRAP_CLIENT_TIMEOUT_MS = 15_000;');
    expect(source).toContain('function readStoredStudioWorkspaceId');
    expect(source).toContain('function fetchStudioBootstrapWithTimeout');
    expect(source).toContain('const [storedWorkspaceId, setStoredWorkspaceId] = useState<string | null>(null);');
    expect(source).toContain('applicationShell.activeWorkspaceId ?? storedWorkspaceId');
    expect(source).toContain('const refreshSequenceRef = useRef(0);');
    expect(source).toContain('const intelligenceConnectionBackfillStartedAtRef = useRef<Map<string, number>>(new Map());');
    expect(source).toContain('const backfillIntelligenceConnections = useCallback');
    expect(source).toContain('now - lastStartedAt < INTELLIGENCE_CONNECTION_BACKFILL_DEDUPE_MS');
    expect(source).toContain('if (requestedWorkspaceId) backfillIntelligenceConnections(requestedWorkspaceId);');
    expect(source).toContain('const response = await fetchStudioBootstrapWithTimeout');
    expect(source).toContain('const bootstrapIntelligenceConnections = (payload.intelligenceConnections ?? []) as IntelligenceConnectionRecord[];');
    expect(source).toContain('const bootstrapIntelligenceConnectionsLoaded = payload.intelligenceConnectionsLoaded !== false;');
    expect(source).toContain('cacheIntelligenceConnections(nextWorkspaceId, bootstrapIntelligenceConnections);');
    expect(source).toContain('const cachedIntelligenceConnections = readCachedIntelligenceConnections(nextWorkspaceId);');
    expect(source).toContain('intelligenceConnectionsWorkspaceIdRef.current = nextWorkspaceId ?? null;');
    expect(source).toContain('intelligenceConnectionsWorkspaceIdRef.current !== nextWorkspaceId');
    expect(source).toContain('bootstrapIntelligenceConnections.length === 0 && nextWorkspaceId');
    expect(source).toContain('/api/intelligence/connections?workspaceId=');
    expect(source).toContain('cacheIntelligenceConnections(workspaceId, connections);');
    expect(source).toContain('setIntelligenceConnections(connections)');
  });

  it('keeps bootstrap connection timeout distinguishable from an authoritative empty list', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'studio', 'bootstrap.ts'), 'utf8');

    expect(source).toContain('function withBootstrapLoadState');
    expect(source).toContain('resolve({ value: fallback, loaded: false });');
    expect(source).toContain('resolve({ value, loaded: true });');
    expect(source).toContain('intelligenceConnectionsLoaded: intelligenceConnectionLoad.loaded');
  });

  it('keeps approvals tied to the originating Studio session', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('sessionId: string | null;');
    expect(source).toContain('sessionId: typeof event.data.sessionId === \'string\'');
    expect(source).toContain('pendingApproval.sessionId ?? session?.id ?? requestedSessionId ?? null');
  });

  it('creates Studio sessions through bounded REST before provisioning fallback', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'api', 'studio', 'sessions', 'route.ts'), 'utf8');
    const postSource = source.slice(source.indexOf('export async function POST'));
    const projectResolverSource = source.slice(
      source.indexOf('async function resolveRestProjectId'),
      source.indexOf('async function resolveRestWorkspaceOwnerId'),
    );
    const directIndex = postSource.indexOf('const directSession = await createStudioSessionViaRest');
    const fallbackProjectIndex = postSource.indexOf('const project = await resolveProjectForWorkspace');

    expect(source).toContain('const STUDIO_SESSION_REST_TIMEOUT_MS = 1_500;');
    expect(source).toContain('const STUDIO_SESSION_REST_ATTEMPTS = 1;');
    expect(source).toContain('withStudioSessionRestRetry');
    expect(postSource).toContain('const requestedWorkspaceId =');
    expect(postSource).toContain('let workspaceId = requestedWorkspaceId;');
    expect(postSource).toContain('const reconcileProvisioning = async () => {');
    expect(postSource).toContain('if (error instanceof StudioSessionRestError)');
    expect(source).toContain('async function resolveRestWorkspaceOwnerId');
    expect(projectResolverSource).not.toContain('owner_agent_id:');
    expect(directIndex).toBeGreaterThan(-1);
    expect(fallbackProjectIndex).toBeGreaterThan(directIndex);
    expect(postSource).not.toContain("code: 'STUDIO_SESSION_UNAVAILABLE'");
  });
});
