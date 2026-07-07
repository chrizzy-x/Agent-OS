import { describe, expect, it } from 'vitest';
import {
  NAVIGATION_SURFACES,
  PRODUCT_SURFACES,
  REQUIRED_PRODUCT_SURFACE_IDS,
  getProductSurfaceById,
  isProductSurfaceActivePath,
  pageTitleForProductPath,
  primaryActionForProductPath,
} from '../../src/product/surfaces.js';

describe('product surface registry', () => {
  it('preserves every required AgentOS surface', () => {
    expect(REQUIRED_PRODUCT_SURFACE_IDS).toEqual(expect.arrayContaining([
      'home',
      'studio',
      'projects',
      'library',
      'appstore',
      'skillstore',
      'subagents',
      'workflows',
      'memory',
      'vault',
      'universal-mcp',
      'community',
      'ffp',
      'docs',
      'settings',
      'workspace',
    ]));
  });

  it('keeps required navigation surfaces visible', () => {
    const navIds = NAVIGATION_SURFACES.map(surface => surface.id);

    expect(navIds).toEqual(expect.arrayContaining([
      'home',
      'studio',
      'projects',
      'library',
      'appstore',
      'skillstore',
      'subagents',
      'workflows',
      'vault',
      'universal-mcp',
      'community',
      'ffp',
      'docs',
      'settings',
    ]));
  });

  it('marks FFP as visible but disabled/coming soon', () => {
    const ffp = getProductSurfaceById('ffp');

    expect(ffp).toMatchObject({
      href: '/ffp',
      navigation: true,
      required: true,
      status: 'coming_soon',
    });
    expect(ffp?.disabledReason).toContain('disabled');
    expect(ffp?.disabledReason).toContain('consensus');
  });

  it('keeps SDK/developer and Universal MCP distinct', () => {
    expect(getProductSurfaceById('developer')).toMatchObject({
      access: 'enterprise',
      href: '/developer',
    });
    expect(getProductSurfaceById('universal-mcp')).toMatchObject({
      access: 'signed_in',
      href: '/mcp',
    });
  });

  it('resolves aliases, page titles, and primary actions from one registry', () => {
    const skillstore = getProductSurfaceById('skillstore');

    expect(skillstore).not.toBeNull();
    expect(isProductSurfaceActivePath('/skills/installed', skillstore!)).toBe(true);
    expect(pageTitleForProductPath('/mcp')).toBe('Universal MCP');
    expect(pageTitleForProductPath('/docs/guide')).toBe('Docs');
    expect(primaryActionForProductPath('/projects')?.href).toBe('/projects?create=1');
  });

  it('defines route names, icons, access, status, and mobile visibility for all surfaces', () => {
    for (const surface of PRODUCT_SURFACES) {
      expect(surface.id).toBeTruthy();
      expect(surface.label).toBeTruthy();
      expect(surface.href).toMatch(/^\//);
      expect(surface.icon).toBeTruthy();
      expect(['public', 'signed_in', 'enterprise']).toContain(surface.access);
      expect(['active', 'coming_soon']).toContain(surface.status);
      expect(['drawer', 'context', 'hidden']).toContain(surface.mobileVisibility);
    }
  });
});
