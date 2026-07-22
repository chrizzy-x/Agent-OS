import type { StudioMode } from './types.js';

export type StudioModeInitialState = 'NL_STUDIO' | 'WORKFLOW_STUDIO' | 'CODE_STUDIO';

export type StudioModeDefinition = {
  key: StudioMode;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  initialState: StudioModeInitialState;
};

export const STUDIO_MODES = [
  {
    key: 'nl',
    label: 'NL Studio',
    shortLabel: 'Chat',
    icon: 'N',
    description: 'Conversation-first Super AgentOS command surface.',
    initialState: 'NL_STUDIO',
  },
  {
    key: 'workflow',
    label: 'Workflow Builder',
    shortLabel: 'Flow',
    icon: 'W',
    description: 'Reusable execution graphs for apps, skills, subagents, MCP tools, and outputs.',
    initialState: 'WORKFLOW_STUDIO',
  },
  {
    key: 'code',
    label: 'Code Studio',
    shortLabel: 'Code',
    icon: 'C',
    description: 'Developer execution mode for project files, terminal work, logs, and build guidance.',
    initialState: 'CODE_STUDIO',
  },
] as const satisfies readonly StudioModeDefinition[];

const STUDIO_MODE_KEYS = new Set<StudioMode>(STUDIO_MODES.map(item => item.key));

export function normalizeStudioMode(value: string | null | undefined): StudioMode {
  return value && STUDIO_MODE_KEYS.has(value as StudioMode) ? value as StudioMode : 'nl';
}

export function getStudioModeDefinition(mode: StudioMode): StudioModeDefinition {
  return STUDIO_MODES.find(item => item.key === mode) ?? STUDIO_MODES[0];
}

export function studioModeInitialState(mode: StudioMode): StudioModeInitialState {
  return getStudioModeDefinition(mode).initialState;
}

export function buildStudioRoute(params: {
  mode: StudioMode;
  sessionId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
}): string {
  const query = new URLSearchParams();
  query.set('mode', params.mode);
  if (params.sessionId) query.set('session', params.sessionId);
  if (params.projectId) query.set('project', params.projectId);
  if (params.workspaceId) query.set('workspace', params.workspaceId);
  return `/studio?${query.toString()}`;
}
