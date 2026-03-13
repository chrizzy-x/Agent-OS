import { describe, it, expect } from 'vitest';
import { sanitizePath, buildAgentPath, validate } from '../../src/utils/validation.js';
import { ValidationError } from '../../src/utils/errors.js';
import { z } from 'zod';

describe('sanitizePath', () => {
  it('returns clean paths unchanged', () => {
    expect(sanitizePath('documents/file.txt')).toBe('documents/file.txt');
    expect(sanitizePath('a/b/c')).toBe('a/b/c');
  });

  it('strips leading slash', () => {
    expect(sanitizePath('file.txt')).toBe('file.txt');
  });

  it('collapses duplicate slashes', () => {
    expect(sanitizePath('a//b')).toBe('a/b');
  });

  it('removes trailing slash', () => {
    expect(sanitizePath('folder/')).toBe('folder');
  });

  it('handles dot segments', () => {
    expect(sanitizePath('a/./b')).toBe('a/b');
  });

  it('throws on path traversal', () => {
    expect(() => sanitizePath('../etc/passwd')).toThrow(ValidationError);
    expect(() => sanitizePath('a/../../secret')).toThrow(ValidationError);
  });
});

describe('buildAgentPath', () => {
  it('prefixes path with agent ID', () => {
    expect(buildAgentPath('agent123', 'data/file.txt')).toBe('agent123/data/file.txt');
  });

  it('throws on traversal attempt', () => {
    expect(() => buildAgentPath('agent123', '../other_agent/secret')).toThrow(ValidationError);
  });
});

describe('validate', () => {
  it('parses valid input', () => {
    const schema = z.object({ name: z.string() });
    const result = validate(schema, { name: 'test' });
    expect(result).toEqual({ name: 'test' });
  });

  it('throws ValidationError on invalid input', () => {
    const schema = z.object({ count: z.number() });
    expect(() => validate(schema, { count: 'not-a-number' })).toThrow(ValidationError);
  });

  it('throws ValidationError with field information', () => {
    const schema = z.object({ count: z.number() });
    try {
      validate(schema, { count: 'bad' });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).toContain('count');
    }
  });
});
