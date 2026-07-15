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

  it('uses clearer shared marketplace labels for Skill Store actions', () => {
    const skillStore = source('components', 'pages', 'SkillsMarketplacePage.tsx');
    const skillDetail = source('components', 'pages', 'SkillDetailPage.tsx');

    expect(skillStore).toContain('Use skill');
    expect(skillStore).toContain('Add skill');
    expect(skillStore).toContain('Add skill failed');
    expect(skillStore).toContain('Library');
    expect(skillStore).toContain('SKILL_FILTERS');
    expect(skillStore).toContain('SKILL_SORTS');
    expect(skillStore).toContain('Vault required');
    expect(skillStore).toContain('No permissions');
    expect(skillStore).toContain('pricingLabel');
    expect(skillStore).toContain('Skill discovery is unavailable right now.');
    expect(skillDetail).toContain('Run skill');
    expect(skillDetail).toContain('Save access');
    expect(skillDetail).toContain('Revoke access');
    expect(skillDetail).not.toContain('>Manage<');
  });

  it('removes vague Manage labels from Home and Library action surfaces', () => {
    const home = source('components', 'pages', 'HomePage.tsx');
    const library = source('components', 'pages', 'LibraryPage.tsx');

    expect(home).toContain('Open Subagents');
    expect(home).not.toContain('actionLabel="Manage"');
    expect(library).toContain('data-action="configure"');
    expect(library).not.toContain('>Manage<');
  });

  it('uses clear global add labels for App Store and Skill Store surfaces', () => {
    const surfaces = source('src', 'product', 'surfaces.ts');

    expect(surfaces).toContain("primaryAction: { label: 'Add app', href: '/appstore' }");
    expect(surfaces).toContain("primaryAction: { label: 'Add skill', href: '/skillstore' }");
    expect(surfaces).not.toContain("primaryAction: { label: 'Install', href: '/skillstore' }");
  });

  it('keeps enterprise app publishing gated, previewable, and honest about review support', () => {
    const page = source('components', 'pages', 'PublishWizardPage.tsx');
    const route = source('app', 'api', 'apps', 'route.ts');

    expect(page).toContain("session?.capabilities?.includes('create_app')");
    expect(page).toContain("session?.capabilities?.includes('publish_app')");
    expect(page).toContain('Save draft');
    expect(page).toContain('Submit Review');
    expect(page).toContain('Submit Update');
    expect(page).toContain('Publish public');
    expect(page).toContain('Automated reviewer decisions are not connected yet.');
    expect(page).toContain('Review backend disabled');
    expect(page).toContain('Upload screenshots or design attachments');
    expect(page).toContain('Android build link optional');
    expect(page).toContain('iOS build link optional');
    expect(page).toContain('Desktop build link optional');
    expect(page).toContain('App manifest preview');
    expect(route).toContain('function requestsLivePublish');
    expect(route).toContain("await requireRouteCapability(request.headers, 'apps.publish');");
  });
});
