import 'server-only';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const s = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!s || s.length < 32) {
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET must be set (≥32 chars)');
  }
  return s;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(sig));
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}

export async function signUnsubscribeToken(
  userId: string,
  ttlOverrideMs?: number,
): Promise<string> {
  const exp = Date.now() + (ttlOverrideMs ?? TOKEN_TTL_MS);
  const payload = `${userId}.${exp}`;
  const sig = await hmac(payload, getSecret());
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' };

export async function verifyUnsubscribeToken(token: string): Promise<VerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [payloadB64, sig] = parts;
  let payload: string;
  try {
    payload = new TextDecoder().decode(fromBase64url(payloadB64));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const [userId, expStr] = payload.split('.');
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp)) return { ok: false, reason: 'malformed' };
  const expectedSig = await hmac(payload, getSecret());
  if (sig !== expectedSig) return { ok: false, reason: 'invalid_signature' };
  if (Date.now() > exp) return { ok: false, reason: 'expired' };
  return { ok: true, userId };
}
