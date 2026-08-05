import {
  AspectType,
  Planet,
  type Aspect,
  type ChartResult,
  type PlanetPosition,
} from '@/shared/types';
import { projectChart } from '../zodiac-frame';

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
/**
 * Which section of the reading to generate.
 *
 * 'natal' is the original single reading. 'comparative' is SP-C's two-layer
 * sidereal/tropical section. They are cached separately — see the variant
 * column on chart_readings.
 */
export type ReadingVariant = 'natal' | 'comparative';

export function buildChartInterpretationPrompt(
  chart: ChartResult,
  locale: 'en' | 'es',
  variant: ReadingVariant = 'natal',
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
  // chart.ascendant is the already-correct sidereal angle and was sitting
  // unused beside this line. Deriving the sign from the tropical cusp made
  // the paid reading name a different rising sign from the one on the wheel.
  const ascSign = chart.ascendant?.sign ?? null;

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

  // Guard on ascSign itself, not on hasHouses: the two can only disagree if a
  // chart has cusps but no angle, and in that case naming a null Ascendant is
  // worse than saying it is unknown.
  const ascendantLine = ascSign
    ? `Ascendant: ${ascSign}`
    : 'Ascendant: unknown — birth time not provided';

  const houseSection = hasHouses
    ? `\n\nLife domains (12 houses):\n${chart
        .houses!.map(
          (cusp, i) =>
            // siderealDegree % 30, not signDegree: signDegree is the integer
            // part only, so using it here would drop the precision the old
            // line carried and print every cusp as a whole degree.
            `- House ${i + 1}: cusp at ${cusp.sign} ${(cusp.siderealDegree % 30).toFixed(1)}°`,
        )
        .join('\n')}`
    : '';

  const localeInstruction =
    locale === 'es'
      ? 'Write in español neutro LATAM, using the tú form (not vosotros, not usted). ' +
        // Without this the model writes "Géminis" and "Escorpio", which
        // contradicts the sign names rendered everywhere else in the ES UI.
        // Planet names ARE translated; sign names are not. See CLAUDE.md.
        'Keep every zodiac sign name in English exactly as given (Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces) — do not translate them. Planet names should be in Spanish.'
      : 'Write in English.';

  // When houses are missing we ask the model to skip the Ascendant / houses
  // material entirely. Wording avoids the substring "domain" so the
  // no-houses test can assert its absence.
  const ascendantConstraint = hasHouses
    ? ''
    : '\n- Do not reference houses or the Ascendant beyond noting the birth time is unknown.';

  if (variant === 'comparative') {
    const tropical = projectChart(chart, 'tropical');
    const pair = (planet: Planet, label: string): string => {
      const sid =
        planet === Planet.Ascendant
          ? chart.ascendant
          : chart.planets.find((p) => p.planet === planet);
      const tro =
        planet === Planet.Ascendant
          ? tropical.ascendant
          : tropical.planets.find((p) => p.planet === planet);
      if (!sid || !tro) return `${label}: unknown`;
      return sid.sign === tro.sign
        ? `${label}: ${sid.sign} in both systems`
        : `${label}: sidereal ${sid.sign}, tropical ${tro.sign}`;
    };

    return `You are an expert astrologer writing for a reader who has just discovered that their chart reads differently in two zodiac systems.

The two systems differ by a constant offset (the Lahiri ayanamsa, ${chart.ayanamsa.toFixed(2)}° at this moment). The aspects and the house numbers are identical in both — only the sign a body falls in can change.

Frame this as two layers of one person, not as two competing claims:
- The TROPICAL placement describes who they are becoming here: the shaping that incarnation, season and earthly life do to them.
- The SIDEREAL placement describes what they are beneath that shaping: the fixed-star reckoning, what they were before and under the incarnational layer.

Their placements:
${pair(Planet.Sun, 'Sun')}
${pair(Planet.Moon, 'Moon')}
${pair(Planet.Ascendant, 'Ascendant')}

Write three short sections, one per body, skipping any marked unknown. For each, read the two placements against each other: what the incarnational layer is shaping, and what sits underneath it. Where both systems agree on a body, say so plainly and treat the agreement as meaningful rather than as an absence.

${localeInstruction}

Constraints:
- Never present one system as more correct than the other. They answer different questions.
- Do not give medical, financial, legal or psychiatric advice, and do not imply any.
- End with one sentence noting this is a tool for self-reflection and symbolic insight, and is not professional, medical, financial or legal advice.
- No headings beyond the three body names. No bullet lists. Plain prose.`;
  }

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
