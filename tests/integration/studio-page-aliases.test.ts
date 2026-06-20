import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

vi.mock('next/navigation', () => ({
  redirect,
}));

describe('studio route aliases', () => {
  it('renders /workspace as the workspace surface', async () => {
    const module = await import('../../app/workspace/page.js');
    expect(() => module.default()).not.toThrow();
  });

  it('redirects /dashboard to /', async () => {
    const module = await import('../../app/dashboard/page.js');
    expect(() => module.default()).toThrow('REDIRECT:/');
  });

  it('redirects /workspaces to /', async () => {
    const module = await import('../../app/workspaces/page.js');
    expect(() => module.default()).toThrow('REDIRECT:/');
  });
});
