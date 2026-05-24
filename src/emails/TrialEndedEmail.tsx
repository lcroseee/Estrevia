import { Heading, Text, Link } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  proUrl: string;
  chartUrl: string;
  couponCode?: string;
}

// TODO i18n: ES strings are structural stubs (español neutro LATAM, tú form).
// Review with native speaker before enabling ES trial sends.
const STRINGS = {
  en: {
    preview: "Your sidereal chart is saved. Pick up where you left off.",
    heading: "Your trial has ended",
    body1:
      "Your Estrevia Pro trial ended. We hope you found your sidereal chart useful — the accurate positions using Lahiri ayanamsa, the houses, the interpretations.",
    lockedHeading: "What's Pro-only now:",
    locked: [
      "Full AI chart reading (all 12 placements interpreted)",
      "Saturn Return timing and Dasha windows",
      "Synastry (compatibility) readings",
      "AI tarot and personalized Tree of Life",
    ],
    body2: "Your base chart is still saved — the positions, signs, and houses are always free.",
    couponIntro: (code: string) =>
      `Want to continue? Use code ${code} at checkout for 10% off your first month.`,
    cta: "Restart with Pro",
    secondaryLabel: "See what's free →",
    closing: "— The Estrevia team",
  },
  es: {
    // TODO i18n: revisado por native speaker pendiente
    preview: "Tu carta sideral está guardada. Retoma donde lo dejaste.",
    heading: "Tu prueba ha terminado",
    body1:
      "Tu prueba de Estrevia Pro terminó. Esperamos que tu carta sideral haya sido útil — las posiciones precisas usando el ayanamsa Lahiri, las casas, las interpretaciones.",
    lockedHeading: "Lo que ahora es solo Pro:",
    locked: [
      "Lectura completa de carta con IA (las 12 posiciones interpretadas)",
      "Timing del Retorno de Saturno y ventanas Dasha",
      "Lecturas de sinastría (compatibilidad)",
      "Tarot con IA y Árbol de la Vida personalizado",
    ],
    body2:
      "Tu carta base sigue guardada — las posiciones, signos y casas son siempre gratuitas.",
    couponIntro: (code: string) =>
      `¿Quieres continuar? Usa el código ${code} al pagar para obtener un 10% de descuento en tu primer mes.`,
    cta: "Reiniciar con Pro",
    secondaryLabel: "Ver qué es gratuito →",
    closing: "— El equipo de Estrevia",
  },
} as const;

export default function TrialEndedEmail({ locale, proUrl, chartUrl, couponCode }: Props) {
  const t = STRINGS[locale];

  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 26, marginBottom: 16, color: 'rgba(255,255,255,0.95)' }}>
        {t.heading}
      </Heading>

      <Text style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16, color: 'rgba(255,255,255,0.85)' }}>
        {t.body1}
      </Text>

      <Text style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'rgba(255,255,255,0.7)' }}>
        {t.lockedHeading}
      </Text>

      <ul style={{ paddingLeft: 20, margin: '0 0 20px', color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 1.9 }}>
        {t.locked.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <Text style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 20, color: 'rgba(255,255,255,0.85)' }}>
        {t.body2}
      </Text>

      {couponCode ? (
        <Text
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 24,
            padding: '12px 16px',
            backgroundColor: 'rgba(255,215,0,0.08)',
            borderLeft: '3px solid #FFD700',
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {t.couponIntro(couponCode)}
        </Text>
      ) : null}

      <Button href={proUrl}>{t.cta}</Button>

      <Text style={{ fontSize: 13, marginTop: 16 }}>
        <Link href={chartUrl} style={{ color: 'rgba(255,255,255,0.5)' }}>
          {t.secondaryLabel}
        </Link>
      </Text>

      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 24 }}>
        {t.closing}
      </Text>
    </EmailLayout>
  );
}
