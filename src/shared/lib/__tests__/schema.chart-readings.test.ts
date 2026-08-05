// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { chartReadings } from '@/shared/lib/schema';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

describe('chartReadings schema', () => {
  it('exports a Drizzle table named chart_readings', () => {
    expect(getTableName(chartReadings)).toBe('chart_readings');
  });

  it('has the expected columns', () => {
    const cols = getTableColumns(chartReadings);
    const names = Object.keys(cols).sort();
    expect(names).toEqual(
      ['body', 'chartId', 'generatedAt', 'id', 'locale', 'model', 'variant'].sort(),
    );
  });

  it('keys the cache by variant as well as chart and locale', () => {
    // Without the variant in the unique index, SP-C's comparative section
    // would collide with the natal reading for the same chart and locale.
    const { indexes } = getTableConfig(chartReadings);
    const unique = indexes.find((i) => i.config.unique);
    expect(unique).toBeDefined();
    expect(unique!.config.columns.map((c) => (c as { name: string }).name).sort()).toEqual(
      ['chart_id', 'locale', 'variant'],
    );
  });

  it('defaults variant to natal so pre-SP-C rows keep their meaning', () => {
    const cols = getTableColumns(chartReadings);
    expect(cols.variant.default).toBe('natal');
    expect(cols.variant.notNull).toBe(true);
  });

  it('chartId references natal_charts.id', () => {
    // Drizzle exposes FKs on the table config, not the column. Walk every FK on
    // chart_readings and check that at least one points at natal_charts via
    // the chart_id column.
    const { foreignKeys } = getTableConfig(chartReadings);
    const hasNatalChartsFk = foreignKeys.some((fk) => {
      const ref = fk.reference();
      const foreignTableName = getTableName(ref.foreignTable);
      const localColumnNames = ref.columns.map((c) => c.name);
      return foreignTableName === 'natal_charts' && localColumnNames.includes('chart_id');
    });
    expect(hasNatalChartsFk).toBe(true);
  });
});
