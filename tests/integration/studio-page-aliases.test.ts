import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

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

  it('renders /dashboard as the internal Home surface', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'dashboard', 'page.tsx'), 'utf8');
    expect(source).toContain("import HomePage from '@/components/pages/HomePage'");
    expect(source).toContain('return <HomePage />');
    expect(source).not.toContain("redirect('/')");
  });

  it('redirects /workspaces to /', async () => {
    const module = await import('../../app/workspaces/page.js');
    expect(() => module.default()).toThrow('REDIRECT:/');
  });
});
