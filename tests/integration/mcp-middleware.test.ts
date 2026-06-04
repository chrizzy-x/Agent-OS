import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware.js';

describe('middleware /mcp compatibility rewrite', () => {
  it('rewrites legacy POST /mcp to /api/mcp/execute', () => {
    const request = new NextRequest('http://localhost/mcp', { method: 'POST' });
    const response = middleware(request);

    expect(response?.headers.get('x-middleware-rewrite')).toBe('http://localhost/api/mcp/execute');
  });

  it('does not rewrite GET /mcp', () => {
    const request = new NextRequest('http://localhost/mcp', { method: 'GET' });
    const response = middleware(request);

    expect(response?.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
