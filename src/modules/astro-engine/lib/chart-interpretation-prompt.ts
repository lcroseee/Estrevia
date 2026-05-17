import {
  AspectType,
  Planet,
  type Aspect,
  type ChartResult,
  type PlanetPosition,
} from '@/shared/types';

/**
 * Sidereal sign names in zodiacal order. Indexed by `floor(longitude / 30)`
 * after normalising the longitude into `[0, 360)`. Used to derive the
 * Ascendant sign from the first house cusp when houses are present.
 */
const SIGN_NAMES = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;

function longitudeToSign(longitude: number): string {
  const normalised = ((longitude % 360) + 360) % 360;
  return SIGN_NAMES[Math.floor(normalised / 30)];
}

/**
 * Planet enum values are PascalCase (e.g. `NorthNode`). Render them with
 * spaces so the LLM sees the conventional astrological label.
 */
function planetLabel(p: Planet): string {
  return p === Planet.NorthNode ? 'North Node' : (p as string);
}

/** Major aspects only — quincunx/semisextile are excluded from the prompt. */
const MAJOR_TYPES = new Set<AspectType>([
  AspectType.Conjunction,
  AspectType.Sextile,
  AspectType.Square,
  AspectType.Trine,
  AspectType.Opposition,
]);

/**
 * Builds a deterministic LLM prompt for a natal-chart interpretation. Pure
 * function — same input always returns the same string. No `Date.now()`,
 * no `Math.random()`, no env reads.
 *
 * Two locale branches: `'en'` (English) and `'es'` (español neutro LATAM,
 * tú form). Two structural branches: with houses (full life-domain reading)
 * and without (planets + aspects only).
 *
 * The top 3 major aspects by orb tightness are passed to the LLM; the rest
 * are dropped to keep the prompt focused and the response within the
 * `max_tokens` budget.
 */
export function buildChartInterpretationPrompt(
  chart: ChartResult,
  locale: 'en' | 'es',
): string {
  const planets = chart.planets;
  const find = (name: Planet): PlanetPosition | undefined =>
    planets.find((p) => p.planet === name);

  const sun = find(Planet.Sun);
  const moon = find(Planet.Moon);
  const mercury = find(Planet.Mercury);
  const venus = find(Planet.Venus);
  const mars = find(Planet.Mars);
  const jupiter = find(Planet.Jupiter);
  const saturn = find(Planet.Saturn);
  const uranus = find(Planet.Uranus);
  const neptune = find(Planet.Neptune);
  const pluto = find(Planet.Pluto);
  const northNode = find(Planet.NorthNode);
  const chiron = find(Planet.Chiron);

  const hasHouses = chart.houses !== null && chart.houses !== undefined;
  const ascSign = hasHouses ? longitudeToSign(chart.houses![0].degree) : null;

  const topAspects: Aspect[] = chart.aspects
    .filter((a) => MAJOR_TYPES.has(a.type))
    .slice()
    .sort((a, b) => Math.abs(a.orb) - Math.abs(b.orb))
    .slice(0, 3);

  const planetLine = (p: PlanetPosition | undefined, label: string): string => {
    if (!p) return `${label}: unknown`;
    const houseSuffix = hasHouses && p.house ? ` (house ${p.house})` : '';
    const retro = p.isRetrograde ? ' R' : '';
    return `${label}: ${p.sign} ${p.signDegree.toFixed(1)}°${retro}${houseSuffix}`;
  };

  const aspectLine = (a: Aspect): string =>
    `- ${planetLabel(a.planet1)} ${a.type.toLowerCase()} ${planetLabel(a.planet2)} (orb ${Math.abs(a.orb).toFixed(1)}°)`;

  const ascendantLine = hasHouses
    ? `Ascendant: ${ascSign}`
    : 'Ascendant: unknown — birth time not provided';

  const houseSection = hasHouses
    ? `\n\nLife domains (12 houses):\n${chart
        .houses!.map(
          (cusp, i) =>
            `- House ${i + 1}: cusp at ${longitudeToSign(cusp.degree)} ${(cusp.degree % 30).toFixed(1)}°`,
        )
        .join('\n')}`
    : '';

  const localeInstruction =
    locale === 'es'
      ? 'Write in español neutro LATAM, using the tú form (not vosotros, not usted).'
      : 'Write in English.';

  // When houses are missing we ask the model to skip the Ascendant / houses
  // material entirely. Wording avoids the substring "domain" so the
  // no-houses test can assert its absence.
  const ascendantConstraint = hasHouses
    ? ''
    : '\n- Do not reference houses or the Ascendant beyond noting the birth time is unknown.';

  return `You are an expert sidereal astrologer (Lahiri ayanamsa) interpreting a natal chart in the Hermetic-Kabbalistic-Thelemic tradition.

Chart placements:
${planetLine(sun, 'Sun')}
${planetLine(moon, 'Moon')}
${ascendantLine}
${planetLine(mercury, 'Mercury')}
${planetLine(venus, 'Venus')}
${planetLine(mars, 'Mars')}
${planetLine(jupiter, 'Jupiter')}
${planetLine(saturn, 'Saturn')}
${planetLine(uranus, 'Uranus')}
${planetLine(neptune, 'Neptune')}
${planetLine(pluto, 'Pluto')}
${planetLine(northNode, 'North Node')}
${planetLine(chiron, 'Chiron')}

Top 3 major aspects (tightest orbs):
${topAspects.map(aspectLine).join('\n')}${houseSection}

Provide a synthesis in 6-8 paragraphs covering:
1. Core identity — Sun, Moon, Ascendant interplay.
2. Mind and belief — Mercury and Jupiter.
3. Love and drive — Venus and Mars.
4. Challenges and transformation — Saturn and Pluto.
5. The top 3 aspects: how they wire these threads together.
${hasHouses ? '6. Life domains: which houses are most charged, what they reveal.' : ''}
${hasHouses ? '7' : '6'}. Synthesis: how do all these threads weave into one personality?

Constraints:
- ${localeInstruction}
- Avoid clichéd cosmic-path metaphors and tired self-help vocabulary.
- Do NOT give medical, financial, or legal advice.${ascendantConstraint}
- Close with a one-sentence reminder this reading is for self-reflection, not professional advice.
- Output as markdown — paragraph breaks only, no headings, no bullet lists. This renders inline.`;
}
