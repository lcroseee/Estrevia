/**
 * LeadPaywallTeaserBEmail — Variant B of the paywall_teaser A/B test.
 *
 * Personalized variant: uses dominant planet + sign (+ house when available)
 * as an opening hook. Rest of body is identical to Variant A (control).
 * No discount offered.
 */
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  sunSign: string | null;
  moonSign: string | null;
  ascSign: string | null;
  trialUrl: string;
  /** Dominant planet name in English (Saturn | Mars | Venus | Mercury) */
  dominantPlanet: string;
  /** Dominant planet sign name (always in English per CLAUDE.md sign names policy) */
  dominantSign: string;
  /** House number (1–12) if birth time is known; null otherwise */
  dominantHouse: number | null;
  /** Dominant planet translated name for ES locale */
  dominantPlanetEs: string;
}

const STRINGS = {
  en: {
    preview: (planet: string, sign: string) =>
      `Your ${planet} in ${sign} is worth a closer look — here's what your full chart reveals.`,
    eyebrow: 'Locked behind Star',
    hook: (planet: string, sign: string, house: number | null) =>
      house !== null
        ? `Your ${planet} in ${sign} (house ${house}) is one of the most telling placements in your chart.`
        : `Your ${planet} in ${sign} is one of the most telling placements in your chart.`,
    heading: (sun: string | null, moon: string | null, asc: string | null) => {
      const parts = [sun, moon, asc].filter(Boolean);
      if (parts.length === 0) return 'The full reading for your chart';
      return `The full reading for your ${parts.join('–')} chart`;
    },
    body: 'Your Sun, Moon, Ascendant, all 8 outer planets, the houses, and the 3 tightest aspects — woven into a personal synthesis. Generated for your exact chart, not a generic horoscope.',
    teaser: 'Mercury · Venus · Mars · Jupiter · Saturn · Uranus · Neptune · Pluto · N. Node · Chiron + 12 houses + top 3 aspects',
    cta: 'Start 3-day free trial',
    trustLine: 'Cancel anytime. No charge until your trial ends.',
  },
  es: {
    preview: (planet: string, sign: string) =>
      `Tu ${planet} en ${sign} merece una mirada más atenta — esto es lo que revela tu carta completa.`,
    eyebrow: 'Bloqueado por Star',
    hook: (planet: string, sign: string, house: number | null) =>
      house !== null
        ? `Tu ${planet} en ${sign} (casa ${house}) es uno de los posicionamientos más reveladores de tu carta.`
        : `Tu ${planet} en ${sign} es uno de los posicionamientos más reveladores de tu carta.`,
    heading: (sun: string | null, moon: string | null, asc: string | null) => {
      const parts = [sun, moon, asc].filter(Boolean);
      if (parts.length === 0) return 'La lectura completa de tu carta';
      return `La lectura completa de tu carta ${parts.join('–')}`;
    },
    body: 'Tu Sol, Luna, Ascendente, los 8 planetas exteriores, las casas y los 3 aspectos más cerrados — tejidos en una síntesis personal. Generada para tu carta exacta, no un horóscopo genérico.',
    teaser: 'Mercurio · Venus · Marte · Júpiter · Saturno · Urano · Neptuno · Plutón · N. Lunar · Quirón + 12 casas + 3 aspectos principales',
    cta: 'Inicia prueba gratis de 3 días',
    trustLine: 'Cancela cuando quieras. Sin cobro hasta que termine la prueba.',
  },
};

export default function LeadPaywallTeaserBEmail({
  locale,
  sunSign,
  moonSign,
  ascSign,
  trialUrl,
  dominantPlanet,
  dominantSign,
  dominantHouse,
  dominantPlanetEs,
}: Props) {
  const t = STRINGS[locale];
  const planetDisplay = locale === 'es' ? dominantPlanetEs : dominantPlanet;

  return (
    <EmailLayout preview={t.preview(planetDisplay, dominantSign)} locale={locale}>
      <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,215,0,0.6)', marginBottom: 8 }}>
        {t.eyebrow}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(255,215,0,0.85)', fontStyle: 'italic', marginBottom: 12 }}>
        {t.hook(planetDisplay, dominantSign, dominantHouse)}
      </Text>
      <Heading style={{ fontSize: 24, marginBottom: 16 }}>{t.heading(sunSign, moonSign, ascSign)}</Heading>
      <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>{t.body}</Text>
      <Text style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', marginBottom: 24 }}>
        {t.teaser}
      </Text>
      <Button href={trialUrl}>{t.cta}</Button>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 16 }}>{t.trustLine}</Text>
    </EmailLayout>
  );
}
