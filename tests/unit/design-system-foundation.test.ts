import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { AGENTOS_DESIGN_SYSTEM, disabledControlReason, normalizeButtonVariant } from '../../src/ui/design-system.js';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('design system foundation', () => {
  it('defines compact production primitives and required state kinds', () => {
    expect(AGENTOS_DESIGN_SYSTEM.buttonVariants).toEqual(['primary', 'secondary', 'ghost', 'destructive']);
    expect(AGENTOS_DESIGN_SYSTEM.stateKinds).toEqual(['empty', 'loading', 'error', 'permission', 'coming-soon', 'disabled']);
    expect(AGENTOS_DESIGN_SYSTEM.radius).toEqual({
      button: 8,
      card: 8,
      drawer: 8,
      modal: 8,
      input: 8,
    });
  });

  it('normalizes destructive controls and explains disabled states', () => {
    expect(normalizeButtonVariant()).toBe('primary');
    expect(normalizeButtonVariant('danger')).toBe('destructive');
    expect(disabledControlReason({ disabled: true, disabledReason: 'Requires Vault permission.' })).toBe('Requires Vault permission.');
    expect(disabledControlReason({ disabled: true })).toBe('Unavailable right now');
    expect(disabledControlReason({ loading: true })).toBe('Action is running');
  });

  it('exposes shared UI states without card nesting', () => {
    const ui = source('components', 'os', 'ui.tsx');
    expect(ui).toContain('export function StatePanel');
    expect(ui).toContain('export function PermissionState');
    expect(ui).toContain('export function ComingSoonState');
    expect(ui).toContain('export function DisabledState');
    expect(ui).toContain('disabledControlReason');
    expect(ui).not.toContain('<Card className="os-empty-state">');
    expect(ui).not.toContain('<Card className="os-error-state">');
  });

  it('keeps shared primitives compact in CSS', () => {
    const css = source('app', 'globals.css');
    expect(css).toContain('.os-button.primary');
    expect(css).toContain('.os-button.secondary');
    expect(css).toContain('.os-button.ghost');
    expect(css).toContain('.os-button.destructive');
    expect(css).toContain('.os-state-panel');
    expect(css).toContain('body[data-agentos-drawer-open="true"]');
    expect(css).toContain('border-radius: 8px;');
    expect(css).not.toContain('.market-store-card,\n.market-app-card,\n.market-skill-card,\n.market-update-card {\n  border-radius: 20px;');
    expect(css).not.toContain('border-radius: 24px');
    expect(css).not.toContain('border-radius: 20px');
    expect(css).not.toContain('border-radius: 16px');
  });

  it('keeps FFP UI aligned to disabled backend state', () => {
    expect(source('components', 'pages', 'FfpPage.tsx')).toContain('DisabledState');
    expect(source('components', 'pages', 'FfpPage.tsx')).toContain('ComingSoonState');
    expect(source('app', 'ffp', 'status', 'route.ts')).toContain("mode: 'coming_soon'");
    expect(source('app', 'ffp', 'status', 'route.ts')).toContain('consensusAvailable: false');
    expect(source('app', 'api', 'ffp', 'execute', 'route.ts')).toContain('{ status: 501 }');
  });
});
