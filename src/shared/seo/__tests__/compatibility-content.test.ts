import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sitemap from '@/app/sitemap';
import {
  ENRICHED_PAIRS,
  isEnrichedLocaleValid,
  isPurePlaceholderStub,
  type EnrichedPairContent,
} from '../compatibility-pairs';
import {
  getEnrichedPairContent,
  isPairReady,
  readyEnrichedPairs,
} from '../compatibility-content';
import { generateMetadata as compatPairMetadata } from '../../../app/[locale]/(marketing)/compatibility/[pair]/page';

const ENRICHED_DIR = path.join(process.cwd(), 'content', 'compatibility', 'enriched');

describe('enriched compatibility content (T7)', () => {
  it('every ENRICHED_PAIRS slug has a scaffolded file with both locales', () => {
    for (const pair of ENRICHED_PAIRS) {
      const file = path.join(ENRICHED_DIR, `${pair}.json`);
      expect(fs.existsSync(file), `missing ${pair}.json`).toBe(true);
      const c = getEnrichedPairContent(pair) as EnrichedPairContent | null;
      expect(c, `unparseable ${pair}.json`).not.toBeNull();
      for (const loc of ['en', 'es'] as const) {
        expect(Array.isArray(c![loc].sections)).toBe(true);
        expect(Array.isArray(c![loc].faq)).toBe(true);
      }
    }
  });

  // The placeholder-detecting guard: forbids the dangerous middle state.
  it('no half-authored files: each locale is a pure placeholder stub OR fully valid (>=300 words)', () => {
    for (const pair of ENRICHED_PAIRS) {
      const c = getEnrichedPairContent(pair);
      if (!c) continue;
      for (const loc of ['en', 'es'] as const) {
        const lc = c[loc];
        expect(
          isPurePlaceholderStub(lc) || isEnrichedLocaleValid(lc),
          `${pair}.${loc} is partially authored (<300 words or leftover placeholder)`,
        ).toBe(true);
      }
    }
  });

  it('a pair is ready ONLY when both locales are fully authored', () => {
    for (const pair of ENRICHED_PAIRS) {
      const c = getEnrichedPairContent(pair);
      const bothValid = !!c && isEnrichedLocaleValid(c.en) && isEnrichedLocaleValid(c.es);
      expect(isPairReady(pair)).toBe(bothValid);
    }
  });

  it('page renders index:true for ready pairs, noindex for the rest', async () => {
    for (const pair of ENRICHED_PAIRS) {
      const md = await compatPairMetadata({ params: Promise.resolve({ locale: 'en' as const, pair }) });
      expect(md.robots).toEqual(
        isPairReady(pair) ? { index: true, follow: true } : { index: false, follow: true },
      );
    }
  });

  it('sitemap re-adds exactly 2 URLs per ready pair (0 while all stubs)', () => {
    const urls = sitemap().map((e) => e.url);
    const ready = readyEnrichedPairs();
    for (const pair of ready) {
      expect(urls.filter((u) => new RegExp(`/compatibility/${pair}$`).test(u))).toHaveLength(2);
    }
    const pairUrls = urls.filter((u) => /\/compatibility\/[a-z]+-[a-z]+$/.test(u));
    expect(pairUrls).toHaveLength(ready.length * 2);
  });

  // Living checklist — becomes a hard assertion as the founder authors prose (T7e).
  it.todo('all 12 ENRICHED_PAIRS fully authored (0/12 at plan time) — replace with expect(readyEnrichedPairs()).toHaveLength(12)');
});
