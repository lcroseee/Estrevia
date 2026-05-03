import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import type { AudienceMember } from '@/shared/types/advertising';

const sha256Hex = (s: string): string =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

import { upsertCustomAudience } from '../meta-custom-audiences';

const ORIGINAL_FETCH = global.fetch;

const aliceHash = sha256Hex('alice@example.com');
const bobHash = sha256Hex('bob@example.com');

const aliceMember: AudienceMember = { email_hash: aliceHash };
const bobMember: AudienceMember = { email_hash: bobHash };

describe('upsertCustomAudience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.META_ACCESS_TOKEN = 'tok';
    process.env.META_AD_ACCOUNT_ID = 'act_999';
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_AD_ACCOUNT_ID;
  });

  it('creates a new audience when no audience with that name exists, then uploads users', async () => {
    // 1) lookup-by-name returns no matches
    // 2) create returns id
    // 3) upload returns num_received
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) }) // lookup
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'aud_111' }) }) // create
      .mockResolvedValueOnce({ ok: true, json: async () => ({ num_received: 2 }) }); // users

    const out = await upsertCustomAudience({
      audience_name: 'estrevia_exclusions',
      members: [aliceMember, bobMember],
    });

    expect(out).toEqual({ audience_id: 'aud_111' });
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const lookupUrl = mockFetch.mock.calls[0][0] as string;
    expect(lookupUrl).toMatch(/\/act_999\/customaudiences/);

    // create call uses POST and includes the right body fields
    const createCall = mockFetch.mock.calls[1];
    const createUrl = createCall[0] as string;
    expect(createUrl).toMatch(/\/act_999\/customaudiences/);
    const createInit = createCall[1] as RequestInit;
    expect(createInit.method).toBe('POST');
    const createBody = JSON.parse(createInit.body as string) as Record<string, unknown>;
    expect(createBody).toMatchObject({
      name: 'estrevia_exclusions',
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
      access_token: 'tok',
    });

    // users upload posts to /<aud_id>/users with hashed-only data
    const usersCall = mockFetch.mock.calls[2];
    const usersUrl = usersCall[0] as string;
    expect(usersUrl).toMatch(/\/aud_111\/users/);
    const usersBody = JSON.parse((usersCall[1] as RequestInit).body as string) as {
      payload: { schema: string[]; data: string[][] };
    };
    expect(usersBody.payload.schema).toEqual(['EMAIL']);
    expect(usersBody.payload.data).toEqual([[aliceHash], [bobHash]]);
  });

  it('reuses an existing audience by name (no create call) when one exists', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'aud_existing', name: 'estrevia_exclusions' }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ num_received: 1 }) });

    const out = await upsertCustomAudience({
      audience_name: 'estrevia_exclusions',
      members: [aliceMember],
    });

    expect(out.audience_id).toBe('aud_existing');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const usersUrl = mockFetch.mock.calls[1][0] as string;
    expect(usersUrl).toMatch(/\/aud_existing\/users/);
  });

  it('throws on Meta API failure during create', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'oops' });

    await expect(
      upsertCustomAudience({ audience_name: 'x', members: [aliceMember] }),
    ).rejects.toThrow(/Meta createCustomAudience failed: 500/);
  });

  it('throws on Meta API failure during users upload', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'aud_222' }) })
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad request' });

    await expect(
      upsertCustomAudience({ audience_name: 'x', members: [aliceMember] }),
    ).rejects.toThrow(/Meta upsertAudience users failed: 400/);
  });

  it('rejects members whose email_hash is not a 64-char hex SHA-256 (PII safety guard)', async () => {
    await expect(
      upsertCustomAudience({
        audience_name: 'x',
        members: [{ email_hash: 'plain-text-email@example.com' } as AudienceMember],
      }),
    ).rejects.toThrow(/email_hash/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when META_ACCESS_TOKEN is missing', async () => {
    delete process.env.META_ACCESS_TOKEN;
    await expect(
      upsertCustomAudience({ audience_name: 'x', members: [aliceMember] }),
    ).rejects.toThrow(/META_ACCESS_TOKEN/);
  });

  it('throws when META_AD_ACCOUNT_ID is missing', async () => {
    delete process.env.META_AD_ACCOUNT_ID;
    await expect(
      upsertCustomAudience({ audience_name: 'x', members: [aliceMember] }),
    ).rejects.toThrow(/META_AD_ACCOUNT_ID/);
  });
});
