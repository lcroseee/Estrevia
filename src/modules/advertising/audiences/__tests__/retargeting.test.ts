import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshRetargeting, hashEmail } from '../retargeting';
import type {
  RetargetingPosthogClient,
  RetargetingMetaApiClient,
  RetargetingDbClient,
} from '../retargeting';

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

const makeMockPosthog = (opts: {
  calcNoRegister?: string[];
  registerNoPaid?: string[];
} = {}): RetargetingPosthogClient => ({
  getCalcNoRegisterEmails: vi.fn().mockResolvedValue(opts.calcNoRegister ?? []),
  getRegisterNoPaidEmails: vi.fn().mockResolvedValue(opts.registerNoPaid ?? []),
});

const makeMockMetaApi = (): RetargetingMetaApiClient => ({
  upsertCustomAudience: vi
    .fn()
    .mockResolvedValueOnce({ audience_id: 'aud_cnr' })
    .mockResolvedValueOnce({ audience_id: 'aud_rnp' }),
});

const makeMockDb = (gateModes: Record<string, string | null> = {}): RetargetingDbClient => ({
  upsertAudienceRow: vi.fn().mockResolvedValue({
    id: 'row_001',
    kind: 'retargeting_calc_no_register' as const,
    metaAudienceId: null,
    size: 0,
    lastRefreshedAt: new Date(),
    sourceQuery: '',
    activeInCampaigns: [],
  }),
  getFeatureGateMode: vi.fn().mockImplementation((featureId: string) =>
    Promise.resolve(gateModes[featureId] ?? null),
  ),
  activateFeatureGate: vi.fn().mockResolvedValue(undefined),
});

const makeEmails = (count: number, suffix = ''): string[] =>
  Array.from({ length: count }, (_, i) => `user${i}${suffix}@example.com`);

const now = new Date('2026-04-26T00:00:00Z');

// ---------------------------------------------------------------------------
// hashEmail (from retargeting module)
// ---------------------------------------------------------------------------

describe('hashEmail (retargeting)', () => {
  it('produces lowercase hex SHA-256', () => {
    const hash = hashEmail('Hello@World.COM');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic across calls', () => {
    expect(hashEmail('a@b.com')).toBe(hashEmail('a@b.com'));
  });
});

// ---------------------------------------------------------------------------
// refreshRetargeting
// ---------------------------------------------------------------------------

describe('refreshRetargeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns size=0 and activated_in_meta=false for empty audiences', async () => {
    const deps = {
      posthog: makeMockPosthog(),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    const result = await refreshRetargeting(deps);

    expect(result.calc_no_register.size).toBe(0);
    expect(result.calc_no_register.activated_in_meta).toBe(false);
    expect(result.register_no_paid.size).toBe(0);
    expect(result.register_no_paid.activated_in_meta).toBe(false);
  });

  it('returns size=50 and activated_in_meta=false when below activation threshold', async () => {
    const deps = {
      posthog: makeMockPosthog({
        calcNoRegister: makeEmails(50),
        registerNoPaid: makeEmails(50, '+rnp'),
      }),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    const result = await refreshRetargeting(deps);

    expect(result.calc_no_register.size).toBe(50);
    expect(result.calc_no_register.activated_in_meta).toBe(false);
    expect(result.register_no_paid.size).toBe(50);
    expect(result.register_no_paid.activated_in_meta).toBe(false);
    expect(deps.db.activateFeatureGate).not.toHaveBeenCalled();
  });

  it('activates feature gate when size exceeds 200', async () => {
    const deps = {
      posthog: makeMockPosthog({
        calcNoRegister: makeEmails(250),
        registerNoPaid: makeEmails(201, '+rnp'),
      }),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    const result = await refreshRetargeting(deps);

    expect(result.calc_no_register.size).toBe(250);
    expect(result.calc_no_register.activated_in_meta).toBe(true);
    expect(result.register_no_paid.size).toBe(201);
    expect(result.register_no_paid.activated_in_meta).toBe(true);
    expect(deps.db.activateFeatureGate).toHaveBeenCalledTimes(2);
  });

  it('does not re-activate gate when it is already active_auto', async () => {
    const deps = {
      posthog: makeMockPosthog({
        calcNoRegister: makeEmails(300),
        registerNoPaid: makeEmails(10, '+rnp'),
      }),
      metaApi: makeMockMetaApi(),
      db: makeMockDb({
        retargeting_calc_no_register: 'active_auto',
      }),
      now,
    };

    const result = await refreshRetargeting(deps);

    expect(result.calc_no_register.activated_in_meta).toBe(false);
    expect(result.register_no_paid.activated_in_meta).toBe(false);
    expect(deps.db.activateFeatureGate).not.toHaveBeenCalled();
  });

  it('returns correct audience_ids from Meta API', async () => {
    const deps = {
      posthog: makeMockPosthog({
        calcNoRegister: makeEmails(10),
        registerNoPaid: makeEmails(10, '+rnp'),
      }),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    const result = await refreshRetargeting(deps);

    expect(result.calc_no_register.audience_id).toBe('aud_cnr');
    expect(result.register_no_paid.audience_id).toBe('aud_rnp');
  });

  it('calls posthog with correct window days (14 and 30)', async () => {
    const deps = {
      posthog: makeMockPosthog(),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    await refreshRetargeting(deps);

    expect(deps.posthog.getCalcNoRegisterEmails).toHaveBeenCalledWith(14);
    expect(deps.posthog.getRegisterNoPaidEmails).toHaveBeenCalledWith(30);
  });

  it('hashes emails before sending to Meta (no plain-text emails)', async () => {
    const emails = ['Alice@Test.COM', '  Bob@Test.COM  '];
    const deps = {
      posthog: makeMockPosthog({
        calcNoRegister: emails,
        registerNoPaid: [],
      }),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    await refreshRetargeting(deps);

    type UpsertArg = { audience_name: string; members: Array<{ email_hash: string }> };
    const upsertCalls = (deps.metaApi.upsertCustomAudience as ReturnType<typeof vi.fn>).mock.calls as UpsertArg[][];
    const cnrCallArgs = upsertCalls.find(
      (args) => args[0].audience_name.includes('calc_no_register'),
    );
    expect(cnrCallArgs).toBeDefined();
    const members: Array<{ email_hash: string }> = cnrCallArgs![0].members;
    members.forEach((m) => {
      expect(m.email_hash).toMatch(/^[0-9a-f]{64}$/);
    });
    expect(members[0].email_hash).toBe(hashEmail('Alice@Test.COM'));
    expect(members[1].email_hash).toBe(hashEmail('  Bob@Test.COM  '));
  });

  it('upserts DB rows with correct kinds', async () => {
    const deps = {
      posthog: makeMockPosthog({
        calcNoRegister: makeEmails(5),
        registerNoPaid: makeEmails(5, '+rnp'),
      }),
      metaApi: makeMockMetaApi(),
      db: makeMockDb(),
      now,
    };

    await refreshRetargeting(deps);

    type UpsertRowArg = { kind: string };
    const calls = (deps.db.upsertAudienceRow as ReturnType<typeof vi.fn>).mock.calls as UpsertRowArg[][];
    const kinds = calls.map((args) => args[0].kind);
    expect(kinds).toContain('retargeting_calc_no_register');
    expect(kinds).toContain('retargeting_register_no_paid');
  });
});
