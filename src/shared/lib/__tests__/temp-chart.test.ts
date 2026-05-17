import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState: { rows: Array<{ id: string; chart_data: unknown }> } = { rows: [] };
let lastWhereChartId: string | null = null;

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async (_clause) => {
          const row = dbState.rows.find((r) => r.id === lastWhereChartId);
          return row ? [{ chartData: row.chart_data }] : [];
        }),
      })),
    })),
  }),
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: (col: unknown, val: string) => {
      lastWhereChartId = val;
      return { col, val };
    },
  };
});

beforeEach(() => {
  dbState.rows = [];
  lastWhereChartId = null;
});

describe('fetchTempChart', () => {
  it('returns null when chartId is null', async () => {
    const { fetchTempChart } = await import('../temp-chart');
    expect(await fetchTempChart(null)).toBeNull();
  });

  it('returns null when chart not found (cleaned up)', async () => {
    const { fetchTempChart } = await import('../temp-chart');
    expect(await fetchTempChart('does_not_exist')).toBeNull();
  });

  it('returns chart data when row exists', async () => {
    const fakeChart = { planets: [{ planet: 'Sun', sign: 'Aries', signDegree: 12.3 }], houses: null };
    dbState.rows.push({ id: 'chart_abc', chart_data: fakeChart });
    const { fetchTempChart } = await import('../temp-chart');
    const result = await fetchTempChart('chart_abc');
    expect(result).toEqual(fakeChart);
  });
});
