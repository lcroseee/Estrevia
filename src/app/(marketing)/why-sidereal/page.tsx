import type { Metadata } from 'next';
import Link from 'next/link';
import {
  createMetadata,
  JsonLdScript,
  faqSchema,
  breadcrumbSchema,
  organizationSchema,
} from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = createMetadata({
  title: 'Why Sidereal Astrology Differs from Tropical',
  description:
    'Sidereal astrology tracks real constellations using the Lahiri ayanamsa. Most sun signs shift one sign earlier vs tropical. Calculate your true chart.',
  path: '/why-sidereal',
  type: 'article',
  keywords: [
    'sidereal astrology',
    'sidereal vs tropical',
    'what is sidereal astrology',
    'lahiri ayanamsa',
    'precession of equinoxes',
    'sidereal zodiac',
    'tropical astrology difference',
  ],
});

// ---------------------------------------------------------------------------
// FAQ data (AEO — AI assistants extract these directly)
// ---------------------------------------------------------------------------

const FAQ_ITEMS = [
  {
    question: 'What is sidereal astrology?',
    answer:
      'Sidereal astrology is a zodiac system that measures planetary positions against the actual constellations in the sky. It uses the Lahiri ayanamsa — currently approximately 24°07′ — to correct for the precession of the equinoxes. Most sidereal practitioners align with Vedic (Jyotish) tradition. The result is that sidereal zodiac dates are roughly 24 days later than tropical dates.',
  },
  {
    question: 'What is the difference between sidereal and tropical astrology?',
    answer:
      'Tropical astrology fixes Aries at the spring equinox (around March 21), regardless of where the Aries constellation actually is. Sidereal astrology tracks the actual position of the Aries constellation. Due to the precession of the equinoxes — a 26,000-year wobble in Earth\'s axis — the two systems have drifted approximately 24 degrees apart. This means most people\'s sidereal sun sign is one sign earlier than their tropical sun sign.',
  },
  {
    question: 'What is the Lahiri ayanamsa?',
    answer:
      'The ayanamsa is the angular difference between the tropical and sidereal zodiacs at any given moment. The Lahiri ayanamsa — also called the Chitrapaksha ayanamsa — is the official standard of the Indian government and the most widely used in Vedic astrology. As of 2026, it is approximately 24°07′. Estrevia uses the Lahiri ayanamsa for all calculations via the Swiss Ephemeris library.',
  },
  {
    question: 'Will my zodiac sign change with sidereal astrology?',
    answer:
      'For most people, yes. If you were born in the first 24 days of your tropical zodiac sign, your sidereal sun sign is likely the previous sign. For example, an Aries born April 1 (tropical) is a sidereal Pisces. Someone born April 15 is a sidereal Aries. Calculate your chart to find your actual sidereal positions.',
  },
  {
    question: 'What is the precession of the equinoxes?',
    answer:
      'The precession of the equinoxes is a 25,772-year cycle caused by the gravitational pull of the Moon and Sun on Earth\'s equatorial bulge. It causes Earth\'s rotational axis to trace a slow circle in the sky — much like a spinning top slowly wobbling. The result is that the spring equinox point drifts westward through the zodiac constellations at approximately 50.3 arc-seconds per year, or about 1 degree every 72 years.',
  },
  {
    question: 'Is sidereal astrology more accurate than tropical?',
    answer:
      'Accuracy depends on what you are measuring. Sidereal astrology is astronomically accurate — it describes where planets actually are relative to the constellations. Tropical astrology is seasonally accurate — it connects zodiac positions to the solar year and seasons. Neither is objectively more "correct"; they measure different things. Many practitioners, particularly those trained in Vedic tradition, argue that sidereal placement is more personally accurate for individual natal charts.',
  },
  {
    question: 'Which planets does sidereal astrology apply to?',
    answer:
      'Sidereal astrology shifts the zodiac position of all celestial bodies: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, North Node (Rahu), and Chiron. The ayanamsa correction applies equally to all planets — each one\'s zodiac position shifts by approximately 24°07′ relative to its tropical position.',
  },
];

// ---------------------------------------------------------------------------
// Sidereal vs tropical date comparison table data
// ---------------------------------------------------------------------------

const SIGN_DATE_COMPARISON = [
  { sign: 'Aries',       sidereal: 'Apr 14 – May 14',   tropical: 'Mar 21 – Apr 19' },
  { sign: 'Taurus',      sidereal: 'May 15 – Jun 14',   tropical: 'Apr 20 – May 20' },
  { sign: 'Gemini',      sidereal: 'Jun 15 – Jul 15',   tropical: 'May 21 – Jun 20' },
  { sign: 'Cancer',      sidereal: 'Jul 16 – Aug 15',   tropical: 'Jun 21 – Jul 22' },
  { sign: 'Leo',         sidereal: 'Aug 16 – Sep 15',   tropical: 'Jul 23 – Aug 22' },
  { sign: 'Virgo',       sidereal: 'Sep 16 – Oct 15',   tropical: 'Aug 23 – Sep 22' },
  { sign: 'Libra',       sidereal: 'Oct 16 – Nov 14',   tropical: 'Sep 23 – Oct 22' },
  { sign: 'Scorpio',     sidereal: 'Nov 15 – Dec 14',   tropical: 'Oct 23 – Nov 21' },
  { sign: 'Sagittarius', sidereal: 'Dec 15 – Jan 13',   tropical: 'Nov 22 – Dec 21' },
  { sign: 'Capricorn',   sidereal: 'Jan 14 – Feb 12',   tropical: 'Dec 22 – Jan 19' },
  { sign: 'Aquarius',    sidereal: 'Feb 13 – Mar 13',   tropical: 'Jan 20 – Feb 18' },
  { sign: 'Pisces',      sidereal: 'Mar 14 – Apr 13',   tropical: 'Feb 19 – Mar 20' },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function WhySiderealPage() {
  const pageUrl = `${SITE_URL}/why-sidereal`;
  const today = new Date().toISOString().split('T')[0];

  const faqLd = faqSchema(FAQ_ITEMS);

  const breadcrumbLd = breadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'Why Sidereal', url: pageUrl },
  ]);

  const orgLd = organizationSchema();

  return (
    <>
      <JsonLdScript schema={faqLd} />
      <JsonLdScript schema={breadcrumbLd} />
      <JsonLdScript schema={orgLd} />

      <div className="max-w-3xl mx-auto px-4 py-10 md:py-16">

        {/* ── Breadcrumb ─────────────────────────────────────────────── */}
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-white/40">
          <ol className="flex items-center gap-2">
            <li><Link href="/" className="hover:text-white/70 transition-colors">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-white/60" aria-current="page">Why Sidereal</li>
          </ol>
        </nav>

        {/* ── Hero / H1 ──────────────────────────────────────────────── */}
        <header className="mb-12">
          {/* Decorative eyebrow */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-6 text-[11px] tracking-[0.2em] uppercase"
            style={{ borderColor: 'rgba(255,215,0,0.2)', color: 'rgba(255,215,0,0.55)' }}
          >
            <span aria-hidden="true" style={{ fontFamily: 'serif' }}>★</span>
            Sidereal · Lahiri Ayanamsa · ~24°07′
          </div>

          <h1
            className="text-3xl md:text-5xl font-light leading-[1.1] mb-5"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
          >
            Why Sidereal Astrology<br className="hidden sm:block" /> Differs from Tropical
          </h1>

          {/* AEO: direct-answer first paragraph — this is the AI extraction target */}
          <p className="text-lg text-white/72 leading-relaxed" style={{ fontFamily: 'var(--font-geist-sans)' }}>
            Sidereal astrology measures zodiac positions against the actual constellations in
            the sky, correcting for the precession of the equinoxes using the Lahiri ayanamsa
            (currently ~24°07′). Tropical astrology — used by most Western horoscopes — anchors
            Aries to the spring equinox, which has drifted ~24 degrees from the Aries constellation
            over 2,000 years. The practical result: most people&apos;s sidereal sun sign is one sign
            earlier than their tropical sign, and all planetary positions shift by roughly 24 days.
          </p>
        </header>

        {/* ── Section 1: Precession ──────────────────────────────────── */}
        <section aria-labelledby="precession-heading" className="mb-12">
          <h2
            id="precession-heading"
            className="text-2xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            The Precession of the Equinoxes
          </h2>
          <div className="text-white/70 leading-relaxed space-y-4 font-[var(--font-geist-sans)]">
            <p>
              Earth&apos;s rotational axis is not fixed — it traces a slow circle in the sky over
              approximately 25,772 years, like a spinning top gradually wobbling. This motion,
              called the precession of the equinoxes, causes the spring equinox point to drift
              westward through the zodiac constellations at approximately 50.3 arc-seconds per
              year — about 1 degree every 72 years.
            </p>
            <p>
              When the Western zodiac was codified (approximately 2,000 years ago in ancient
              Greece), the spring equinox aligned closely with the Aries constellation. Tropical
              astrology froze that alignment: 0° Aries always equals the spring equinox.
              Sidereal astrology did not freeze it. It tracks where the Aries constellation
              actually is today — which is now approximately 24°07′ behind where it was when
              the tropical system was created.
            </p>
            <p>
              The International Astronomical Union (IAU) defines the constellation boundaries
              used as sidereal reference points. The Lahiri ayanamsa — adopted as the Indian
              national standard in 1955 — calculates this drift with precision, making it the
              most rigorously defined sidereal reference in use today.
            </p>
          </div>
        </section>

        {/* ── Section 2: How they differ ─────────────────────────────── */}
        <section aria-labelledby="how-differ-heading" className="mb-12">
          <h2
            id="how-differ-heading"
            className="text-2xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            How Sidereal and Tropical Differ in Practice
          </h2>

          {/* Comparison table — AEO: AI parses tables better than prose */}
          <div className="overflow-x-auto mb-6 rounded-xl border border-white/10">
            <table className="w-full text-sm" aria-label="Sidereal vs tropical astrology comparison">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    Aspect
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    Sidereal (Lahiri)
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    Tropical (Western)
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Reference point', 'Actual star constellations', 'Spring equinox (seasonal)'],
                  ['Ayanamsa correction', '~24°07′ (Lahiri, 2026)', '0° (not applied)'],
                  ['Aries start date', '~April 14', '~March 21'],
                  ['Traditional roots', 'Vedic / Jyotish astrology', 'Hellenistic / Western astrology'],
                  ['Astronomically aligned', 'Yes — matches sky positions', 'No — drifts from sky by ~24°'],
                  ['Sun sign shift', 'Typically 1 sign earlier vs tropical', 'Baseline'],
                  ['Calculation standard', 'Swiss Ephemeris + Lahiri ayanamsa', 'Swiss Ephemeris (no ayanamsa)'],
                ].map(([aspect, sidereal, tropicalVal], i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 text-white/50 font-medium">{aspect}</td>
                    <td className="px-4 py-3 text-white/85">{sidereal}</td>
                    <td className="px-4 py-3 text-white/60">{tropicalVal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-white/70 leading-relaxed space-y-4 font-[var(--font-geist-sans)]">
            <p>
              The practical consequence is that if your tropical horoscope says you are a
              Scorpio, your sidereal chart likely shows your Sun in Libra — or Scorpio if
              you were born in the second half of Scorpio&apos;s tropical window. Every planet
              in your chart shifts by approximately 24°07′, which for most people moves
              each planet into the previous zodiac sign.
            </p>
            <p>
              This is not a correction of an error in tropical astrology — it is a different
              measurement framework asking different questions. Tropical astrology models
              the relationship between humanity and the solar seasons; sidereal astrology
              models the relationship between humanity and the fixed star background.
              Both descriptions have interpretive validity; they simply describe different
              layers of the astronomical situation at birth.
            </p>
          </div>
        </section>

        {/* ── Section 3: Date comparison table ──────────────────────── */}
        <section aria-labelledby="dates-heading" className="mb-12">
          <h2
            id="dates-heading"
            className="text-2xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            Sidereal vs Tropical Dates for All 12 Signs
          </h2>
          <p className="text-white/60 text-sm mb-5">
            Approximate dates for 2026. Exact boundaries shift slightly each year due to the
            continuing precession of the equinoxes (~50.3″/year) and variations in planetary
            positions. Use the{' '}
            <Link href="/chart" className="text-amber-400 hover:text-amber-300 underline underline-offset-4">
              sidereal natal chart calculator
            </Link>{' '}
            for precise positions.
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table
              className="w-full text-sm"
              aria-label="Sidereal and tropical zodiac sign dates comparison 2026"
            >
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    Sign
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    Sidereal (Lahiri)
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-widest"
                  >
                    Tropical
                  </th>
                </tr>
              </thead>
              <tbody>
                {SIGN_DATE_COMPARISON.map(({ sign, sidereal, tropical }) => (
                  <tr key={sign} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/signs/${sign.toLowerCase()}`}
                        className="text-white/85 hover:text-white transition-colors font-medium"
                        aria-label={`Sidereal ${sign} overview`}
                      >
                        {sign}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-amber-300/90 font-[var(--font-geist-mono)] text-xs">
                      {sidereal}
                    </td>
                    <td className="px-4 py-3 text-white/50 font-[var(--font-geist-mono)] text-xs">
                      {tropical}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section 4: Lahiri ayanamsa ─────────────────────────────── */}
        <section aria-labelledby="lahiri-heading" className="mb-12">
          <h2
            id="lahiri-heading"
            className="text-2xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            The Lahiri Ayanamsa: Estrevia&apos;s Calculation Standard
          </h2>
          <div className="text-white/70 leading-relaxed space-y-4 font-[var(--font-geist-sans)]">
            <p>
              The ayanamsa (Sanskrit: <em>ayana</em> = movement, <em>amsha</em> = part) is the
              angular correction applied to convert a tropical position to a sidereal one. As of
              2026, the Lahiri ayanamsa is approximately 24°07′ — meaning every planet&apos;s
              sidereal longitude is 24°07′ less than its tropical longitude.
            </p>
            <p>
              Estrevia calculates all positions using the{' '}
              <a
                href="https://www.astro.com/swisseph/swephinfo_e.htm"
                rel="noopener"
                className="text-amber-400 hover:text-amber-300 underline underline-offset-4"
                target="_blank"
              >
                Swiss Ephemeris
              </a>{' '}
              (accuracy ±0.01°) with the Lahiri ayanamsa mode
              (SE_SIDM_LAHIRI = 1). The Swiss Ephemeris is the same calculation engine
              used by Astro.com and most professional astrology software, ensuring
              that Estrevia&apos;s results can be verified against any other serious sidereal tool.
            </p>
            <p>
              Multiple ayanamsa systems exist — Fagan-Bradley (popular in Western sidereal
              astrology), Krishnamurti (used in KP astrology), and others. They differ by
              fractions of a degree. Lahiri is the most widely used globally and the official
              standard of the Government of India. Estrevia uses Lahiri exclusively in MVP;
              Fagan-Bradley and Krishnamurti support are planned for Phase 2.
            </p>
          </div>
        </section>

        {/* ── Chart CTA ──────────────────────────────────────────────── */}
        <section
          aria-labelledby="calc-cta-heading"
          className="mb-12 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6"
        >
          <h2
            id="calc-cta-heading"
            className="text-xl font-light mb-3"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
          >
            Calculate your sidereal natal chart
          </h2>
          <p className="text-white/58 text-sm mb-5 leading-relaxed">
            Enter your birth date, time, and location. Estrevia calculates your Sun, Moon,
            Ascendant, and all 10 planetary positions using the Lahiri ayanamsa and Swiss
            Ephemeris (±0.01° accuracy).
          </p>
          <Link
            href="/chart"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
              color: '#0A0A0F',
              boxShadow: '0 4px 16px rgba(255,215,0,0.2)',
            }}
          >
            <span aria-hidden="true">☉</span>
            Open chart calculator
          </Link>
        </section>

        {/* ── FAQ Section (AEO) ──────────────────────────────────────── */}
        <section aria-labelledby="faq-heading" className="mb-12">
          <h2
            id="faq-heading"
            className="text-2xl font-light mb-6"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            Frequently Asked Questions
          </h2>
          <dl className="space-y-6">
            {FAQ_ITEMS.map((item) => (
              <div key={item.question} className="border-b border-white/8 pb-6 last:border-0">
                <dt className="text-white font-medium mb-2 font-[var(--font-geist-sans)]">
                  {item.question}
                </dt>
                <dd className="text-white/65 leading-relaxed text-sm font-[var(--font-geist-sans)]">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Internal links ─────────────────────────────────────────── */}
        <nav aria-label="Related pages" className="pt-8 border-t border-white/10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-5">
            Explore Sidereal Astrology
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm" role="list">
            {[
              { href: '/signs/aries',   label: 'Sidereal Aries — traits and planetary placements' },
              { href: '/signs/taurus',  label: 'Sidereal Taurus — traits and planetary placements' },
              { href: '/signs/scorpio', label: 'Sidereal Scorpio — traits and planetary placements' },
              { href: '/signs/pisces',  label: 'Sidereal Pisces — traits and planetary placements' },
              { href: '/chart',         label: 'Calculate your sidereal natal chart' },
              { href: '/moon',          label: 'Current moon phase in sidereal astrology' },
            ].map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/20 transition-all text-white/70 hover:text-white/90"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          {/* External authoritative links */}
          <div className="mt-6 text-sm text-white/40 space-y-2">
            <p className="text-xs uppercase tracking-widest text-white/25 mb-3">Sources</p>
            <a
              href="https://en.wikipedia.org/wiki/Astronomical_year_numbering#Precession"
              rel="noopener"
              target="_blank"
              className="block hover:text-white/60 transition-colors"
            >
              Precession of the equinoxes — Wikipedia
            </a>
            <a
              href="https://www.iau.org/public/themes/constellations/"
              rel="noopener"
              target="_blank"
              className="block hover:text-white/60 transition-colors"
            >
              IAU constellation boundaries — International Astronomical Union
            </a>
          </div>
        </nav>

      </div>
    </>
  );
}
