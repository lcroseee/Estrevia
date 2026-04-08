import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.PII_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('PII_ENCRYPTION_KEY environment variable is not set');
  }
  if (keyHex.length !== 64) {
    throw new Error(
      `PII_ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${keyHex.length}`
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a colon-separated string: iv:authTag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Expects format: iv:authTag:ciphertext (all hex-encoded).
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format: expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
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
