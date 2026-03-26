import crypto from 'crypto';
import { getSocialTokenEncryptionKey } from '../../config/env.js';
import { ValidationError } from '../../utils/errors.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function materializeKey(): Buffer {
  const raw = getSocialTokenEncryptionKey().trim();

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall through to the deterministic hash-based key derivation below.
  }

  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, materializeKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), ciphertext.toString('base64url'), authTag.toString('base64url')].join('.');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new ValidationError('Invalid encrypted social secret payload');
  }

  const [, ivRaw, ciphertextRaw, authTagRaw] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, materializeKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(authTagRaw, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

export function sealJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function openJson<T>(payload: string): T {
  try {
    return JSON.parse(decryptSecret(payload)) as T;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid encrypted social payload');
  }
}
