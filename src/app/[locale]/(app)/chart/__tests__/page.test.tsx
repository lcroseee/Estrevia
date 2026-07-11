// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const fetchTempChartMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/temp-chart', () => ({ fetchTempChart: fetchTempChartMock }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  getLocale: async () => 'en',
}));
// Stub ChartDisplay so we can find it in the returned element tree by identity
// and read the props the page passed to it. (Awaiting the async page returns an
// element tree WITHOUT invoking child components, so we inspect the tree rather
// than rely on a render-time capture.)
vi.mock('@/modules/astro-engine/components/ChartDisplay', () => ({
  ChartDisplay: () => React.createElement('div', { 'data-testid': 'chart-display-stub' }),
}));

import ChartPage from '../page';
import { ChartDisplay } from '@/modules/astro-engine/components/ChartDisplay';

// Recursively locate the props the page handed to <ChartDisplay/>.
function findChartDisplayProps(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findChartDisplayProps(child);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === ChartDisplay) return (el.props ?? {}) as Record<string, unknown>;
  return el.props ? findChartDisplayProps(el.props.children) : null;
}

async function renderPageProps(searchParams: Record<string, string>) {
  const tree = await ChartPage({ searchParams: Promise.resolve(searchParams) });
  return findChartDisplayProps(tree);
}

beforeEach(() => {
  fetchTempChartMock.mockReset();
});

describe('/chart?chartId= server handoff (P0-3)', () => {
  it('fetches by chartId and passes initialChart + initialChartId', async () => {
    const fake = { planets: [], calculatedAt: 'x' };
    fetchTempChartMock.mockResolvedValue(fake);
    const props = await renderPageProps({ chartId: 'abc123' });
    expect(fetchTempChartMock).toHaveBeenCalledWith('abc123');
    expect(props).toMatchObject({ initialChart: fake, initialChartId: 'abc123' });
  });

  it('expired/unknown chartId degrades to no props (empty form)', async () => {
    fetchTempChartMock.mockResolvedValue(null);
    const props = await renderPageProps({ chartId: 'gone' });
    expect(fetchTempChartMock).toHaveBeenCalledWith('gone');
    expect(props).toMatchObject({ initialChart: undefined, initialChartId: undefined });
  });

  it('no chartId → no fetch', async () => {
    const props = await renderPageProps({});
    expect(fetchTempChartMock).not.toHaveBeenCalled();
    expect(props).toMatchObject({ initialChart: undefined, initialChartId: undefined });
  });
});
