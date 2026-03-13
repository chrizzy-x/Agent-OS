import { describe, it, expect, vi } from 'vitest';
import { checkFilePath, checkTableName, checkSqlSafety, checkDomainAllowed } from '../../src/runtime/security.js';
import { SecurityError, ValidationError } from '../../src/utils/errors.js';

describe('checkFilePath', () => {
  it('allows normal paths', () => {
    expect(checkFilePath('documents/report.txt')).toBe('documents/report.txt');
    expect(checkFilePath('data/2024/results.json')).toBe('data/2024/results.json');
  });

  it('normalizes leading slash', () => {
    expect(checkFilePath('notes/todo.txt')).toBe('notes/todo.txt');
  });

  it('collapses multiple slashes', () => {
    expect(checkFilePath('a//b///c')).toBe('a/b/c');
  });

  it('blocks path traversal with ..', () => {
    expect(() => checkFilePath('../etc/passwd')).toThrow(ValidationError);
    expect(() => checkFilePath('a/../../b')).toThrow(ValidationError);
    expect(() => checkFilePath('foo/../../../secret')).toThrow(ValidationError);
  });

  it('blocks Windows-style path traversal', () => {
    expect(() => checkFilePath('..\\etc\\passwd')).toThrow(ValidationError);
  });
});

describe('checkTableName', () => {
  it('returns qualified table name for valid input', () => {
    const result = checkTableName('agent123', 'users');
    expect(result).toBe('agent_agent123.users');
  });

  it('sanitizes agent ID with special chars', () => {
    const result = checkTableName('agent-with-dashes', 'data');
    expect(result).toBe('agent_agent_with_dashes.data');
  });

  it('blocks invalid table names', () => {
    expect(() => checkTableName('agent1', '123invalid')).toThrow(SecurityError);
    expect(() => checkTableName('agent1', 'has space')).toThrow(SecurityError);
    expect(() => checkTableName('agent1', 'has-dash')).toThrow(SecurityError);
  });

  it('blocks system tables', () => {
    expect(() => checkTableName('agent1', 'public')).toThrow(SecurityError);
    expect(() => checkTableName('agent1', 'information_schema')).toThrow(SecurityError);
  });
});

describe('checkSqlSafety', () => {
  it('allows normal SQL', () => {
    expect(() => checkSqlSafety('SELECT * FROM users WHERE id = $1')).not.toThrow();
    expect(() => checkSqlSafety('INSERT INTO orders (user_id, amount) VALUES ($1, $2)')).not.toThrow();
  });

  it('blocks access to system catalogs', () => {
    expect(() => checkSqlSafety('SELECT * FROM pg_catalog.pg_tables')).toThrow(SecurityError);
    expect(() => checkSqlSafety('SELECT * FROM information_schema.tables')).toThrow(SecurityError);
    expect(() => checkSqlSafety('SELECT * FROM pg_shadow')).toThrow(SecurityError);
  });
});

describe('checkDomainAllowed', () => {
  const originalEnv = process.env.ALLOWED_DOMAINS;

  it('allows domains in global ALLOWED_DOMAINS', () => {
    process.env.ALLOWED_DOMAINS = 'api.openai.com,api.anthropic.com';
    expect(() => checkDomainAllowed('https://api.openai.com/v1/chat', [])).not.toThrow();
    expect(() => checkDomainAllowed('https://api.anthropic.com/v1/messages', [])).not.toThrow();
  });

  it('allows domains in agent-specific list', () => {
    process.env.ALLOWED_DOMAINS = '';
    expect(() => checkDomainAllowed('https://custom.api.com/endpoint', ['custom.api.com'])).not.toThrow();
  });

  it('allows subdomains of allowed domains', () => {
    process.env.ALLOWED_DOMAINS = 'openai.com';
    expect(() => checkDomainAllowed('https://api.openai.com/v1', [])).not.toThrow();
  });

  it('blocks unlisted domains', () => {
    process.env.ALLOWED_DOMAINS = 'api.openai.com';
    expect(() => checkDomainAllowed('https://evil.com/steal', [])).toThrow(SecurityError);
  });

  it('blocks when no domains configured', () => {
    process.env.ALLOWED_DOMAINS = '';
    expect(() => checkDomainAllowed('https://api.openai.com/v1', [])).toThrow(SecurityError);
  });

  // Restore env after tests
  afterEach(() => {
    process.env.ALLOWED_DOMAINS = originalEnv;
  });
});
