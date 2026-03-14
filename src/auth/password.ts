import crypto from 'crypto';

const ITERATIONS = 100_000;
const KEY_LEN = 64;
const DIGEST = 'sha512';

/** Hash a plaintext password. Returns a storable string: iterations:salt:hash */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LEN, DIGEST, (err, derived) => {
      if (err) return reject(err);
      resolve(`${ITERATIONS}:${salt}:${derived.toString('hex')}`);
    });
  });
}

/** Verify a plaintext password against a stored hash string. */
export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const parts = stored.split(':');
    if (parts.length !== 3) return resolve(false);
    const [iterations, salt, hash] = parts;
    crypto.pbkdf2(password, salt, parseInt(iterations, 10), KEY_LEN, DIGEST, (err, derived) => {
      if (err) return reject(err);
      const derivedHex = derived.toString('hex');
      // Constant-time comparison
      resolve(crypto.timingSafeEqual(Buffer.from(derivedHex), Buffer.from(hash)));
    });
  });
}
