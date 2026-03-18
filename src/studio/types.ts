export type StudioResponseKind = 'help' | 'preview' | 'result' | 'error';

export type StudioCommandRequest = {
  command: string;
  confirmToken?: string;
  advancedMode?: boolean;
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
