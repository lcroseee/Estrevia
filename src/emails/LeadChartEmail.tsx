import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  sunSign: string | null;
  moonSign: string | null;
  ascSign: string | null;  // null when knowsBirthTime=false
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
    preview: 'Your sidereal Sun, Moon, and rising — calculated with Lahiri precision.',
    heading: 'Your sidereal chart is ready',
    intro: 'Estrevia calculates planetary positions from where the planets actually appear in the sky — Lahiri sidereal, ±0.01° precision.',
    teaserSun: (sign: string) => `Your Sun in ${sign}`,
    teaserMoon: (sign: string) => `Your Moon in ${sign}`,
    teaserAsc: (sign: string) => `Your Rising in ${sign}`,
    cta: 'See your full chart',
    fallback: 'Your sidereal chart is waiting — Estrevia uses Lahiri precision.',
    fallbackCta: 'Calculate your chart',
    oneLiner: (sign: string) => SIGN_ONE_LINERS_EN[sign] ?? '',
  },
  es: {
    preview: 'Tu Sol, Luna y ascendente siderales — calculados con precisión Lahiri.',
    heading: 'Tu carta sideral está lista',
    intro: 'Estrevia calcula las posiciones planetarias desde donde los planetas aparecen realmente en el cielo — sideral Lahiri, precisión ±0,01°.',
    teaserSun: (sign: string) => `Tu Sol en ${sign}`,
    teaserMoon: (sign: string) => `Tu Luna en ${sign}`,
    teaserAsc: (sign: string) => `Tu Ascendente en ${sign}`,
    cta: 'Ver tu carta completa',
    fallback: 'Tu carta sideral te espera — Estrevia usa precisión Lahiri.',
    fallbackCta: 'Calcula tu carta',
    oneLiner: (sign: string) => SIGN_ONE_LINERS_ES[sign] ?? '',
  },
};

export default function LeadChartEmail({ locale, sunSign, moonSign, ascSign, chartUrl }: Props) {
  const t = STRINGS[locale];
  const hasAnyData = sunSign || moonSign || ascSign;

  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>

      {hasAnyData ? (
        <>
          <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>{t.intro}</Text>
          {sunSign && (
            <Text style={{ fontSize: 15, marginBottom: 8 }}>
              <strong>{t.teaserSun(sunSign)}</strong>
              {t.oneLiner(sunSign) && <> — {t.oneLiner(sunSign)}</>}
            </Text>
          )}
          {moonSign && (
            <Text style={{ fontSize: 15, marginBottom: 8 }}>
              <strong>{t.teaserMoon(moonSign)}</strong>
              {t.oneLiner(moonSign) && <> — {t.oneLiner(moonSign)}</>}
            </Text>
          )}
          {ascSign && (
            <Text style={{ fontSize: 15, marginBottom: 24 }}>
              <strong>{t.teaserAsc(ascSign)}</strong>
              {t.oneLiner(ascSign) && <> — {t.oneLiner(ascSign)}</>}
            </Text>
          )}
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
