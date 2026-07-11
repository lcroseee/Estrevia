import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function load(locale: 'en' | 'es'): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf-8'));
}

const REQUIRED_ABOUT_KEYS = [
  'breadcrumbAria', 'breadcrumbHome', 'breadcrumbCurrent',
  'eyebrow', 'h1', 'lead',
  'founderHeading', 'founderBio',
  'methodologyHeading', 'methodologyP1', 'methodologyP2',
  'accuracyLabel', 'accuracyValue',
  'contactHeading', 'contactBody', 'contactEmailLabel',
  'ctaHeading', 'ctaBody', 'ctaButton',
  'roleTitle', 'bioSchema',
] as const;

const PLACEHOLDER = /\b(TODO|TBD|XXX|FIXME|PLACEHOLDER|Lorem ipsum)\b/i;

describe('about i18n scaffold (T13)', () => {
  for (const locale of ['en', 'es'] as const) {
    const msgs = load(locale);
    const about = (msgs.about ?? {}) as Record<string, string>;
    const meta = ((msgs.pageMeta as Record<string, unknown>)?.about ?? {}) as Record<string, string>;

    it(`[${locale}] has every required about.* key, non-empty`, () => {
      for (const k of REQUIRED_ABOUT_KEYS) {
        expect(typeof about[k], `about.${k}`).toBe('string');
        expect(about[k].trim().length, `about.${k}`).toBeGreaterThan(0);
      }
    });

    it(`[${locale}] has pageMeta.about title + description`, () => {
      expect(typeof meta.title).toBe('string');
      expect(typeof meta.description).toBe('string');
      expect(meta.title.length).toBeLessThanOrEqual(60);
      expect(meta.description.length).toBeLessThanOrEqual(155);
    });

    it(`[${locale}] has marketing.footerAbout`, () => {
      const marketing = msgs.marketing as Record<string, string>;
      expect(typeof marketing.footerAbout).toBe('string');
      expect(marketing.footerAbout.trim().length).toBeGreaterThan(0);
    });

    it(`[${locale}] contains no placeholder sentinels in about.*`, () => {
      for (const k of REQUIRED_ABOUT_KEYS) {
        expect(PLACEHOLDER.test(about[k]), `about.${k} = "${about[k]}"`).toBe(false);
      }
    });
  }

  it('EN and ES about namespaces have identical key sets', () => {
    const en = Object.keys((load('en').about ?? {}) as object).sort();
    const es = Object.keys((load('es').about ?? {}) as object).sort();
    expect(es).toEqual(en);
  });
});
