import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('Appstore product flow', () => {
  it('keeps discovery compact, searchable, and honestly labelled', () => {
    const page = source('components', 'pages', 'AppstorePage.tsx');
    const css = source('app', 'globals.css');

    expect(page).toContain('Review install');
    expect(page).toContain('In Library');
    expect(page).toContain('Pricing not listed');
    expect(page).toContain('SDK verified');
    expect(page).toContain('Web-ready');
    expect(page).toContain('Universal MCP connectors stay separate from App Store apps.');
    expect(page).toContain('Search apps by name, developer, task, or category');
    expect(css).toContain('.market-filter-row');
    expect(css).toContain('.market-card-badges');
  });

  it('requires listing review before Library install and exposes configuration actions', () => {
    const detail = source('components', 'pages', 'AppDetailPage.tsx');

    expect(detail).toContain('Install Review');
    expect(detail).toContain('Add to Library');
    expect(detail).toContain('Configure in Library');
    expect(detail).toContain('Save permissions');
    expect(detail).toContain('Remove from Library');
    expect(detail).toContain('Vault Requirements');
    expect(detail).toContain('Review and approve the requested permissions before adding this app to Library.');
    expect(detail).toContain('No Vault secret required.');
  });
});
