import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * SP-F D6: /privacy must not contradict the consent-gated Meta Pixel.
 * Message-level assertions (the page renders privacyPage.* keys verbatim).
 */

const en = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'messages/en.json'), 'utf8'),
) as { privacyPage: Record<string, string> };
const es = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'messages/es.json'), 'utf8'),
) as { privacyPage: Record<string, string> };

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
