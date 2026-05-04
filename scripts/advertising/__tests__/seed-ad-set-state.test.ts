import { describe, it, expect, vi } from 'vitest';
import {
  buildInsertSql,
  lookupCampaignId,
  runSeed,
  type SqlClient,
  type FetchLike,
  type SeedRunOpts,
} from '../seed-ad-set-state';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFetchOk(payload: Record<string, unknown>): FetchLike {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  })) as unknown as FetchLike;
}

function makeFetchErr(status: number, body: string): FetchLike {
  return vi.fn(async () => ({
    ok: false,
    status,
    json: async () => ({ error: body }),
    text: async () => body,
  })) as unknown as FetchLike;
}

interface SqlCall {
  text: string;
  params: unknown[] | undefined;
}

function makeSql(opts: {
  /** Map of ad_set_id → row count to return for the COUNT pre-flight query. */
  presentBefore?: Record<string, number>;
  /** Rows to return for the verification SELECT (any other call). */
  selectRows?: unknown[];
}): { sql: SqlClient; calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  const presentBefore = opts.presentBefore ?? {};
  const sql: SqlClient = {
    async query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
      calls.push({ text, params });
      if (text.includes('SELECT COUNT(*)')) {
        const adSetId = String(params?.[0] ?? '');
        const count = presentBefore[adSetId] ?? 0;
        return [{ count: String(count) }] as unknown as T[];
      }
      if (text.trim().startsWith('INSERT')) {
        return [] as T[];
      }
      return (opts.selectRows ?? []) as T[];
    },
  };
  return { sql, calls };
}

const silentLogger: SeedRunOpts['logger'] = {
  log: vi.fn(),
  error: vi.fn(),
  table: vi.fn(),
};

// ---------------------------------------------------------------------------
// buildInsertSql
// ---------------------------------------------------------------------------

describe('buildInsertSql', () => {
  it('targets the advertising_ad_set_state table with ON CONFLICT DO NOTHING', () => {
    const { text } = buildInsertSql();
    expect(text).toContain('"advertising_ad_set_state"');
    expect(text).toContain('ON CONFLICT ("ad_set_id") DO NOTHING');
  });

  it('hard-codes current_phase=B (skip Phase A — launch ad sets are already live)', () => {
    const { text } = buildInsertSql();
    expect(text).toContain("'B'");
    expect(text).toContain("'COLD_START'");
    expect(text).toContain("'landing_page_view'");
  });

  it('uses parameterized placeholders for ad_set_id, campaign_id, locale', () => {
    const { text, paramNames } = buildInsertSql();
    expect(text).toContain('$1');
    expect(text).toContain('$2');
    expect(text).toContain('$3');
    expect(paramNames).toEqual(['ad_set_id', 'campaign_id', 'locale']);
  });
});

// ---------------------------------------------------------------------------
// lookupCampaignId
// ---------------------------------------------------------------------------

describe('lookupCampaignId', () => {
  it('hits Graph API v22.0 with fields=campaign_id and the access token', async () => {
    const fetchImpl = makeFetchOk({ id: 'as_1', campaign_id: 'cmp_1' });
    await lookupCampaignId('as_1', 'TOKEN_X', fetchImpl);

    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain('https://graph.facebook.com/v22.0/as_1');
    expect(url).toContain('fields=campaign_id');
    expect(url).toContain('access_token=TOKEN_X');
  });

  it('returns the campaign_id from the response body', async () => {
    const fetchImpl = makeFetchOk({ campaign_id: 'cmp_42' });
    expect(await lookupCampaignId('as_x', 'tok', fetchImpl)).toBe('cmp_42');
  });

  it('throws on non-2xx response, including status code in the error', async () => {
    const fetchImpl = makeFetchErr(400, 'oauth error');
    await expect(lookupCampaignId('as_bad', 'tok', fetchImpl)).rejects.toThrow(/400/);
  });

  it('throws when response body is missing campaign_id', async () => {
    const fetchImpl = makeFetchOk({ id: 'as_1' });
    await expect(lookupCampaignId('as_1', 'tok', fetchImpl)).rejects.toThrow(/missing campaign_id/);
  });

  it('URL-encodes the ad set ID and access token', async () => {
    const fetchImpl = makeFetchOk({ campaign_id: 'cmp' });
    await lookupCampaignId('with space', 'tok&hax=1', fetchImpl);
    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain('with%20space');
    expect(url).toContain('tok%26hax%3D1');
  });
});

// ---------------------------------------------------------------------------
// runSeed — integration of fetch + SQL
// ---------------------------------------------------------------------------

describe('runSeed', () => {
  it('inserts both EN and ES rows, calling Meta Graph for each', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const adSetId = url.split('/v22.0/')[1]?.split('?')[0];
      const map: Record<string, string> = { as_en: 'cmp_main', as_es: 'cmp_main' };
      return {
        ok: true,
        status: 200,
        json: async () => ({ campaign_id: map[adSetId ?? ''] }),
        text: async () => '',
      };
    }) as unknown as FetchLike;

    const { sql, calls } = makeSql({});

    const result = await runSeed({
      sql,
      fetchImpl,
      env: {
        META_ACCESS_TOKEN: 'tok',
        META_AD_ACCOUNT_ID: 'act_1',
        META_LAUNCH_ADSET_ID_EN: 'as_en',
        META_LAUNCH_ADSET_ID_ES: 'as_es',
      },
      logger: silentLogger,
    });

    expect(result.inserted).toBe(2);
    expect(result.alreadyPresent).toBe(0);
    expect(result.failures).toEqual([]);

    const fetchMock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const inserts = calls.filter((c) => c.text.trim().startsWith('INSERT'));
    expect(inserts).toHaveLength(2);
    const insertedAdSets = inserts.map((c) => c.params?.[0]).sort();
    expect(insertedAdSets).toEqual(['as_en', 'as_es']);

    const enInsert = inserts.find((c) => c.params?.[0] === 'as_en');
    expect(enInsert?.params).toEqual(['as_en', 'cmp_main', 'en']);
    const esInsert = inserts.find((c) => c.params?.[0] === 'as_es');
    expect(esInsert?.params).toEqual(['as_es', 'cmp_main', 'es']);
  });

  it('reports rows that already existed as alreadyPresent (ON CONFLICT path)', async () => {
    const fetchImpl = makeFetchOk({ campaign_id: 'cmp' });
    const { sql } = makeSql({ presentBefore: { as_en: 1 } });

    const result = await runSeed({
      sql,
      fetchImpl,
      env: {
        META_ACCESS_TOKEN: 'tok',
        META_AD_ACCOUNT_ID: 'act_1',
        META_LAUNCH_ADSET_ID_EN: 'as_en',
        META_LAUNCH_ADSET_ID_ES: 'as_es',
      },
      logger: silentLogger,
    });

    expect(result.alreadyPresent).toBe(1);
    expect(result.inserted).toBe(1);
  });

  it('no-ops cleanly when both ad set env vars are empty', async () => {
    const fetchImpl = vi.fn() as unknown as FetchLike;
    const { sql, calls } = makeSql({});

    const result = await runSeed({
      sql,
      fetchImpl,
      env: {
        META_ACCESS_TOKEN: 'tok',
        META_AD_ACCOUNT_ID: 'act_1',
        META_LAUNCH_ADSET_ID_EN: '',
        META_LAUNCH_ADSET_ID_ES: undefined,
      },
      logger: silentLogger,
    });

    expect(result).toEqual({ inserted: 0, alreadyPresent: 0, failures: [] });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('throws when META_ACCESS_TOKEN is missing but ad set IDs are set', async () => {
    const fetchImpl = vi.fn() as unknown as FetchLike;
    const { sql } = makeSql({});

    await expect(
      runSeed({
        sql,
        fetchImpl,
        env: {
          META_ACCESS_TOKEN: undefined,
          META_AD_ACCOUNT_ID: 'act_1',
          META_LAUNCH_ADSET_ID_EN: 'as_en',
        },
        logger: silentLogger,
      }),
    ).rejects.toThrow(/META_ACCESS_TOKEN/);
  });

  it('isolates per-ad-set failures: bad campaign lookup does not abort the other locale', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const adSetId = url.split('/v22.0/')[1]?.split('?')[0];
      if (adSetId === 'as_en') {
        return {
          ok: false,
          status: 500,
          json: async () => ({}),
          text: async () => 'meta exploded',
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ campaign_id: 'cmp_es' }),
        text: async () => '',
      };
    }) as unknown as FetchLike;

    const { sql, calls } = makeSql({});

    const result = await runSeed({
      sql,
      fetchImpl,
      env: {
        META_ACCESS_TOKEN: 'tok',
        META_AD_ACCOUNT_ID: 'act_1',
        META_LAUNCH_ADSET_ID_EN: 'as_en',
        META_LAUNCH_ADSET_ID_ES: 'as_es',
      },
      logger: silentLogger,
    });

    expect(result.inserted).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ adSetId: 'as_en', locale: 'en' });
    expect(result.failures[0].error).toMatch(/500/);

    const inserts = calls.filter((c) => c.text.trim().startsWith('INSERT'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params?.[0]).toBe('as_es');
  });
});
