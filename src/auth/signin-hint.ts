import { createHmac, timingSafeEqual } from 'crypto';

const SIGNIN_HINT_VERSION = 'v1';
const SIGNIN_HINT_PURPOSE = 'agentos_signin_lookup';
const SIGNIN_HINT_TTL_MS = 1000 * 60 * 60 * 24 * 120;

type SigninHintPayload = {
  purpose: typeof SIGNIN_HINT_PURPOSE;
  agentId: string;
  email: string;
  iat: number;
  exp: number;
};

function getSigninHintSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function encodePayload(payload: SigninHintPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(value: string): SigninHintPayload | null {
  try {
    const payload = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<SigninHintPayload>;
    if (payload.purpose !== SIGNIN_HINT_PURPOSE) return null;
    if (typeof payload.agentId !== 'string' || !payload.agentId.trim()) return null;
    if (typeof payload.email !== 'string' || !payload.email.trim()) return null;
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
    return payload as SigninHintPayload;
  } catch {
    return null;
  }
}

function sign(value: string): string {
  return createHmac('sha256', getSigninHintSecret()).update(value).digest('base64url');
}

function signaturesMatch(actual: string, expected: string): boolean {
  try {
    const actualBuffer = Buffer.from(actual, 'base64url');
    const expectedBuffer = Buffer.from(expected, 'base64url');
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function createSigninLookupHint(agentId: string, email: string, now = Date.now()): string {
  const payload = encodePayload({
    purpose: SIGNIN_HINT_PURPOSE,
    agentId,
    email: normalizeEmail(email),
    iat: now,
    exp: now + SIGNIN_HINT_TTL_MS,
  });
  const unsigned = `${SIGNIN_HINT_VERSION}.${payload}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function resolveSigninLookupHint(hint: string, email: string, now = Date.now()): string | null {
  const parts = hint.split('.');
  if (parts.length !== 3) return null;
  const [version, payloadValue, signature] = parts;
  if (version !== SIGNIN_HINT_VERSION) return null;

  const unsigned = `${version}.${payloadValue}`;
  if (!signaturesMatch(signature, sign(unsigned))) return null;

  const payload = decodePayload(payloadValue);
  if (!payload) return null;
  if (payload.exp <= now || payload.iat > now + 60_000) return null;
  if (normalizeEmail(payload.email) !== normalizeEmail(email)) return null;

  return payload.agentId;
}
