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
      "Earth's axial precession has shifted the celestial sphere ~24° since the tropical zodiac was codified ~2,000 years ago.",
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
    visual_mood:
      'Photorealistic deep night sky astronomical photograph. Three bright bluish-white stars aligned in a perfectly straight row near the center of the frame, evenly spaced, isolated as discrete points of light against empty dark sky — surrounded by negative space, with no other bright stars adjacent. Two visually distinct real planets in the upper third: Saturn with prominent pale-gold ring system tilted slightly to one side, and Neptune as a smaller deep ice-blue smooth sphere — both clearly different in color, size, and position, not overlapping. A subtle Milky Way band runs across the upper area. Dark navy-to-black gradient background with sparse scattered faint stars throughout. Cinematic depth, atmospheric clarity, observatory-grade resolution. Empty negative space at the bottom of the frame for text overlay. Vertical 9:16 composition. NO text, NO words, NO labels, NO names, NO captions, NO UI elements, NO planetarium interface, NO connecting lines, NO diagram lines, NO constellation outlines, NO asterism shapes, NO callout boxes, NO icons, NO arrows, NO grids.',
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
    visual_mood:
      'Photorealistic professional astronomical observatory at twilight. A large reflecting telescope inside an open dome aimed toward a deep starfield with the Milky Way arching overhead. Mountain horizon silhouette below. Cool navy and steel-blue palette, crisp atmospheric clarity. Empty negative space at the bottom of the frame for text overlay. Vertical 9:16 composition. NO screens, NO graphs, NO charts, NO dashboards, NO data visualizations, NO people or human figures, NO scientific UI, NO control rooms, NO maps, NO text labels.',
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
      '12 sun signs × 12 moon signs × 12 ascendants = 1,728 distinct configurations. Each occurs in roughly 0.06% of natal charts.',
    visual_mood:
      'Photorealistic celestial diagram. A luminous circular astrological chart wheel rendered in fine pale-gold and white linework, suspended at the center of a deep cosmic black-to-navy gradient background. The wheel is divided into twelve equal pie-slice sectors by thin radial lines, with two or three concentric rings forming inner and outer borders. Simple curved abstract symbolic forms (no letters, no characters, no readable script) sit centered in each sector. A few small bright golden dots placed at varying positions across the inner rings suggest planetary placements. Subtle gold-on-dark contrast, jewel-like crispness, mathematical precision. Soft luminous halo around the wheel. Sparse faint scattered stars in the cosmic background. Empty negative space at the bottom of the frame for text overlay. Vertical 9:16 composition. NO text, NO words, NO letters, NO characters, NO labels, NO names, NO numbers, NO digits, NO captions, NO UI elements, NO callout boxes, NO icons, NO modern interface, NO arrows, NO data dashboards, NO logos, NO faces, NO people.',
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
    visual_mood:
      'Photorealistic close-up study of a luxurious astrological identity card floating alone in deep cosmic space. Card face shows a circular sidereal chart wheel rendered in fine pale-gold and white linework on a deep navy-to-black gradient. Twelve zodiac sectors are separated by thin radial lines, with two concentric inner rings, abstract symbolic forms (no readable script) centered in each sector, and small bright golden dots marking planetary placements. A small luminous gold percentage motif sits at the bottom of the card surface to suggest rarity. Subtle gold-foil card edge, soft celestial halo around the card. Background: deep cosmic black-to-indigo gradient with sparse faint scattered stars. Empty negative space at the bottom of the frame for text overlay. Vertical 9:16 composition. NO people, NO faces, NO hands, NO phone screens, NO devices, NO UI elements, NO interface, NO icons, NO modern interface, NO arrows, NO data dashboards, NO logos, NO words, NO letters, NO characters, NO labels, NO names, NO numbers, NO digits, NO captions.',
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
    visual_mood:
      'Photorealistic celestial artifact study. A single large luminous astrological identity card displayed alone like a museum exhibit, suspended at center frame against a deep cosmic black-to-navy gradient backdrop with sparse golden stars. The card face shows a circular sidereal chart wheel in fine pale-gold and white linework with twelve sectors separated by thin radial lines, two concentric inner rings, abstract symbolic forms in each sector, and small bright golden dots at planetary positions. A small luminous gold percentage motif near the lower edge of the card suggests rarity. Subtle gold-foil card border, soft halo of light around the card. A single warm shaft of light from the upper left grazes the card surface, evoking reverent presentation of a sacred object. Empty negative space at the bottom of the frame for text overlay. Vertical 9:16 composition. NO people, NO faces, NO hands, NO phone screens, NO devices, NO UI elements, NO interface, NO icons, NO modern interface, NO arrows, NO logos, NO words, NO letters, NO characters, NO labels, NO names, NO numbers, NO digits, NO captions.',
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
  // ---------------------------------------------------------------------------
  // ARCHETYPE: lead_magnet
  // Direct-response hook for cold audience → trial signup.
  // Imperative framing ("calculate", "map") — instruction, not personal claim.
  // ---------------------------------------------------------------------------
  {
    id: 'en-lead-magnet-1',
    name: 'Lead Magnet — Free Sidereal Chart',
    archetype: 'lead_magnet',
    copy_template:
      'Your sidereal birth chart, free. Calculated to ±0.01° against the Swiss Ephemeris. No sun-sign guesswork.',
    visual_mood:
      'Photorealistic sidereal birth chart wheel, fine pale-gold linework on deep navy-to-black background. Twelve sectors, planetary glyphs at precise degrees, thin radial lines, observatory plate aesthetic. Soft halo above wheel. Empty negative space at the bottom for CTA overlay. NO text, NO labels, NO mystic clipart, NO crystal balls. Vertical 9:16 composition.',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'free chart claim is product-truthful — acceptable',
      '±0.01° accuracy cites Swiss Ephemeris / Moshier',
      'no personal predictions',
      'no fortune-telling language',
    ],
  },
  {
    id: 'en-lead-magnet-2',
    name: 'Lead Magnet — Map Your Sky',
    archetype: 'lead_magnet',
    copy_template:
      'Map your real sky in 90 seconds. Sidereal positions, calibrated to where the planets actually are tonight.',
    visual_mood:
      'Photorealistic deep night sky with subtle Milky Way band. Three planets visible with mathematical precision (Saturn with rings, Jupiter cream-banded, Mars deep red). Empty negative space at the bottom. NO UI, NO text, NO data dashboards. Vertical 9:16 composition.',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: [
      'product-action framing — acceptable',
      'no personal claims about the viewer',
      'no fortune-telling',
    ],
  },
  {
    id: 'en-lead-magnet-3',
    name: 'Lead Magnet — Not a Horoscope',
    archetype: 'lead_magnet',
    copy_template:
      "Not a horoscope. The actual sidereal chart, calibrated to the real sky — not the calendar's average.",
    visual_mood:
      'Split-screen comparison: left side a generic horoscope newspaper clipping aesthetic faded out; right side a precise sidereal chart wheel in pale-gold linework on deep navy-to-black. Vertical 9:16. NO text in image, NO logos. Empty bottom for CTA overlay.',
    duration_sec: 18,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'en',
    policy_constraints: [
      'comparative framing is factual — acceptable',
      'does not mock tropical astrology by name (just contrasts approaches)',
      'no personal claims about the viewer',
    ],
  },
  // ---------------------------------------------------------------------------
  // ADDITION TO ARCHETYPE: rarity (Cosmic Passport variant from Canva)
  // ---------------------------------------------------------------------------
  {
    id: 'en-rarity-7',
    name: 'Rarity — Your Cosmic Passport',
    archetype: 'rarity',
    copy_template:
      'Your Cosmic Passport. Sun, Moon, and Ascendant in their actual sidereal signs — a single shareable card.',
    visual_mood:
      'A single luminous astrological identity card centered, slightly tilted, vintage observatory pass aesthetic. Card face shows a circular sidereal chart wheel in pale-gold linework with twelve sectors, abstract symbolic forms (no readable script), small bright golden dots marking planetary positions. Subtle Tree-of-Life node geometry as corner watermark — NOT Frieda Harris Thoth deck imagery. Deep navy-to-black background with sparse stars. NO crystal balls, NO tarot, NO mystical clipart. NO text in image. Vertical 9:16 composition.',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'product description — acceptable',
      'Tree-of-Life geometry is symbolic schematic, not Frieda Harris Thoth (copyright until 2064)',
      'no personal claims about the viewer',
      'no fortune-telling',
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------

export function getHookTemplate(id: string): HookTemplate | undefined {
  return hooksEn.find(h => h.id === id);
}
