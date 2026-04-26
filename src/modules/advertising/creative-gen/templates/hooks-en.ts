import type { HookTemplate } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// English hook templates for Meta Ads
//
// All templates use third-person or impersonal framing per Meta Ads policy:
//   - No "you are not", "you're not" → no personal claims about the viewer
//   - No predictive or fortune-telling language ("you will", "your future")
//   - Scientific claims (precession, Swiss Ephemeris) cited appropriately
//
// 3 archetypes, 4-6 variations each → 18 templates total
// ---------------------------------------------------------------------------

export const hooksEn: HookTemplate[] = [
  // ---------------------------------------------------------------------------
  // ARCHETYPE: identity_reveal
  // Hook: the viewer's "true" sidereal sign differs from what most apps show.
  // Third-person / impersonal: frames it as a general discovery, not a claim
  // about the specific viewer's identity.
  // ---------------------------------------------------------------------------
  {
    id: 'en-identity-reveal-1',
    name: 'Identity Reveal — Tropical vs Sidereal',
    archetype: 'identity_reveal',
    copy_template:
      'Most apps show the tropical sign. The actual stars say something different.',
    visual_mood: 'shock-then-revelation, dark cosmic gradient with subtle star animation',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'no second-person personal claims',
      'no predictive language',
      'no fortune-telling framing',
      'Swiss Ephemeris accuracy claims must include inline citation',
    ],
  },
  {
    id: 'en-identity-reveal-2',
    name: 'Identity Reveal — The Gap',
    archetype: 'identity_reveal',
    copy_template:
      'Earth\'s axis has shifted ~24° since ancient astrology was codified. Most sun-sign apps never updated.',
    visual_mood: 'scientific revelation, animated star precession diagram fading into zodiac wheel',
    duration_sec: 20,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'en',
    policy_constraints: [
      'no personal claims about the viewer',
      'axial precession figure (~24°) is a verified astronomical fact — acceptable',
      'no fortune-telling framing',
    ],
  },
  {
    id: 'en-identity-reveal-3',
    name: 'Identity Reveal — Discover Your Sidereal Sign',
    archetype: 'identity_reveal',
    copy_template:
      'Sidereal astrology calculates positions from where the planets actually appear in the sky tonight.',
    visual_mood: 'night sky time-lapse with planetary overlays, clean and factual tone',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: [
      'factual astronomical claim — acceptable',
      'no personal predictions',
      'no fortune-telling',
    ],
  },
  {
    id: 'en-identity-reveal-4',
    name: 'Identity Reveal — Chart Comparison',
    archetype: 'identity_reveal',
    copy_template:
      'Compare the tropical chart with the sidereal chart — the difference is rarely just one sign.',
    visual_mood: 'split-screen: tropical chart left, sidereal right, positions shifting',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'no personal claims about the viewer',
      'comparative framing is factual and acceptable',
      'no fortune-telling language',
    ],
  },
  {
    id: 'en-identity-reveal-5',
    name: 'Identity Reveal — Precession Explained',
    archetype: 'identity_reveal',
    copy_template:
      'Astronomers call it precession of the equinoxes. It moves the zodiac ~1° every 72 years.',
    visual_mood: 'educational documentary, celestial sphere with slow rotation animation',
    duration_sec: 20,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'en',
    policy_constraints: [
      'factual scientific claim — cite IAU precession data if full accuracy required',
      'no personal identity claims',
      'no predictions',
    ],
  },
  {
    id: 'en-identity-reveal-6',
    name: 'Identity Reveal — Sign Shift Showcase',
    archetype: 'identity_reveal',
    copy_template:
      'About 80% of people have a different sun sign in sidereal astrology than they\'ve been told.',
    visual_mood: 'bold statistic reveal, dark background, animated percentage counter',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: [
      'percentage is an approximate empirical estimate — qualify with "approximately"',
      'no claims directed at the specific viewer',
      'no fortune-telling',
    ],
  },

  // ---------------------------------------------------------------------------
  // ARCHETYPE: authority
  // Hook: Estrevia is backed by real astronomy (Swiss Ephemeris, NASA data).
  // Builds trust through scientific credibility, not personal claims.
  // ---------------------------------------------------------------------------
  {
    id: 'en-authority-1',
    name: 'Authority — Swiss Ephemeris Accuracy',
    archetype: 'authority',
    copy_template:
      'Estrevia calculates planetary positions using Swiss Ephemeris — the same data set used by professional astronomers.',
    visual_mood: 'credibility-building, clean data visualization, observatory imagery',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'accuracy claims cite Swiss Ephemeris (Astrodienst, Zurich)',
      'no predictive language',
      'no fortune-telling framing',
    ],
  },
  {
    id: 'en-authority-2',
    name: 'Authority — Astronomical Fact',
    archetype: 'authority',
    copy_template:
      'The zodiac shifted ~24° due to Earth\'s axial precession. Most astrology apps still use the original positions from 2,000 years ago.',
    visual_mood: 'documentary, factual, satellite imagery + zodiac overlay',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: [
      'scientific framing — axial precession is documented astronomy',
      'cite Swiss Ephemeris when claiming computational accuracy',
      'no personal predictions',
    ],
  },
  {
    id: 'en-authority-3',
    name: 'Authority — Lahiri Ayanamsa Standard',
    archetype: 'authority',
    copy_template:
      'Estrevia uses the Lahiri ayanamsa — the official standard adopted by the Indian Government in 1957.',
    visual_mood: 'historical gravitas, document + star chart aesthetic, gold accents',
    duration_sec: 15,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'en',
    policy_constraints: [
      'Lahiri ayanamsa adoption by Indian government is historical fact — acceptable',
      'no personal predictions or claims about the viewer',
    ],
  },
  {
    id: 'en-authority-4',
    name: 'Authority — ±0.01 Degree Precision',
    archetype: 'authority',
    copy_template:
      'Planetary positions calculated to ±0.01° accuracy. The difference between a sign boundary matters.',
    visual_mood: 'precision engineering aesthetic, degrees and arc-minutes displayed prominently',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: [
      '±0.01° accuracy is a Swiss Ephemeris / Moshier analytical specification — cite in small print',
      'no personal claims about the viewer',
      'no fortune-telling language',
    ],
  },
  {
    id: 'en-authority-5',
    name: 'Authority — Real NASA Solar Data',
    archetype: 'authority',
    copy_template:
      'Solar and cosmic event data sourced from NASA DONKI — the same feed space agencies use.',
    visual_mood: 'NASA-style dark UI, solar flare imagery (NASA public domain), credibility tone',
    duration_sec: 15,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'en',
    policy_constraints: [
      'NASA data is public domain — acceptable to reference',
      'do not imply NASA endorses Estrevia',
      'no predictive language',
    ],
  },
  {
    id: 'en-authority-6',
    name: 'Authority — Professional-Grade Calculation',
    archetype: 'authority',
    copy_template:
      'The same ephemeris software used by researchers and traditional Jyotish practitioners. Now accessible on mobile.',
    visual_mood: 'craft + tradition aesthetic, antique star atlas overlaid with modern UI',
    duration_sec: 20,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'factual product description — acceptable',
      'no personal predictions',
      'no exclusive claims without substantiation',
    ],
  },

  // ---------------------------------------------------------------------------
  // ARCHETYPE: rarity
  // Hook: the combination of Sun/Moon/Rising is statistically unique.
  // Third-person: "see how rare your combination is" is a CTA, not a claim
  // about the viewer's actual rarity (computed live from data).
  // ---------------------------------------------------------------------------
  {
    id: 'en-rarity-1',
    name: 'Rarity — Sun-Moon-Rising Combo',
    archetype: 'rarity',
    copy_template:
      'See how rare the Sun-Moon-Rising combination is — calculated from real planetary positions.',
    visual_mood: 'premium, badge-of-honor, Cosmic Passport card prominent',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'rarity claims backed by actual statistical calculation on platform',
      'no exclusionary language',
      'no personal predictions',
    ],
  },
  {
    id: 'en-rarity-2',
    name: 'Rarity — 1 in 1728 Combinations',
    archetype: 'rarity',
    copy_template:
      'There are 1,728 possible Sun-Moon-Rising combinations in sidereal astrology. Most are held by fewer than 1% of people.',
    visual_mood: 'mathematical precision, star grid with highlighted cells, dark luxury aesthetic',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: [
      '12×12×12 = 1,728 is a mathematical fact — acceptable',
      'distribution claim ("fewer than 1%") is approximate — qualify appropriately',
      'no personal claims directed at the viewer',
    ],
  },
  {
    id: 'en-rarity-3',
    name: 'Rarity — Cosmic Passport Showcase',
    archetype: 'rarity',
    copy_template:
      'The Cosmic Passport shows the exact sidereal combination — and how common it is across all charts calculated.',
    visual_mood: 'social proof, animated passport card fill, share button visible',
    duration_sec: 15,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'en',
    policy_constraints: [
      'product description — acceptable',
      'rarity percentage sourced from live platform data — note this in disclosures',
      'no fortune-telling',
    ],
  },
  {
    id: 'en-rarity-4',
    name: 'Rarity — Sidereal Rarity vs Tropical',
    archetype: 'rarity',
    copy_template:
      'Tropical astrology uses the same 12 signs evenly. Sidereal positions cluster differently — some combinations appear far less often.',
    visual_mood: 'distribution chart animation, uneven frequency bars, scientific tone',
    duration_sec: 20,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: [
      'statistical framing — acceptable when based on platform data',
      'no personal claims about the viewer',
      'no predictions',
    ],
  },
  {
    id: 'en-rarity-5',
    name: 'Rarity — Share Your Passport',
    archetype: 'rarity',
    copy_template:
      'The Cosmic Passport is shareable. Calculate, get the rarity score, post it.',
    visual_mood: 'social-first, share sheet animation, friends-comparing energy',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: [
      'product CTA — acceptable',
      'no personal identity claims',
      'no fortune-telling language',
    ],
  },
  {
    id: 'en-rarity-6',
    name: 'Rarity — Ephemeris Rarity Calculation',
    archetype: 'rarity',
    copy_template:
      'Rarity percentages are calculated from actual Swiss Ephemeris data — not made up. The math is open source.',
    visual_mood: 'transparency and trust, code snippet briefly visible, AGPL badge',
    duration_sec: 18,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'en',
    policy_constraints: [
      'AGPL open-source claim is accurate — code is AGPL-3.0',
      'no personal predictions',
      'cite Swiss Ephemeris source',
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------

export function getHookTemplate(id: string): HookTemplate | undefined {
  return hooksEn.find(h => h.id === id);
}
