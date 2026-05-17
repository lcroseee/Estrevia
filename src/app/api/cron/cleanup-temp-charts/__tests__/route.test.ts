import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { PgDialect } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any vi.mock factory references them.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  // Captures every WHERE argument the route passes into db.delete().where().
  // Order matters: tempCharts delete is index 0, waitlistEntries is index 1.
  capturedWhereConditions: [] as unknown[],
  // Per-call values returned by .returning() — pushed in delete-call order.
  returningResolveValues: [] as Array<Array<{ id: string }>>,
  deleteCallCount: 0,
}));

// db.delete(table) → { where(cond) → { returning() → Promise<rows> } }
vi.mock('@/shared/lib/db', () => {
  const where = vi.fn((cond: unknown) => {
    mocks.capturedWhereConditions.push(cond);
    const callIdx = mocks.deleteCallCount - 1;
    const rows = mocks.returningResolveValues[callIdx] ?? [];
    return { returning: vi.fn().mockResolvedValue(rows) };
  });
  const del = vi.fn(() => {
    mocks.deleteCallCount += 1;
    return { where };
  });
  return { getDb: () => ({ delete: del }) };
});

vi.mock('@/shared/lib/cron-auth', () => ({
  assertCronAuth: vi.fn(() => null),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered.
// ---------------------------------------------------------------------------
import { GET } from '../route';
import { assertCronAuth } from '@/shared/lib/cron-auth';

function makeCronRequest(): Request {
  return new Request('http://localhost/api/cron/cleanup-temp-charts', {
    method: 'GET',
    headers: { authorization: 'Bearer secret' },
  });
}

function renderSql(condition: unknown): string {
  const dialect = new PgDialect();
  const wrapper = condition as { getSQL: () => Parameters<typeof dialect.sqlToQuery>[0] };
  return dialect.sqlToQuery(wrapper.getSQL()).sql.toLowerCase();
}

beforeEach(() => {
  mocks.capturedWhereConditions.length = 0;
  mocks.returningResolveValues.length = 0;
  mocks.deleteCallCount = 0;
  vi.mocked(assertCronAuth).mockReturnValue(null);
});

describe('GET /api/cron/cleanup-temp-charts', () => {
  // -------------------------------------------------------------------------
  // Baseline: auth + happy-path response shape
  // -------------------------------------------------------------------------
  it('returns 200 with per-target deletion counts', async () => {
    mocks.returningResolveValues.push([{ id: 'chart_a' }, { id: 'chart_b' }]);
    mocks.returningResolveValues.push([{ id: 'wl_1' }]);

    const res = await GET(makeCronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deleted.tempCharts).toBe(2);
    expect(body.deleted.waitlistEntries).toBe(1);
  });

  it('returns 401 when cron auth fails (no DB writes)', async () => {
    vi.mocked(assertCronAuth).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );

    const res = await GET(makeCronRequest());

    expect(res.status).toBe(401);
    expect(mocks.deleteCallCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // T13: active-nurture chart references must be preserved.
  //
  // Temp natal_charts rows past TTL that are still referenced by an
  // email_leads row mid-nurture (step<3, not converted, not unsubscribed,
  // captured within the last 7 days) MUST survive cleanup so the T+24h /
  // T+72h drip emails can personalize from the chart. After 7 days the
  // drip is complete and cleanup proceeds normally.
  // -------------------------------------------------------------------------
  describe('active-nurture exclusion (T13)', () => {
    it('adds NOT EXISTS subquery against email_leads to the natal_charts delete', async () => {
      mocks.returningResolveValues.push([]);
      mocks.returningResolveValues.push([]);

      await GET(makeCronRequest());

      expect(mocks.capturedWhereConditions.length).toBeGreaterThanOrEqual(1);
      const tempChartsSql = renderSql(mocks.capturedWhereConditions[0]);

      // Existing filters still in place (status check, user_id IS NULL, TTL).
      // Drizzle parameterizes the 'temp' literal as $N — assert via the
      // surrounding column reference rather than the bound value.
      expect(tempChartsSql).toContain('status');
      expect(tempChartsSql).toContain('user_id');
      expect(tempChartsSql).toContain('interval');

      // Exclusion subquery is wired in
      expect(tempChartsSql).toContain('not exists');
      expect(tempChartsSql).toContain('email_leads');
      expect(tempChartsSql).toContain('nurture_step');
      expect(tempChartsSql).toContain('converted_to_user_id');
      expect(tempChartsSql).toContain('unsubscribed_at');
      // The 7-day window covers the full T+72h drip cycle plus slack
      expect(tempChartsSql).toMatch(/7 days/);
    });

    it('does not add the email_leads exclusion to the waitlist delete', async () => {
      mocks.returningResolveValues.push([]);
      mocks.returningResolveValues.push([]);

      await GET(makeCronRequest());

      expect(mocks.capturedWhereConditions.length).toBeGreaterThanOrEqual(2);
      const waitlistSql = renderSql(mocks.capturedWhereConditions[1]);

      expect(waitlistSql).not.toContain('not exists');
      expect(waitlistSql).not.toContain('email_leads');
    });
  });
});
