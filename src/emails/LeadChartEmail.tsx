import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';
import { PLANET_ES_NAMES } from '@/shared/lib/planet-i18n';

interface Props {
  locale: 'en' | 'es';
  sunSign: string | null;
  // Moon/asc deliberately NOT exposed — T+0 withholds them per cliffhanger.
  hasMoonSign: boolean;
  hasAscSign: boolean;
  dominantPlanet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury';
  chartUrl: string;
}

const SIGN_ONE_LINERS_EN: Record<string, string> = {
  Aries: 'kindled by direct action', Taurus: 'rooted in tangible value',
  Gemini: 'wired for variety', Cancer: 'tuned to emotional memory',
  Leo: 'lit by self-expression', Virgo: 'sharpened by craft',
  Libra: 'balanced through relation', Scorpio: 'drawn to depth',
  Sagittarius: 'reaching past the horizon', Capricorn: 'built for the long arc',
  Aquarius: 'patterned by signal', Pisces: 'tuned to undercurrents',
};
const SIGN_ONE_LINERS_ES: Record<string, string> = {
  Aries: 'encendido por la acción directa', Taurus: 'enraizado en valor tangible',
  Gemini: 'cableado para la variedad', Cancer: 'sintonizado con la memoria emocional',
  Leo: 'iluminado por la expresión', Virgo: 'afilado por el oficio',
  Libra: 'equilibrado por la relación', Scorpio: 'atraído a lo profundo',
  Sagittarius: 'alcanzando más allá del horizonte', Capricorn: 'construido para el largo arco',
  Aquarius: 'tejido por la señal', Pisces: 'sintonizado con las corrientes',
};

const STRINGS = {
  en: {
    preview: (sign: string | null) =>
      sign
        ? `Your Sidereal Sun lands in ${sign} — and that's just the surface.`
        : 'Your sidereal chart is ready — and there is more beneath it.',
    heading: 'Your sidereal chart is ready',
    intro: 'Estrevia calculates from where the planets actually appear in the sky — Lahiri sidereal, ±0.01° precision.',
    teaserSun: (sign: string) => `Your Sun in ${sign}`,
    moonAscTease: 'Your Moon and Ascendant tell a deeper story — visible on your full chart.',
    moonOnlyTease: 'Your Moon sign tells a deeper story — visible on your full chart.',
    planetTease: (planet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury') => `And your ${planet} is doing something most charts don't.`,
    cta: 'See your full chart',
    fallback: 'Your sidereal chart is waiting — Estrevia uses Lahiri precision.',
    fallbackCta: 'Calculate your chart',
    oneLiner: (sign: string) => SIGN_ONE_LINERS_EN[sign] ?? '',
  },
  es: {
    preview: (sign: string | null) =>
      sign
        ? `Tu Sol Sideral cae en ${sign} — y eso es solo la superficie.`
        : 'Tu carta sideral está lista — y hay más debajo.',
    heading: 'Tu carta sideral está lista',
    intro: 'Estrevia calcula desde donde los planetas aparecen realmente en el cielo — sideral Lahiri, precisión ±0,01°.',
    teaserSun: (sign: string) => `Tu Sol en ${sign}`,
    moonAscTease: 'Tu Luna y tu Ascendente cuentan una historia más profunda — visible en tu carta completa.',
    moonOnlyTease: 'Tu Luna sideral cuenta una historia más profunda — visible en tu carta completa.',
    planetTease: (planet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury') => `Y tu ${PLANET_ES_NAMES[planet]} está haciendo algo que la mayoría de las cartas no hace.`,
    cta: 'Ver tu carta completa',
    fallback: 'Tu carta sideral te espera — Estrevia usa precisión Lahiri.',
    fallbackCta: 'Calcula tu carta',
    oneLiner: (sign: string) => SIGN_ONE_LINERS_ES[sign] ?? '',
  },
};

export default function LeadChartEmail({
  locale,
  sunSign,
  hasMoonSign,
  hasAscSign,
  dominantPlanet,
  chartUrl,
}: Props) {
  const t = STRINGS[locale];
  const showCliffhanger = sunSign && (hasMoonSign || hasAscSign);

  return (
    <EmailLayout preview={t.preview(sunSign)} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>

      {showCliffhanger ? (
        <>
          <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 20 }}>{t.intro}</Text>
          {sunSign && (
            <Text style={{ fontSize: 16, marginBottom: 12 }}>
              <strong>{t.teaserSun(sunSign)}</strong>
              {t.oneLiner(sunSign) && <> — {t.oneLiner(sunSign)}</>}
            </Text>
          )}
          <Text style={{ fontSize: 15, color: '#9CA3AF', marginBottom: 18, fontStyle: 'italic' }}>
            {hasAscSign ? t.moonAscTease : t.moonOnlyTease}
          </Text>
          <Text style={{ fontSize: 15, color: '#9CA3AF', marginBottom: 24, fontStyle: 'italic' }}>
            {t.planetTease(dominantPlanet)}
          </Text>
          <Button href={chartUrl}>{t.cta}</Button>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>{t.fallback}</Text>
          <Button href={chartUrl}>{t.fallbackCta}</Button>
        </>
      )}
    </EmailLayout>
  );
}
