import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * SP-F D6: /privacy must not contradict the consent-gated Meta Pixel.
 * Message-level assertions (the page renders privacyPage.* keys verbatim).
 */

const en = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'messages/en.json'), 'utf8'),
) as { privacyPage: Record<string, string>; termsPage: Record<string, string> };
const es = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'messages/es.json'), 'utf8'),
) as { privacyPage: Record<string, string>; termsPage: Record<string, string> };

describe('privacy page copy vs consent-gated pixel (D6)', () => {
  it('EN s7Footer no longer denies advertising cookies and names Meta Pixel', () => {
    expect(en.privacyPage.s7Footer).not.toContain('We do not use advertising cookies');
    expect(en.privacyPage.s7Footer).toContain('Meta Pixel');
  });

  it('ES s7Footer no longer denies advertising cookies and names Meta Pixel', () => {
    expect(es.privacyPage.s7Footer).not.toContain('No usamos cookies de publicidad');
    expect(es.privacyPage.s7Footer).toContain('Meta Pixel');
  });

  it('Meta appears in the third-party services strings, both locales', () => {
    for (const messages of [en, es]) {
      expect(messages.privacyPage.tpMetaPurpose).toBeTruthy();
      expect(messages.privacyPage.tpMetaData).toBeTruthy();
    }
  });

  it('the privacy page renders the Meta third-party entry', () => {
    const pageSource = readFileSync(
      path.resolve(process.cwd(), 'src/app/[locale]/(marketing)/privacy/page.tsx'),
      'utf8',
    );
    expect(pageSource).toContain("t('tpMetaPurpose')");
    expect(pageSource).toContain("t('tpMetaData')");
  });
});

/**
 * Task 15: Cosmic Portrait ships an uploaded selfie to Google (Gemini) for
 * processing. Google was previously absent from the processor list — this
 * closes a pre-existing gap the feature makes untenable.
 *
 * NOTE (T15, accessor fix vs the brief's verbatim test): the brief's snippet
 * reads `en.privacy` / `en.terms`, but the real namespaces in messages/*.json
 * are `privacyPage` / `termsPage` (confirmed by grep and by the D6 test above,
 * which already reads `en.privacyPage`). Only the property accessors were
 * corrected below — every assertion (regex, matcher) is verbatim from the
 * brief.
 */
describe('privacy — image processing disclosure', () => {
  it('names Google as a processor', () => {
    expect(JSON.stringify(en.privacyPage)).toMatch(/Google/);
    expect(JSON.stringify(es.privacyPage)).toMatch(/Google/);
  });

  it('declares a photo/image data category', () => {
    expect(JSON.stringify(en.privacyPage)).toMatch(/photo|image/i);
    expect(JSON.stringify(es.privacyPage)).toMatch(/foto|imagen/i);
  });

  it('states that uploaded photos are not retained', () => {
    expect(JSON.stringify(en.privacyPage)).toMatch(/not (retained|stored)|never stored/i);
    expect(JSON.stringify(es.privacyPage)).toMatch(/no (se )?(guarda|almacena)/i);
  });
});

describe('terms — user-generated content', () => {
  it('requires the uploader to hold rights to the likeness', () => {
    expect(JSON.stringify(en.termsPage)).toMatch(/right to (use|upload)|own the/i);
  });

  it('prohibits photos of minors and of other people', () => {
    expect(JSON.stringify(en.termsPage)).toMatch(/minor|under 18/i);
    expect(JSON.stringify(es.termsPage)).toMatch(/menor|18 años/i);
  });

  it('describes a takedown route', () => {
    expect(JSON.stringify(en.termsPage)).toMatch(/takedown|report|remove/i);
  });
});
