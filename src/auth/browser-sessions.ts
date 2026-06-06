import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import {
  readLocalRuntimeState,
  updateLocalRuntimeState,
  type LocalAuthRefreshSessionRecord,
  type LocalSessionAuditLogRecord,
  type LocalTrustedDeviceRecord,
} from '../storage/local-state.js';
import { PermissionError } from '../utils/errors.js';

export type TrustedDeviceRecord = {
  id: string;
  agentId: string;
  fingerprint: string;
  label: string;
  userAgent: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export type RefreshSessionRecord = {
  id: string;
  agentId: string;
  deviceId: string | null;
  sessionSelector: string;
  tokenHash: string;
  userAgent: string | null;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  replacedById: string | null;
};

export type SessionAuditRecord = {
  id: string;
  agentId: string;
  sessionId: string | null;
  deviceId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const REFRESH_SESSION_TTL_DAYS = 90;

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function addDays(days: number): string {
  return new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

function readHeader(headers: Headers | globalThis.Headers, key: string): string | null {
  return headers.get(key) ?? headers.get(key.toLowerCase()) ?? null;
}

export function buildDeviceFingerprint(headers: Headers | globalThis.Headers): string {
  const userAgent = readHeader(headers, 'user-agent') ?? 'unknown';
  const acceptLanguage = readHeader(headers, 'accept-language') ?? 'unknown';
  const platform = readHeader(headers, 'sec-ch-ua-platform') ?? 'unknown';
  return sha256(`${userAgent}|${acceptLanguage}|${platform}`);
}

export function inferDeviceLabel(headers: Headers | globalThis.Headers): string {
  const platform = readHeader(headers, 'sec-ch-ua-platform');
  const userAgent = readHeader(headers, 'user-agent') ?? '';
  if (platform && platform !== 'unknown') return String(platform).replace(/"/g, '').trim();
  if (/iphone|ios/i.test(userAgent)) return 'iPhone';
  if (/ipad/i.test(userAgent)) return 'iPad';
  if (/android/i.test(userAgent)) return 'Android';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/mac os|macintosh/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Trusted device';
}

function mapDevice(row: Record<string, unknown>): TrustedDeviceRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    fingerprint: String(row.fingerprint),
    label: typeof row.label === 'string' ? row.label : 'Trusted device',
    userAgent: typeof row.user_agent === 'string' ? row.user_agent : null,
    lastSeenAt: typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
  };
}

function mapSession(row: Record<string, unknown>): RefreshSessionRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    deviceId: typeof row.device_id === 'string' ? row.device_id : null,
    sessionSelector: typeof row.session_selector === 'string' ? row.session_selector : '',
    tokenHash: typeof row.token_hash === 'string' ? row.token_hash : '',
    userAgent: typeof row.user_agent === 'string' ? row.user_agent : null,
    deviceLabel: typeof row.device_label === 'string' ? row.device_label : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    lastSeenAt: typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
    expiresAt: String(row.expires_at ?? addDays(REFRESH_SESSION_TTL_DAYS)),
    revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
    replacedById: typeof row.replaced_by_id === 'string' ? row.replaced_by_id : null,
  };
}

function mapAudit(row: Record<string, unknown>): SessionAuditRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    sessionId: typeof row.session_id === 'string' ? row.session_id : null,
    deviceId: typeof row.device_id === 'string' ? row.device_id : null,
    action: typeof row.action === 'string' ? row.action : 'session.event',
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function toLocalDevice(row: TrustedDeviceRecord): LocalTrustedDeviceRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    fingerprint: row.fingerprint,
    label: row.label,
    userAgent: row.userAgent,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

function toLocalSession(row: RefreshSessionRecord): LocalAuthRefreshSessionRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    deviceId: row.deviceId,
    sessionSelector: row.sessionSelector,
    tokenHash: row.tokenHash,
    userAgent: row.userAgent,
    deviceLabel: row.deviceLabel,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replacedById: row.replacedById,
  };
}

function toLocalAudit(row: SessionAuditRecord): LocalSessionAuditLogRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    sessionId: row.sessionId,
    deviceId: row.deviceId,
    action: row.action,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

async function recordAudit(params: {
  agentId: string;
  sessionId?: string | null;
  deviceId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date().toISOString();
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('session_audit_logs').insert({
      id: crypto.randomUUID(),
      agent_id: params.agentId,
      session_id: params.sessionId ?? null,
      device_id: params.deviceId ?? null,
      action: params.action,
      metadata: params.metadata ?? {},
      created_at: now,
    });
    return;
  } catch {
    // Fall through to local state.
  }

  await updateLocalRuntimeState(state => {
    const current = state.sessionAuditLogs[params.agentId] ?? [];
    current.unshift(toLocalAudit({
      id: crypto.randomUUID(),
      agentId: params.agentId,
      sessionId: params.sessionId ?? null,
      deviceId: params.deviceId ?? null,
      action: params.action,
      metadata: params.metadata ?? {},
      createdAt: now,
    }));
    state.sessionAuditLogs[params.agentId] = current.slice(0, 250);
  });
}

async function upsertTrustedDevice(params: {
  agentId: string;
  fingerprint: string;
  userAgent: string | null;
  label: string;
}): Promise<TrustedDeviceRecord> {
  const now = new Date().toISOString();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('trusted_devices')
      .upsert({
        agent_id: params.agentId,
        fingerprint: params.fingerprint,
        user_agent: params.userAgent,
        label: params.label,
        last_seen_at: now,
        revoked_at: null,
      }, { onConflict: 'agent_id,fingerprint' })
      .select('*')
      .single();
    if (!error && data) return mapDevice(data as Record<string, unknown>);
  } catch {
    // Fall through to local state.
  }

  return updateLocalRuntimeState(state => {
    const current = state.trustedDevices[params.agentId] ?? [];
    const existingIndex = current.findIndex(device => device.fingerprint === params.fingerprint);
    if (existingIndex >= 0) {
      const updated = {
        ...current[existingIndex],
        label: params.label,
        userAgent: params.userAgent,
        lastSeenAt: now,
        revokedAt: null,
      };
      current[existingIndex] = updated;
      state.trustedDevices[params.agentId] = current;
      return updated;
    }
    const created = toLocalDevice({
      id: crypto.randomUUID(),
      agentId: params.agentId,
      fingerprint: params.fingerprint,
      label: params.label,
      userAgent: params.userAgent,
      lastSeenAt: now,
      createdAt: now,
      revokedAt: null,
    });
    state.trustedDevices[params.agentId] = [created, ...current];
    return created;
  }).then(mapDeviceFromLocal);
}

function mapDeviceFromLocal(row: LocalTrustedDeviceRecord): TrustedDeviceRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    fingerprint: row.fingerprint,
    label: row.label,
    userAgent: row.userAgent,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

function mapSessionFromLocal(row: LocalAuthRefreshSessionRecord): RefreshSessionRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    deviceId: row.deviceId,
    sessionSelector: row.sessionSelector,
    tokenHash: row.tokenHash,
    userAgent: row.userAgent,
    deviceLabel: row.deviceLabel,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replacedById: row.replacedById,
  };
}

function mapAuditFromLocal(row: LocalSessionAuditLogRecord): SessionAuditRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    sessionId: row.sessionId,
    deviceId: row.deviceId,
    action: row.action,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

export function generateRefreshToken(): { sessionSelector: string; rawToken: string; tokenHash: string } {
  const sessionSelector = crypto.randomBytes(12).toString('hex');
  const secret = crypto.randomBytes(32).toString('base64url');
  const rawToken = `${sessionSelector}.${secret}`;
  return {
    sessionSelector,
    rawToken,
    tokenHash: sha256(rawToken),
  };
}

export function parseRefreshToken(rawToken: string | undefined): { sessionSelector: string; tokenHash: string } | null {
  if (!rawToken) return null;
  const [sessionSelector, secret] = rawToken.split('.');
  if (!sessionSelector || !secret) return null;
  return {
    sessionSelector,
    tokenHash: sha256(rawToken),
  };
}

export async function createBrowserRefreshSession(params: {
  agentId: string;
  headers: Headers | globalThis.Headers;
}): Promise<{ refreshToken: string; session: RefreshSessionRecord; device: TrustedDeviceRecord }> {
  const userAgent = readHeader(params.headers, 'user-agent');
  const device = await upsertTrustedDevice({
    agentId: params.agentId,
    fingerprint: buildDeviceFingerprint(params.headers),
    userAgent,
    label: inferDeviceLabel(params.headers),
  });
  const token = generateRefreshToken();
  const now = new Date().toISOString();
  const expiresAt = addDays(REFRESH_SESSION_TTL_DAYS);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('auth_refresh_sessions')
      .insert({
        id: crypto.randomUUID(),
        agent_id: params.agentId,
        device_id: device.id,
        session_selector: token.sessionSelector,
        token_hash: token.tokenHash,
        user_agent: userAgent,
        device_label: device.label,
        created_at: now,
        last_seen_at: now,
        expires_at: expiresAt,
      })
      .select('*')
      .single();
    if (!error && data) {
      const session = mapSession(data as Record<string, unknown>);
      await recordAudit({
        agentId: params.agentId,
        sessionId: session.id,
        deviceId: device.id,
        action: 'session.created',
        metadata: { deviceLabel: device.label },
      });
      return { refreshToken: token.rawToken, session, device };
    }
  } catch {
    // Fall through to local state.
  }

  const session = await updateLocalRuntimeState(state => {
    const current = state.authRefreshSessions[params.agentId] ?? [];
    const created = toLocalSession({
      id: crypto.randomUUID(),
      agentId: params.agentId,
      deviceId: device.id,
      sessionSelector: token.sessionSelector,
      tokenHash: token.tokenHash,
      userAgent,
      deviceLabel: device.label,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null,
      replacedById: null,
    });
    state.authRefreshSessions[params.agentId] = [created, ...current];
    return created;
  });

  await recordAudit({
    agentId: params.agentId,
    sessionId: session.id,
    deviceId: device.id,
    action: 'session.created',
    metadata: { deviceLabel: device.label },
  });
  return {
    refreshToken: token.rawToken,
    session: mapSessionFromLocal(session),
    device,
  };
}

export async function findRefreshSessionByToken(rawToken: string): Promise<RefreshSessionRecord | null> {
  const parsed = parseRefreshToken(rawToken);
  if (!parsed) return null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('auth_refresh_sessions')
      .select('*')
      .eq('session_selector', parsed.sessionSelector)
      .maybeSingle();
    if (!error && data) {
      const session = mapSession(data as Record<string, unknown>);
      if (session.tokenHash !== parsed.tokenHash) return null;
      return session;
    }
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  for (const sessions of Object.values(state.authRefreshSessions)) {
    const session = sessions.find(item => item.sessionSelector === parsed.sessionSelector);
    if (session?.tokenHash === parsed.tokenHash) return mapSessionFromLocal(session);
  }
  return null;
}

export async function rotateBrowserRefreshSession(params: {
  rawToken: string;
  headers: Headers | globalThis.Headers;
}): Promise<{ refreshToken: string; session: RefreshSessionRecord; device: TrustedDeviceRecord }> {
  const current = await findRefreshSessionByToken(params.rawToken);
  if (!current) throw new PermissionError('Refresh session not found');
  if (current.revokedAt) throw new PermissionError('Refresh session has been revoked');
  if (new Date(current.expiresAt).getTime() <= Date.now()) throw new PermissionError('Refresh session has expired');

  const userAgent = readHeader(params.headers, 'user-agent');
  const device = await upsertTrustedDevice({
    agentId: current.agentId,
    fingerprint: buildDeviceFingerprint(params.headers),
    userAgent,
    label: current.deviceLabel ?? inferDeviceLabel(params.headers),
  });
  const nextToken = generateRefreshToken();
  const now = new Date().toISOString();
  const expiresAt = addDays(REFRESH_SESSION_TTL_DAYS);

  try {
    const supabase = getSupabaseAdmin();
    const created = await supabase
      .from('auth_refresh_sessions')
      .insert({
        id: crypto.randomUUID(),
        agent_id: current.agentId,
        device_id: device.id,
        session_selector: nextToken.sessionSelector,
        token_hash: nextToken.tokenHash,
        user_agent: userAgent,
        device_label: device.label,
        created_at: now,
        last_seen_at: now,
        expires_at: expiresAt,
      })
      .select('*')
      .single();
    if (!created.error && created.data) {
      const nextSession = mapSession(created.data as Record<string, unknown>);
      await supabase
        .from('auth_refresh_sessions')
        .update({
          revoked_at: now,
          replaced_by_id: nextSession.id,
          last_seen_at: now,
        })
        .eq('id', current.id);
      await recordAudit({
        agentId: current.agentId,
        sessionId: nextSession.id,
        deviceId: device.id,
        action: 'session.rotated',
        metadata: { replacedSessionId: current.id },
      });
      return { refreshToken: nextToken.rawToken, session: nextSession, device };
    }
  } catch {
    // Fall through to local state.
  }

  const nextSession = await updateLocalRuntimeState(state => {
    const currentSessions = state.authRefreshSessions[current.agentId] ?? [];
    const currentIndex = currentSessions.findIndex(session => session.id === current.id);
    if (currentIndex < 0) throw new PermissionError('Refresh session not found');
    const created = toLocalSession({
      id: crypto.randomUUID(),
      agentId: current.agentId,
      deviceId: device.id,
      sessionSelector: nextToken.sessionSelector,
      tokenHash: nextToken.tokenHash,
      userAgent,
      deviceLabel: device.label,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null,
      replacedById: null,
    });
    currentSessions[currentIndex] = {
      ...currentSessions[currentIndex],
      revokedAt: now,
      replacedById: created.id,
      lastSeenAt: now,
    };
    state.authRefreshSessions[current.agentId] = [created, ...currentSessions];
    return created;
  });

  await recordAudit({
    agentId: current.agentId,
    sessionId: nextSession.id,
    deviceId: device.id,
    action: 'session.rotated',
    metadata: { replacedSessionId: current.id },
  });
  return {
    refreshToken: nextToken.rawToken,
    session: mapSessionFromLocal(nextSession),
    device,
  };
}

export async function revokeRefreshSession(params: {
  agentId: string;
  sessionId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('auth_refresh_sessions')
      .update({ revoked_at: now })
      .eq('id', params.sessionId)
      .eq('agent_id', params.agentId);
  } catch {
    await updateLocalRuntimeState(state => {
      const current = state.authRefreshSessions[params.agentId] ?? [];
      const index = current.findIndex(session => session.id === params.sessionId);
      if (index < 0) return;
      current[index] = { ...current[index], revokedAt: now };
      state.authRefreshSessions[params.agentId] = current;
    });
  }

  await recordAudit({
    agentId: params.agentId,
    sessionId: params.sessionId,
    action: 'session.revoked',
  });
}

export async function revokeAllRefreshSessions(agentId: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('auth_refresh_sessions')
      .update({ revoked_at: now })
      .eq('agent_id', agentId);
  } catch {
    await updateLocalRuntimeState(state => {
      const current = state.authRefreshSessions[agentId] ?? [];
      state.authRefreshSessions[agentId] = current.map(session => ({ ...session, revokedAt: now }));
    });
  }

  await recordAudit({
    agentId,
    action: 'session.revoked_all',
  });
}

export async function listRefreshSessions(agentId: string): Promise<RefreshSessionRecord[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('auth_refresh_sessions')
      .select('*')
      .eq('agent_id', agentId)
      .order('last_seen_at', { ascending: false });
    if (!error) return ((data ?? []) as Array<Record<string, unknown>>).map(mapSession);
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  return (state.authRefreshSessions[agentId] ?? []).map(mapSessionFromLocal);
}

export async function listTrustedDevices(agentId: string): Promise<TrustedDeviceRecord[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('trusted_devices')
      .select('*')
      .eq('agent_id', agentId)
      .order('last_seen_at', { ascending: false });
    if (!error) return ((data ?? []) as Array<Record<string, unknown>>).map(mapDevice);
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  return (state.trustedDevices[agentId] ?? []).map(mapDeviceFromLocal);
}

export async function listSessionAuditLogs(agentId: string): Promise<SessionAuditRecord[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('session_audit_logs')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error) return ((data ?? []) as Array<Record<string, unknown>>).map(mapAudit);
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  return (state.sessionAuditLogs[agentId] ?? []).map(mapAuditFromLocal);
}
