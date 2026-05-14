import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ------------------------------------------------------------------
type LimitResult = { success: boolean };
const limitMock = vi.fn<(key: string) => Promise<LimitResult>>(async () => ({ success: true }));
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: limitMock }),
}));

interface InsertedRow {
  id: string;
  email: string;
  ip_address_hash: string | null;
  utm_source: string | null;
}
const dbState: { rows: InsertedRow[] } = { rows: [] };
function resetDb() {
  dbState.rows = [];
}
const insertChain = {
  values: vi.fn(async (vals: Record<string, unknown>) => {
    const email = vals.email as string;
    if (dbState.rows.find((r) => r.email === email)) {
      return [];
    }
    const row: InsertedRow = {
      id: vals.id as string,
      email,
      ip_address_hash: (vals.ipAddressHash as string | null) ?? null,
      utm_source: (vals.utmSource as string | null) ?? null,
    };
    dbState.rows.push(row);
    return [{ id: row.id }];
  }),
};
const insertOnConflictDoNothing = {
  onConflictDoNothing: vi.fn(() => ({ returning: () => insertChain.values(lastInsertVals) })),
};
let lastInsertVals: Record<string, unknown> = {};
const insertBuilder = {
  values: vi.fn((vals: Record<string, unknown>) => {
    lastInsertVals = vals;
    return insertOnConflictDoNothing;
  }),
};
const selectChain = {
  from: vi.fn(() => ({
    where: vi.fn(async () => {
      const email = lastSelectEmail;
      const r = dbState.rows.find((row) => row.email === email);
      return r ? [{ id: r.id }] : [];
    }),
  })),
};
let lastSelectEmail = '';
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: () => insertBuilder,
    select: () => selectChain,
  }),
}));

const trackMock = vi.fn();
vi.mock('@/shared/lib/analytics', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/analytics')>('@/shared/lib/analytics');
  return { ...actual, trackServerEvent: trackMock };
});

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://test.local/api/v1/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.42', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetDb();
  limitMock.mockClear();
  trackMock.mockClear();
  insertBuilder.values.mockClear();
  insertOnConflictDoNothing.onConflictDoNothing.mockClear();
  limitMock.mockImplementation(async () => ({ success: true }));
  lastSelectEmail = '';
  selectChain.from.mockClear();
});

async function importPOST() {
  const mod = await import('../route');
  return mod.POST;
}

describe('POST /api/v1/leads', () => {
  it('returns 200 + wasNew=true and inserts a row for a fresh email', async () => {
    const POST = await importPOST();
    const req = makeRequest({
      email: 'jane@example.com',
      chartId: 'chart_123',
      locale: 'en',
    });
    const res = await POST(req);
    const json = await res.json() as { success: boolean; data: { leadId: string; eventId: string; wasNew: boolean } | null };
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data?.wasNew).toBe(true);
    expect(json.data?.leadId).toMatch(/^[A-Za-z0-9_-]{10,}$/);
    expect(json.data?.eventId).toBe(`${json.data!.leadId}:email_lead_submitted`);
    expect(dbState.rows).toHaveLength(1);
  });

  it('returns wasNew=false on second submit of the same email; only one row exists', async () => {
    const POST = await importPOST();
    const body = { email: 'dup@example.com', chartId: 'chart_x', locale: 'en' };
    const r1 = await POST(makeRequest(body));
    const j1 = await r1.json() as { data: { leadId: string; wasNew: boolean } };
    expect(j1.data.wasNew).toBe(true);

    lastSelectEmail = 'dup@example.com';
    const r2 = await POST(makeRequest(body));
    const j2 = await r2.json() as { data: { leadId: string; wasNew: boolean } };
    expect(j2.data.wasNew).toBe(false);
    expect(j2.data.leadId).toBe(j1.data.leadId);
    expect(dbState.rows).toHaveLength(1);
  });

  it('returns 400 for invalid email format', async () => {
    const POST = await importPOST();
    const res = await POST(makeRequest({ email: 'not-an-email', locale: 'en' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when required field is missing', async () => {
    const POST = await importPOST();
    const res = await POST(makeRequest({ locale: 'en' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limiter denies', async () => {
    limitMock.mockImplementation(async () => ({ success: false }));
    const POST = await importPOST();
    const res = await POST(makeRequest({ email: 'rl@example.com', locale: 'en' }));
    expect(res.status).toBe(429);
  });

  it('fires trackServerEvent with $insert_id on wasNew=true', async () => {
    const POST = await importPOST();
    await POST(makeRequest({
      email: 'tracked@example.com',
      chartId: 'chart_t',
      locale: 'en',
      utm_source: 'meta',
      utm_campaign: 'launch',
    }));
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [, eventName, props] = trackMock.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(eventName).toBe('email_lead_submitted');
    expect(props.email).toBe('tracked@example.com');
    expect(props.utm_source).toBe('meta');
    expect(props.$insert_id).toMatch(/:email_lead_submitted$/);
  });

  it('does NOT fire trackServerEvent on wasNew=false', async () => {
    const POST = await importPOST();
    const body = { email: 'silent@example.com', chartId: 'chart_s', locale: 'en' };
    await POST(makeRequest(body));
    trackMock.mockClear();
    lastSelectEmail = 'silent@example.com';
    await POST(makeRequest(body));
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('hashes IP via SHA-256 (64 hex chars) — never stores plaintext', async () => {
    const POST = await importPOST();
    await POST(makeRequest(
      { email: 'iphash@example.com', locale: 'en' },
      { 'x-forwarded-for': '198.51.100.7' },
    ));
    const row = dbState.rows.find((r) => r.email === 'iphash@example.com');
    expect(row).toBeDefined();
    expect(row!.ip_address_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.ip_address_hash).not.toBe('198.51.100.7');
  });

  it('forwards fbc/fbp from body + IP/UA/referer from headers to trackServerEvent', async () => {
    const POST = await importPOST();
    await POST(makeRequest(
      {
        email: 'attrib@example.com',
        chartId: 'chart_a',
        locale: 'en',
        fbc: 'fb.1.1714867200.AbCdEf123',
        fbp: 'fb.1.1714867200.987654321',
      },
      {
        'x-forwarded-for': '203.0.113.42',
        'user-agent': 'Mozilla/5.0 attrib-ua',
        'referer': 'https://estrevia.app/es',
      },
    ));
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [, , props] = trackMock.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(props.fbc).toBe('fb.1.1714867200.AbCdEf123');
    expect(props.fbp).toBe('fb.1.1714867200.987654321');
    expect(props.client_ip_address).toBe('203.0.113.42');
    expect(props.client_user_agent).toBe('Mozilla/5.0 attrib-ua');
    expect(props.event_source_url).toBe('https://estrevia.app/es');
  });

  it('accepts a body without fbc/fbp (backward-compat) and forwards undefined attribution', async () => {
    const POST = await importPOST();
    await POST(makeRequest({
      email: 'noattrib@example.com',
      locale: 'en',
    }));
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [, , props] = trackMock.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(props.fbc).toBeUndefined();
    expect(props.fbp).toBeUndefined();
    expect(props.event_source_url).toBeUndefined();
  });

  it('does NOT forward client_ip_address when x-forwarded-for is absent', async () => {
    const POST = await importPOST();
    await POST(makeRequest(
      { email: 'noip@example.com', locale: 'en' },
      // Override default headers — drop x-forwarded-for completely
      // (makeRequest still merges 'x-forwarded-for' default — so override here)
    ));
    // makeRequest sets x-forwarded-for=203.0.113.42 by default. To test the
    // anonymous branch, send a request without that header.
    const reqNoIp = new Request('https://test.local/api/v1/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'noip2@example.com', locale: 'en' }),
    });
    trackMock.mockClear();
    await POST(reqNoIp);
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [, , props] = trackMock.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(props.client_ip_address).toBeUndefined();
  });
});
