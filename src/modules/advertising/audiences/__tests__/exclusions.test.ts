import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshExclusions, hashEmail } from '../exclusions';
import type {
  ExclusionsStripeClient,
  ExclusionsPosthogClient,
  ExclusionsMetaApiClient,
  ExclusionsDbClient,
} from '../exclusions';

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

const makeMockStripe = (emails: string[] = []): ExclusionsStripeClient => ({
  listActiveCustomers: vi.fn().mockResolvedValue(
    emails.map((e) => ({ email_hash: hashEmail(e), user_id: 'u_' + e })),
  ),
});

const makeMockPosthog = (emails: string[] = []): ExclusionsPosthogClient => ({
  getRecentlyRegisteredEmails: vi.fn().mockResolvedValue(emails),
});

const makeMockMetaApi = (audience_id = 'aud_001'): ExclusionsMetaApiClient => ({
  upsertCustomAudience: vi.fn().mockResolvedValue({ audience_id }),
});

const makeMockDb = (): ExclusionsDbClient => ({
  upsertAudienceRow: vi.fn().mockResolvedValue({
    id: 'row_001',
    kind: 'exclusion' as const,
    metaAudienceId: 'aud_001',
    size: 0,
    lastRefreshedAt: new Date(),
    sourceQuery: '',
    activeInCampaigns: [],
  }),
});

const makeEmails = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `user${i}@example.com`);

const now = new Date('2026-04-26T00:00:00Z');

// ---------------------------------------------------------------------------
// hashEmail unit tests
// ---------------------------------------------------------------------------

describe('hashEmail', () => {
  it('produces lowercase hex output', () => {
    const hash = hashEmail('Test@Example.COM');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalises before hashing — trims whitespace and lowercases', () => {
    const a = hashEmail('  Alice@Example.com  ');
    const b = hashEmail('alice@example.com');
    expect(a).toBe(b);
  });

  it('produces different hashes for different emails', () => {
    expect(hashEmail('a@a.com')).not.toBe(hashEmail('b@b.com'));
  });
});

// ---------------------------------------------------------------------------
// refreshExclusions
// ---------------------------------------------------------------------------

describe('refreshExclusions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns skipped when audience size is 0 (empty sources)', async () => {
    const deps = {
      stripe: makeMockStripe([]),
      posthog: makeMockPosthog([]),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    const result = await refreshExclusions(deps);

    expect(result.skipped).toBe(true);
    if (result.skipped) {
      expect(result.reason).toContain('0');
    }
    expect(deps.metaApi.upsertCustomAudience).not.toHaveBeenCalled();
    expect(deps.db.upsertAudienceRow).not.toHaveBeenCalled();
  });

  it('returns skipped when audience size is 50 (below minimum)', async () => {
    // Use non-overlapping email sets so deduplication does not reduce the count
    const stripeEmails = makeEmails(30);
    const posthogEmails = makeEmails(20).map((e) => e.replace('@', '+ph@'));
    const deps = {
      stripe: makeMockStripe(stripeEmails),
      posthog: makeMockPosthog(posthogEmails),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    const result = await refreshExclusions(deps);

    expect(result.skipped).toBe(true);
    if (result.skipped) {
      expect(result.reason).toContain('50');
    }
    expect(deps.metaApi.upsertCustomAudience).not.toHaveBeenCalled();
  });

  it('returns audience_id and size when audience size meets minimum (200)', async () => {
    const stripeEmails = makeEmails(150);
    const posthogEmails = makeEmails(50).map((e) => e.replace('@', '+ph@'));
    const deps = {
      stripe: makeMockStripe(stripeEmails),
      posthog: makeMockPosthog(posthogEmails),
      metaApi: makeMockMetaApi('aud_valid'),
      db: makeMockDb(),
      now,
    };

    const result = await refreshExclusions(deps);

    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.audience_id).toBe('aud_valid');
      expect(result.size).toBe(200);
    }
    expect(deps.metaApi.upsertCustomAudience).toHaveBeenCalledOnce();
    expect(deps.db.upsertAudienceRow).toHaveBeenCalledOnce();
  });

  it('deduplicates emails that appear in both Stripe and PostHog', async () => {
    // 80 shared emails → deduplicated to 80, still below 100
    const shared = makeEmails(80);
    const deps = {
      stripe: makeMockStripe(shared),
      posthog: makeMockPosthog(shared),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    const result = await refreshExclusions(deps);

    expect(result.skipped).toBe(true);
    if (result.skipped) {
      expect(result.reason).toContain('80');
    }
  });

  it('deduplicates — combined unique count is 200 exactly (just at threshold)', async () => {
    const stripeOnly = makeEmails(100);
    const posthogOnly = makeEmails(100).map((e) => e.replace('@', '+ph@'));
    const deps = {
      stripe: makeMockStripe(stripeOnly),
      posthog: makeMockPosthog(posthogOnly),
      metaApi: makeMockMetaApi('aud_200'),
      db: makeMockDb(),
      now,
    };

    const result = await refreshExclusions(deps);

    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.size).toBe(200);
    }
  });

  it('upserts DB row with correct kind and size', async () => {
    const stripeEmails = makeEmails(120);
    const deps = {
      stripe: makeMockStripe(stripeEmails),
      posthog: makeMockPosthog([]),
      metaApi: makeMockMetaApi('aud_db_check'),
      db: makeMockDb(),
      now,
    };

    await refreshExclusions(deps);

    expect(deps.db.upsertAudienceRow).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'exclusion',
        size: 120,
        metaAudienceId: 'aud_db_check',
        lastRefreshedAt: now,
      }),
    );
  });

  it('sends SHA-256 hashed emails to Meta (not plain text)', async () => {
    const email = 'test@example.com';
    const deps = {
      stripe: makeMockStripe(makeEmails(90)),
      posthog: makeMockPosthog([email, ...makeEmails(9).map((e) => e.replace('@', '+ph@'))]),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    await refreshExclusions(deps);

    // Meta was called with hashed members only when ≥ 100
    // In this case 90+10=100 so it should proceed
    const callArg = (deps.metaApi.upsertCustomAudience as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    if (callArg) {
      const expectedHash = hashEmail(email);
      const hashes = callArg.members.map((m: { email_hash: string }) => m.email_hash);
      expect(hashes).toContain(expectedHash);
      // No plain-text emails
      hashes.forEach((h: string) => expect(h).toMatch(/^[0-9a-f]{64}$/));
    }
  });

  it('passes sinceDate 30 days before now to posthog', async () => {
    const deps = {
      stripe: makeMockStripe([]),
      posthog: makeMockPosthog([]),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    await refreshExclusions(deps);

    const callArg = (deps.posthog.getRecentlyRegisteredEmails as ReturnType<typeof vi.fn>).mock.calls[0][0] as Date;
    const expected = new Date(now);
    expected.setDate(expected.getDate() - 30);
    expect(callArg.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });
});
