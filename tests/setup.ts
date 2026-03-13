import { vi } from 'vitest';

// ---- Environment variables required by all modules ----
process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-bytes-long-for-hs256';
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.ALLOWED_DOMAINS = 'httpbin.org,api.example.com';

// ---- Redis mock ----
export const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn().mockResolvedValue([]),
  incr: vi.fn(),
  incrby: vi.fn(),
  decrby: vi.fn(),
  expire: vi.fn(),
  exists: vi.fn(),
  lpush: vi.fn(),
  lrange: vi.fn().mockResolvedValue([]),
  llen: vi.fn().mockResolvedValue(0),
  ltrim: vi.fn(),
  publish: vi.fn(),
  pipeline: vi.fn(() => ({
    lpush: vi.fn().mockReturnThis(),
    ltrim: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    publish: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
  quit: vi.fn(),
};

vi.mock('../src/storage/redis.js', () => ({
  getRedisClient: vi.fn(() => mockRedis),
  agentKey: (prefix: string, agentId: string, key: string) => `${prefix}:${agentId}:${key}`,
  setRedisClient: vi.fn(),
  closeRedis: vi.fn(),
}));

// ---- Supabase mock ----
export const mockSupabaseStorage = {
  from: vi.fn(() => ({
    upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
    download: vi.fn().mockResolvedValue({ data: new Blob(['test content']), error: null }),
    list: vi.fn().mockResolvedValue({ data: [], error: null }),
    remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
  })),
};

export const mockSupabaseFrom = vi.fn(() => ({
  insert: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

export const mockSupabase = {
  storage: mockSupabaseStorage,
  from: mockSupabaseFrom,
  rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
};

vi.mock('../src/storage/supabase.js', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
  setSupabaseClient: vi.fn(),
  STORAGE_BUCKET: 'agent-files',
  storagePath: (agentId: string, path: string) => `${agentId}/${path}`,
}));
