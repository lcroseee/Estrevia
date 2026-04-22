import { describe, it, expect, beforeAll } from 'vitest';
import { createCipheriv, randomBytes } from 'crypto';
import { encrypt, decrypt, encryptBirthData, decryptBirthData, BirthData } from '../pii';

beforeAll(() => {
  // Generate a valid 64-char hex key (32 bytes) for all tests in this file
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('hex');
});

describe('encrypt / decrypt round-trip', () => {
  it('decrypts back to original plaintext (ASCII)', () => {
    const plaintext = 'Hello, Estrevia!';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('decrypts back to original plaintext (Unicode)', () => {
    const plaintext = 'Привет, мир! 日本語 🌙';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('decrypts back to original plaintext (empty string)', () => {
    const plaintext = '';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('decrypts back to original plaintext (JSON-like string)', () => {
    const plaintext = '{"date":"1990-06-21","time":"14:30","lat":55.75,"lon":37.62}';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('decrypts back to original plaintext (long string)', () => {
    const plaintext = 'a'.repeat(1000);
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (unique IV per call)', () => {
    const plaintext = 'same input';
    const first = encrypt(plaintext);
    const second = encrypt(plaintext);
    expect(first).not.toBe(second);
  });

  it('output has four colon-separated parts (version:iv:authTag:ciphertext)', () => {
    const parts = encrypt('test').split(':');
    expect(parts).toHaveLength(4);
    // First part is the version marker
    expect(parts[0]).toBe('v1');
    // Remaining three must be non-empty hex
    for (const part of parts.slice(1)) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('emits a version prefix ("v1:") on every new ciphertext', () => {
    const ciphertext = encrypt('hello');
    expect(ciphertext.startsWith('v1:')).toBe(true);
  });
});

describe('decrypt — back-compat with legacy v0 (no prefix) format', () => {
  /**
   * Builds a v0-format (legacy, pre-versioning) ciphertext for the given
   * plaintext using the same PII_ENCRYPTION_KEY the module reads. Mirrors the
   * exact format emitted by the pre-versioning implementation:
   *   `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
   */
  function encryptLegacyV0(plaintext: string): string {
    const keyHex = process.env.PII_ENCRYPTION_KEY!;
    const key = Buffer.from(keyHex, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), tag.toString('hex'), ct.toString('hex')].join(':');
  }

  it('decrypts a legacy 3-part ciphertext (no version prefix)', () => {
    const plaintext = 'legacy birth data payload';
    const legacy = encryptLegacyV0(plaintext);
    expect(legacy.split(':')).toHaveLength(3);
    expect(decrypt(legacy)).toBe(plaintext);
  });

  it('decrypts a v1 ciphertext round-trip', () => {
    const plaintext = 'new birth data payload';
    const v1 = encrypt(plaintext);
    expect(v1.startsWith('v1:')).toBe(true);
    expect(decrypt(v1)).toBe(plaintext);
  });

  it('rejects unknown version prefixes', () => {
    const v1 = encrypt('test');
    const parts = v1.split(':');
    const fake = ['v99', parts[1], parts[2], parts[3]].join(':');
    expect(() => decrypt(fake)).toThrow('Unknown key version');
  });
});

describe('encrypt / decrypt — error handling', () => {
  it('throws on invalid format (wrong number of colons)', () => {
    expect(() => decrypt('notvalid')).toThrow('Invalid encrypted data format');
  });

  it('throws on tampered ciphertext (authTag mismatch)', () => {
    const ciphertext = encrypt('secret data');
    const parts = ciphertext.split(':');
    // v1:<iv>:<authTag>:<ciphertext> — index 3 is ciphertext
    const ctHex = parts[3];
    const corrupted = ctHex.slice(0, -2) + (ctHex.slice(-2) === 'ff' ? '00' : 'ff');
    const tampered = [parts[0], parts[1], parts[2], corrupted].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on tampered authTag', () => {
    const ciphertext = encrypt('secret data');
    const parts = ciphertext.split(':');
    // v1:<iv>:<authTag>:<ciphertext> — index 2 is authTag
    const tagHex = parts[2];
    const tamperedTag = tagHex.slice(0, -2) + (tagHex.slice(-2) === 'ff' ? '00' : 'ff');
    const tampered = [parts[0], parts[1], tamperedTag, parts[3]].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws a clear error when PII_ENCRYPTION_KEY is not set', () => {
    const original = process.env.PII_ENCRYPTION_KEY;
    delete process.env.PII_ENCRYPTION_KEY;
    try {
      expect(() => encrypt('test')).toThrow('PII_ENCRYPTION_KEY environment variable is not set');
    } finally {
      process.env.PII_ENCRYPTION_KEY = original;
    }
  });

  it('throws a clear error when PII_ENCRYPTION_KEY has wrong length', () => {
    const original = process.env.PII_ENCRYPTION_KEY;
    process.env.PII_ENCRYPTION_KEY = 'tooshort';
    try {
      expect(() => encrypt('test')).toThrow('PII_ENCRYPTION_KEY must be 64 hex characters');
    } finally {
      process.env.PII_ENCRYPTION_KEY = original;
    }
  });
});

describe('encryptBirthData / decryptBirthData round-trip', () => {
  const fullData: BirthData = {
    date: '1990-06-21',
    time: '14:30',
    lat: 55.7558,
    lon: 37.6176,
  };

  const noTimeData: BirthData = {
    date: '1985-03-14',
    time: null,
    lat: 48.8566,
    lon: 2.3522,
  };

  it('round-trips birth data with known time', () => {
    const decrypted = decryptBirthData(encryptBirthData(fullData));
    expect(decrypted).toEqual(fullData);
  });

  it('round-trips birth data with null time', () => {
    const decrypted = decryptBirthData(encryptBirthData(noTimeData));
    expect(decrypted).toEqual(noTimeData);
  });

  it('preserves floating-point lat/lon precision', () => {
    const data: BirthData = { date: '2000-01-01', time: '00:00', lat: -33.8688, lon: 151.2093 };
    const decrypted = decryptBirthData(encryptBirthData(data));
    expect(decrypted.lat).toBe(-33.8688);
    expect(decrypted.lon).toBe(151.2093);
  });

  it('two encryptions of same BirthData produce different ciphertexts', () => {
    const first = encryptBirthData(fullData);
    const second = encryptBirthData(fullData);
    expect(first).not.toBe(second);
  });

  it('throws on corrupted encrypted birth data', () => {
    const encrypted = encryptBirthData(fullData);
    const parts = encrypted.split(':');
    // v1:<iv>:<authTag>:<ciphertext> — replace ciphertext with nonsense hex
    const tampered = [parts[0], parts[1], parts[2], 'deadbeef'].join(':');
    expect(() => decryptBirthData(tampered)).toThrow();
  });
});
