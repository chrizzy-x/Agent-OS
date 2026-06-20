import { describe, expect, it, vi } from 'vitest';

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: navigationMocks.redirect,
}));

import Page from '../../app/marketplace/[slug]/page.js';

describe('marketplace slug page', () => {
  it('redirects marketplace skill slugs into the public Skill Store', async () => {
    await Page({ params: Promise.resolve({ slug: 'research-notes' }) });
    expect(navigationMocks.redirect).toHaveBeenCalledWith('/skills/research-notes');
  });
});
