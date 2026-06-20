import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware.js';

describe('studio route aliases', () => {
  it('redirects /workspace to /', () => {
    const response = middleware(new NextRequest('http://localhost/workspace', { method: 'GET' }));
    expect(response?.headers.get('location')).toBe('http://localhost/');
  });

  it('redirects /dashboard to /', () => {
    const response = middleware(new NextRequest('http://localhost/dashboard', { method: 'GET' }));
    expect(response?.headers.get('location')).toBe('http://localhost/');
  });

  it('redirects /workspaces to /', () => {
    const response = middleware(new NextRequest('http://localhost/workspaces', { method: 'GET' }));
    expect(response?.headers.get('location')).toBe('http://localhost/');
  });
});
