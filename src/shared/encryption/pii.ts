/**
 * PII encryption — AES-256-GCM with versioned output format.
 *
 * Output format (current, versioned):
 *   `v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 *
 * Legacy format (pre-2026-04, still readable for backward compatibility):
 *   `<iv_hex>:<authTag_hex>:<ciphertext_hex>`   (no version prefix — treated as v0)
 *
 * The version prefix is an ASCII marker that lets us rotate the encryption key
 * without losing access to old ciphertexts: new writes use the "current" key,
 * old ciphertexts continue to decrypt against their original key version.
 *
 * ---------------------------------------------------------------------------
 * Key rotation procedure (PII_ENCRYPTION_KEY → PII_ENCRYPTION_KEY_V2):
 * ---------------------------------------------------------------------------
 * 1. Generate a new 32-byte key:
 *      `openssl rand -hex 32`
 * 2. Add it to Vercel env as `PII_ENCRYPTION_KEY_V2` in **all** environments
 *    (production, preview, development). Do NOT remove `PII_ENCRYPTION_KEY`.
 * 3. Bump `CURRENT_KEY_VERSION` below to `'v2'` and register `v2` in the
 *    `KEY_ENV_BY_VERSION` map. Deploy. After deploy, every *new* ciphertext
 *    is written with `v2:` prefix, but old `v1:` and legacy rows still
 *    decrypt using the old key.
 * 4. Run a background re-encryption job:
 *      `SELECT id, encrypted_birth_data FROM natal_charts
 *       WHERE encrypted_birth_data NOT LIKE 'v2:%';`
 *    For each row: `decryptBirthData(old)` → `encryptBirthData(plain)` →
 *    `UPDATE natal_charts SET encrypted_birth_data = $new WHERE id = $id`.
 *    Run in batches of 500 with a throttle. Log only row IDs, never PII.
 * 5. Once the job reports zero rows without the `v2:` prefix, remove
 *    `PII_ENCRYPTION_KEY` (the v1 env var) from Vercel and drop the `v1`
 *    entry from `KEY_ENV_BY_VERSION`. Keep a one-release delay between the
 *    job finishing and key removal, in case of lag.
 *
 * Never log `PII_ENCRYPTION_KEY*`, never put it in URLs, never commit values.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------
// Every new ciphertext is written with `CURRENT_KEY_VERSION`'s prefix.
// `KEY_ENV_BY_VERSION` maps each version to the env-var name holding its key.
// Adding a new version = one-line change here + deploy.

type KeyVersion = 'v1'; // extend union when rotating: 'v1' | 'v2' | ...

const CURRENT_KEY_VERSION: KeyVersion = 'v1';

const KEY_ENV_BY_VERSION: Record<KeyVersion, string> = {
  v1: 'PII_ENCRYPTION_KEY',
};

function getKeyForVersion(version: KeyVersion): Buffer {
  const envName = KEY_ENV_BY_VERSION[version];
  const keyHex = process.env[envName];
  if (!keyHex) {
    throw new Error(`${envName} environment variable is not set`);
  }
  if (keyHex.length !== 64) {
    throw new Error(
      `${envName} must be 64 hex characters (32 bytes), got ${keyHex.length}`,
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Back-compat alias: legacy ciphertexts with no version prefix were all
 * encrypted under the original `PII_ENCRYPTION_KEY`. We alias "v0" to v1's
 * env var so `decrypt()` on a legacy blob still works without code changes.
 */
function getLegacyKey(): Buffer {
  return getKeyForVersion('v1');
}

/**
 * Encrypts a plaintext string using AES-256-GCM under the current key version.
 * Returns a string of the form `<version>:<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 */
export function encrypt(plaintext: string): string {
  const version = CURRENT_KEY_VERSION;
  const key = getKeyForVersion(version);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    version,
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts an AES-256-GCM encrypted string. Accepts both formats:
 *   - `<version>:<iv>:<authTag>:<ciphertext>` (4 parts — current)
 *   - `<iv>:<authTag>:<ciphertext>`            (3 parts — legacy v0)
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');

  let key: Buffer;
  let ivHex: string;
  let authTagHex: string;
  let ciphertextHex: string;

  if (parts.length === 4) {
    // Versioned format.
    const rawVersion = parts[0];
    if (!(rawVersion in KEY_ENV_BY_VERSION)) {
      throw new Error(`Unknown key version "${rawVersion}"`);
    }
    key = getKeyForVersion(rawVersion as KeyVersion);
    ivHex = parts[1];
    authTagHex = parts[2];
    ciphertextHex = parts[3];
  } else if (parts.length === 3) {
    // Legacy v0 format — same key, no version prefix.
    key = getLegacyKey();
    ivHex = parts[0];
    authTagHex = parts[1];
    ciphertextHex = parts[2];
  } else {
    throw new Error(
      'Invalid encrypted data format: expected version:iv:authTag:ciphertext (or legacy iv:authTag:ciphertext)',
    );
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

export interface BirthData {
  date: string;
  time: string | null;
  lat: number;
  lon: number;
  timezone?: string;
}

/**
 * Encrypts structured birth data (PII) into a single encrypted string.
 * The time field uses a sentinel value to distinguish null from empty string.
 */
export function encryptBirthData(data: BirthData): string {
  const payload = JSON.stringify({
    date: data.date,
    time: data.time,
    lat: data.lat,
    lon: data.lon,
    timezone: data.timezone ?? null,
  });
  return encrypt(payload);
}

/**
 * Decrypts an encrypted birth data string back into structured BirthData.
 */
export function decryptBirthData(encrypted: string): BirthData {
  const decrypted = decrypt(encrypted);
  const parsed = JSON.parse(decrypted) as unknown;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('date' in parsed) ||
    !('time' in parsed) ||
    !('lat' in parsed) ||
    !('lon' in parsed)
  ) {
    throw new Error('Decrypted birth data has unexpected shape');
  }

  const raw = parsed as Record<string, unknown>;

  if (typeof raw.date !== 'string') {
    throw new Error('Decrypted birth data: date must be a string');
  }
  if (raw.time !== null && typeof raw.time !== 'string') {
    throw new Error('Decrypted birth data: time must be a string or null');
  }
  if (typeof raw.lat !== 'number') {
    throw new Error('Decrypted birth data: lat must be a number');
  }
  if (typeof raw.lon !== 'number') {
    throw new Error('Decrypted birth data: lon must be a number');
  }
  if (raw.timezone !== null && raw.timezone !== undefined && typeof raw.timezone !== 'string') {
    throw new Error('Decrypted birth data: timezone must be a string or null');
  }

  return {
    date: raw.date,
    time: raw.time as string | null,
    lat: raw.lat,
    lon: raw.lon,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : undefined,
  };
}
