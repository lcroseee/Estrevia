import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import LeadPaywallTeaserEmail from '../LeadPaywallTeaserEmail';
import LeadPaywallTeaserBEmail from '../LeadPaywallTeaserBEmail';
import LeadPaywallTeaserCEmail from '../LeadPaywallTeaserCEmail';

const base = {
  sunSign: 'Aries',
  moonSign: 'Taurus',
  ascSign: null,
  trialUrl: 'https://estrevia.app/pricing?utm_source=email',
};
const personalized = {
  ...base,
  dominantPlanet: 'Saturn',
  dominantSign: 'Capricorn',
  dominantHouse: 10,
  dominantPlanetEs: 'Saturno',
};

const CASES = [
  ['en', 'Included in Pro'],
  ['es', 'Incluido en Pro'],
] as const;

describe('paywall teaser emails — phantom "Star" tier removed (SP-E D4)', () => {
  it.each(CASES)('variant A (%s) eyebrow says "%s", never Star', async (locale, eyebrow) => {
    const html = await render(LeadPaywallTeaserEmail({ locale, ...base }));
    expect(html).toContain(eyebrow);
    // \bStar\b: "Start …" must not trip this, the tier name must.
    expect(html).not.toMatch(/\bStar\b/);
  });

  it.each(CASES)('variant B (%s) eyebrow says "%s", never Star', async (locale, eyebrow) => {
    const html = await render(LeadPaywallTeaserBEmail({ locale, ...personalized }));
    expect(html).toContain(eyebrow);
    expect(html).not.toMatch(/\bStar\b/);
  });

  it.each(CASES)('variant C (%s) eyebrow says "%s", never Star', async (locale, eyebrow) => {
    const html = await render(LeadPaywallTeaserCEmail({ locale, ...personalized }));
    expect(html).toContain(eyebrow);
    expect(html).not.toMatch(/\bStar\b/);
  });
});
