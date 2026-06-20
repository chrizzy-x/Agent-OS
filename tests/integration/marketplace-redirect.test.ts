import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware.js';

describe('marketplace slug page', () => {
  it('redirects marketplace URLs into the App Store', () => {
    const response = middleware(new NextRequest('http://localhost/marketplace/research-notes', { method: 'GET' }));
    expect(response?.headers.get('location')).toBe('http://localhost/appstore');
  });
});
