export const AGENTOS_DESIGN_SYSTEM = {
  buttonVariants: ['primary', 'secondary', 'ghost', 'destructive'] as const,
  stateKinds: ['empty', 'loading', 'error', 'permission', 'coming-soon', 'disabled'] as const,
  radius: {
    button: 8,
    card: 8,
    drawer: 8,
    modal: 8,
    input: 8,
  },
} as const;

export type AgentOsButtonVariant = typeof AGENTOS_DESIGN_SYSTEM.buttonVariants[number];
export type AgentOsButtonVariantInput = AgentOsButtonVariant | 'danger';
export type AgentOsStateKind = typeof AGENTOS_DESIGN_SYSTEM.stateKinds[number];

export function normalizeButtonVariant(variant?: AgentOsButtonVariantInput): AgentOsButtonVariant {
  if (variant === 'danger') return 'destructive';
  if (variant === 'primary' || variant === 'secondary' || variant === 'ghost' || variant === 'destructive') return variant;
  return 'primary';
}

export function disabledControlReason(input: {
  disabled?: boolean;
  loading?: boolean;
  disabledReason?: string;
  loadingLabel?: string;
}): string | undefined {
  if (input.loading) return input.loadingLabel ?? 'Action is running';
  if (!input.disabled) return undefined;
  return input.disabledReason?.trim() || 'Unavailable right now';
}
