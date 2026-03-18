import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockSupabase } from '../setup.js';
import { POST } from '../../app/api/signup/route.js';

describe('POST /api/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 409 when the database rejects a duplicate email at insert time', async () => {
    const existingLookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    };

    const insertBuilder = {
      insert: vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
    };

    mockSupabase.from
      .mockReturnValueOnce(existingLookup)
      .mockReturnValueOnce(insertBuilder);

    const request = new NextRequest('http://localhost/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'duplicate@example.com',
        password: 'strongpass123',
        agentName: 'Duplicate Test',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('already exists');
  });
});
