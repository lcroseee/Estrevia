import 'server-only';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type Kind = 'user' | 'lead';

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

/**
 * Internal: signs a token of the form `${kind}.${id}.${exp}.${sig}`.
 * Use signUnsubscribeToken / signLeadUnsubscribeToken externally.
 */
async function signTyped(kind: Kind, id: string, ttlOverrideMs?: number): Promise<string> {
  const exp = Date.now() + (ttlOverrideMs ?? TOKEN_TTL_MS);
  const payload = `${kind}.${id}.${exp}`;
  const sig = await hmac(payload, getSecret());
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

export async function signUnsubscribeToken(
  userId: string,
  ttlOverrideMs?: number,
): Promise<string> {
  return signTyped('user', userId, ttlOverrideMs);
}

export async function signLeadUnsubscribeToken(
  leadId: string,
  ttlOverrideMs?: number,
): Promise<string> {
  return signTyped('lead', leadId, ttlOverrideMs);
}

export type VerifyResult =
  | { ok: true; kind: Kind; id: string }
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

  // Payload format: `${kind}.${id}.${exp}` — kind ∈ {'user', 'lead'}.
  // Backwards-compat: legacy tokens were `${id}.${exp}` (no kind prefix).
  // Detect by checking part count.
  const segments = payload.split('.');
  let kind: Kind;
  let id: string;
  let expStr: string;
  if (segments.length === 3) {
    const [k, idVal, expVal] = segments;
    if (k !== 'user' && k !== 'lead') return { ok: false, reason: 'malformed' };
    kind = k;
    id = idVal;
    expStr = expVal;
  } else if (segments.length === 2) {
    kind = 'user';
    const [idVal, expVal] = segments;
    id = idVal;
    expStr = expVal;
  } else {
    return { ok: false, reason: 'malformed' };
  }

  const exp = Number(expStr);
  if (!id || !Number.isFinite(exp)) return { ok: false, reason: 'malformed' };

  const expectedSig = await hmac(payload, getSecret());
  if (sig !== expectedSig) return { ok: false, reason: 'invalid_signature' };
  if (Date.now() > exp) return { ok: false, reason: 'expired' };
  return { ok: true, kind, id };
}
