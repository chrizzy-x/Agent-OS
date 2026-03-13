import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabase } from '../../setup.js';
import { fsWrite, fsRead, fsList, fsDelete, fsMkdir, fsStat } from '../../../src/primitives/fs.js';
import { NotFoundError, ValidationError } from '../../../src/utils/errors.js';
import type { AgentContext } from '../../../src/auth/permissions.js';

const ctx: AgentContext = {
  agentId: 'fs-agent',
  allowedDomains: [],
  quotas: {
    storageQuotaBytes: 1024 * 1024 * 1024,
    memoryQuotaBytes: 100 * 1024 * 1024,
    rateLimitPerMin: 100,
  },
};

const testData = Buffer.from('hello world').toString('base64');

beforeEach(() => {
  vi.clearAllMocks();

  // Default storage mock: success
  const storageBucket = {
    upload: vi.fn().mockResolvedValue({ data: { path: 'fs-agent/test.txt' }, error: null }),
    download: vi.fn().mockResolvedValue({ data: new Blob(['hello world']), error: null }),
    list: vi.fn().mockResolvedValue({ data: [], error: null }),
    remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
  mockSupabase.storage.from.mockReturnValue(storageBucket);

  // Default DB mock: success
  const chainable = {
    insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: {}, error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { content_type: 'text/plain', size_bytes: 11, created_at: '2025-01-01', updated_at: '2025-01-01' }, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  mockSupabase.from.mockReturnValue(chainable);
});

describe('fsWrite', () => {
  it('uploads file and returns path and size', async () => {
    const result = await fsWrite(ctx, { path: 'hello.txt', data: testData, contentType: 'text/plain' });
    expect(result.path).toBe('hello.txt');
    expect(result.sizeBytes).toBe(11);
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('agent-files');
  });

  it('rejects path traversal attempts', async () => {
    await expect(fsWrite(ctx, { path: '../../etc/passwd', data: testData }))
      .rejects.toThrow(ValidationError);
  });

  it('rejects oversized files', async () => {
    const huge = Buffer.alloc(101 * 1024 * 1024).toString('base64');
    await expect(fsWrite(ctx, { path: 'big.bin', data: huge }))
      .rejects.toThrow(ValidationError);
  });
});

describe('fsRead', () => {
  it('returns base64-encoded content', async () => {
    const result = await fsRead(ctx, { path: 'hello.txt' });
    expect(result.path).toBe('hello.txt');
    expect(typeof result.data).toBe('string');
    // Decode and verify content
    expect(Buffer.from(result.data, 'base64').toString()).toBe('hello world');
  });

  it('throws NotFoundError when file does not exist', async () => {
    mockSupabase.storage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    await expect(fsRead(ctx, { path: 'missing.txt' })).rejects.toThrow(NotFoundError);
  });
});

describe('fsList', () => {
  it('returns directory entries', async () => {
    mockSupabase.storage.from.mockReturnValue({
      list: vi.fn().mockResolvedValue({
        data: [
          { name: 'file.txt', id: 'abc', metadata: { size: 100 } },
          { name: 'subdir', id: null, metadata: {} },
        ],
        error: null,
      }),
    });
    const result = await fsList(ctx, { path: '/' });
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].type).toBe('file');
    expect(result.entries[1].type).toBe('directory');
  });
});

describe('fsDelete', () => {
  it('deletes file and returns deleted: true', async () => {
    mockSupabase.storage.from.mockReturnValue({
      remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
    });
    const result = await fsDelete(ctx, { path: 'hello.txt' });
    expect(result.deleted).toBe(true);
  });
});

describe('fsMkdir', () => {
  it('creates a directory marker', async () => {
    const result = await fsMkdir(ctx, { path: 'mydir' });
    expect(result.path).toBe('mydir');
  });
});

describe('fsStat', () => {
  it('returns file metadata', async () => {
    const result = await fsStat(ctx, { path: 'hello.txt' });
    expect(result.path).toBe('hello.txt');
    expect(result.sizeBytes).toBe(11);
    expect(result.contentType).toBe('text/plain');
  });

  it('throws NotFoundError when file metadata not found', async () => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };
    mockSupabase.from.mockReturnValue(chainable);
    await expect(fsStat(ctx, { path: 'ghost.txt' })).rejects.toThrow(NotFoundError);
  });
});
