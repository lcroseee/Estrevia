import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SYNASTRY_FAQ_KEYS } from '../synastryFaq';
import { faqSchema } from '@/shared/seo';

type FaqBlock = Record<string, string>;
const loadSynastry = (locale: 'en' | 'es'): FaqBlock =>
  JSON.parse(readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf-8')).synastry;

const PLACEHOLDERS = ['__PENDING_COPY__', 'TODO', 'TBD', 'Lorem', 'XXX'];

describe('SYNASTRY_FAQ_KEYS', () => {
  it('leads with the "what is synastry" pair (targets pos-10.5 query)', () => {
    expect(SYNASTRY_FAQ_KEYS[0]).toEqual({ qKey: 'whatIsQ', aKey: 'whatIsA' });
    expect(SYNASTRY_FAQ_KEYS).toHaveLength(6);
  });

  it('every key resolves in both locales (en/es parity)', () => {
    for (const locale of ['en', 'es'] as const) {
      const syn = loadSynastry(locale);
      for (const { qKey, aKey } of SYNASTRY_FAQ_KEYS) {
        expect(typeof syn[qKey], `${locale}.synastry.${qKey}`).toBe('string');
        expect(typeof syn[aKey], `${locale}.synastry.${aKey}`).toBe('string');
      }
    }
  });

  it('FAQPage JSON-LD leads with the "what is synastry" question (both locales)', () => {
    const en = loadSynastry('en');
    const es = loadSynastry('es');
    const build = (syn: FaqBlock) =>
      faqSchema(SYNASTRY_FAQ_KEYS.map(({ qKey, aKey }) => ({ question: syn[qKey], answer: syn[aKey] }))) as unknown as {
        mainEntity: Array<{ '@type': string; name: string; acceptedAnswer: { text: string } }>;
      };
    const enSchema = build(en);
    expect(enSchema.mainEntity).toHaveLength(6);
    expect(enSchema.mainEntity[0].name).toBe('What is synastry?');
    expect(build(es).mainEntity[0].name).toBe('¿Qué es la sinastría?');
  });

  it('no FAQ answer is a placeholder or a stub (both locales)', () => {
    for (const locale of ['en', 'es'] as const) {
      const syn = loadSynastry(locale);
      for (const { aKey } of SYNASTRY_FAQ_KEYS) {
        const answer = syn[aKey];
        expect(answer.length, `${locale}.synastry.${aKey} too short`).toBeGreaterThan(40);
        for (const marker of PLACEHOLDERS) {
          expect(answer.includes(marker), `${locale}.synastry.${aKey} contains ${marker}`).toBe(false);
        }
      }
    }
  });
});
