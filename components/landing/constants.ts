export const AGENTOS_ENTRY_ROUTE = '/studio?mode=nl';
export const AGENTOS_HOME_ROUTE = '/dashboard';

export const COMMAND_DEMOS = [
  'Build and launch a complete product campaign.',
  'Research this market and prepare the full report.',
  'Turn my idea into a working product plan.',
] as const;

export const STATUS_DEMOS = [
  { label: 'Understanding your command', color: '#765FFF' },
  { label: 'Planning the execution', color: '#44A3FF' },
  { label: 'Using workspace capabilities', color: '#31C698' },
  { label: 'Delivering the completed result', color: '#FF806A' },
] as const;
