import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'crypto';
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

  it('output has three colon-separated parts (iv:authTag:ciphertext)', () => {
    const parts = encrypt('test').split(':');
    expect(parts).toHaveLength(3);
    // Each part must be non-empty hex
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });
});

describe('encrypt / decrypt — error handling', () => {
  it('throws on invalid format (wrong number of colons)', () => {
    expect(() => decrypt('notvalid')).toThrow('Invalid encrypted data format');
  });

  it('throws on tampered ciphertext (authTag mismatch)', () => {
    const ciphertext = encrypt('secret data');
    const parts = ciphertext.split(':');
    // Flip the last byte of the ciphertext hex to corrupt it
    const corrupted = parts[2].slice(0, -2) + (parts[2].slice(-2) === 'ff' ? '00' : 'ff');
    const tampered = [parts[0], parts[1], corrupted].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on tampered authTag', () => {
    const ciphertext = encrypt('secret data');
    const parts = ciphertext.split(':');
    const tamperedTag = parts[1].slice(0, -2) + (parts[1].slice(-2) === 'ff' ? '00' : 'ff');
    const tampered = [parts[0], tamperedTag, parts[2]].join(':');
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
    const tampered = [parts[0], parts[1], 'deadbeef'].join(':');
    expect(() => decryptBirthData(tampered)).toThrow();
  });
});
