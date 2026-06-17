export type StudioMode = 'nl' | 'workflow' | 'code';

export type StudioContextSection =
  | 'apps'
  | 'skills'
  | 'subagents'
  | 'workflows'
  | 'memory'
  | 'files'
  | 'vault'
  | 'logs'
  | 'recovery'
  | 'notifications';

export type StudioFileNode = {
  id: string;
  name: string;
  path: string;
  kind: 'directory' | 'file';
  contentType?: string | null;
  sizeBytes?: number;
  updatedAt?: string | null;
  children?: StudioFileNode[];
};

export type StudioEditorTab = {
  id: string;
  path: string;
  name: string;
  content: string;
  encoding: 'utf8' | 'base64';
  contentType: string;
  dirty: boolean;
  readonly?: boolean;
};

export type StudioTerminalEventType =
  | 'session'
  | 'stdout'
  | 'stderr'
  | 'status'
  | 'sync'
  | 'error'
  | 'exit';

export type StudioTerminalEvent = {
  id: string;
  type: StudioTerminalEventType;
  createdAt: string;
  message?: string;
  chunk?: string;
  status?: 'idle' | 'starting' | 'running' | 'exited' | 'closed' | 'error';
  exitCode?: number | null;
};

export type StudioTerminalSession = {
  id: string;
  projectId: string;
  shell: string;
  cwd: string;
  status: 'idle' | 'starting' | 'running' | 'exited' | 'closed' | 'error';
  createdAt: string;
  updatedAt: string;
  events: StudioTerminalEvent[];
};

export type StudioResponseKind = 'help' | 'preview' | 'result' | 'error';

export type StudioCommandRequest = {
  command: string;
  confirmToken?: string;
  advancedMode?: boolean;
  sessionId?: string;
};

export type StudioPreview = {
  action: string;
  target?: string;
  payloadSummary?: string;
  risks?: string[];
};

export type StudioCommandResponse = {
  kind: StudioResponseKind;
  command: string;
  mutating: boolean;
  summary: string;
  confirmToken?: string;
  result?: unknown;
  snippet?: string;
  warnings?: string[];
  preview?: StudioPreview;
};

export type StudioCommandDefinition = {
  title: string;
  command: string;
  description: string;
  mutating: boolean;
  requiresAdvancedMode?: boolean;
};
