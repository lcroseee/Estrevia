/**
 * LeadPaywallTeaserCEmail — Variant C of the paywall_teaser A/B test.
 *
 * Personalized + Discount variant: extends Variant B with a 20% off urgency
 * block and modified CTA. Coupon is applied via the trialUrl (TEASER20 param);
 * the urgency text is passed as a pre-built string from the send function.
 *
 * Bundle risk acknowledged: this variant tests personalization + discount
 * simultaneously. See docs/specs/paywall-teaser-abtest-brainstorm.md §2.
 */
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  sunSign: string | null;
  moonSign: string | null;
  ascSign: string | null;
  /** trialUrl with coupon param appended (e.g. &coupon=TEASER20) */
  trialUrl: string;
  /** Dominant planet name in English */
  dominantPlanet: string;
  /** Dominant planet sign name (English) */
  dominantSign: string;
  /** House number (1–12) or null if birth time unknown */
  dominantHouse: number | null;
  /** Dominant planet translated name for ES locale */
  dominantPlanetEs: string;
}

const STRINGS = {
  en: {
    preview: (planet: string, sign: string) =>
      `Your ${planet} in ${sign} has a reading waiting — plus 20% off for the next 48 hours.`,
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
    urgency: 'For the next 48 hours, your full reading is available at 20% off the annual plan.',
    cta: 'Claim 20% off — start free trial',
    trustLine: 'Cancel anytime. No charge until your trial ends.',
  },
  es: {
    preview: (planet: string, sign: string) =>
      `Tu ${planet} en ${sign} tiene una lectura esperándote — más 20% de descuento por 48h.`,
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
    urgency: 'Por las próximas 48 horas, tu lectura completa está disponible con 20% de descuento en el plan anual.',
    cta: 'Reclamar 20% off — iniciar prueba gratis',
    trustLine: 'Cancela cuando quieras. Sin cobro hasta que termine la prueba.',
  },
};

export default function LeadPaywallTeaserCEmail({
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
      {/* Discount urgency block — distinguishes Variant C from Variant B */}
      <Text style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,215,0,0.9)', fontWeight: 600, marginBottom: 16, padding: '12px 16px', backgroundColor: 'rgba(255,215,0,0.08)', borderLeft: '2px solid rgba(255,215,0,0.4)' }}>
        {t.urgency}
      </Text>
      <Button href={trialUrl}>{t.cta}</Button>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 16 }}>{t.trustLine}</Text>
    </EmailLayout>
  );
}
