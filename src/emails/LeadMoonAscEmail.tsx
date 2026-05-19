import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  moonSign: string | null;
  ascSign: string | null;
  chartUrl: string; // renamed from signupUrl — points to /chart paywall surface
}

const STRINGS = {
  en: {
    preview: (moon: string | null) =>
      moon
        ? `Your Moon in ${moon} reveals your emotional core.`
        : 'Your sidereal Moon and Ascendant — what they reveal.',
    headingWithMoon: (moon: string) => `Your Moon in ${moon}`,
    headingFallback: 'Your sidereal Moon and Ascendant',
    moonBody: (moon: string) =>
      `Your Moon in ${moon} shows the emotional layer beneath what you signal to the world — the inner weather of how you actually feel and need.`,
    ascBody: (asc: string) =>
      `Your Ascendant in ${asc} is the threshold others meet first — the way you arrive in a room, the shape of your edge.`,
    triangleTease:
      "Your Sun, Moon, and Ascendant form a unique triangle — but the deeper pattern lives in your house placements and the aspects between planets. Estrevia's AI analysis reads the full layered map.",
    triangleTeaseMoonOnly:
      "Your Sun and Moon hint at the surface — but the deeper pattern lives in your house placements and the aspects between planets. Estrevia's AI analysis reads the full layered map.",
    cta: 'Read your AI-generated chart analysis',
    fallback:
      'Your sidereal Moon and Ascendant are part of a deeper pattern — readable on your full chart.',
    fallbackCta: 'See your full chart',
  },
  es: {
    preview: (moon: string | null) =>
      moon
        ? `Tu Luna en ${moon} revela tu núcleo emocional.`
        : 'Tu Luna sideral y tu Ascendente — qué revelan.',
    headingWithMoon: (moon: string) => `Tu Luna en ${moon}`,
    headingFallback: 'Tu Luna sideral y tu Ascendente',
    moonBody: (moon: string) =>
      `Tu Luna en ${moon} muestra la capa emocional debajo de lo que señalas al mundo — el clima interno de cómo realmente sientes y necesitas.`,
    ascBody: (asc: string) =>
      `Tu Ascendente en ${asc} es el umbral que otros encuentran primero — la forma en que llegas a una habitación, la forma de tu borde.`,
    triangleTease:
      'Tu Sol, Luna y Ascendente forman un triángulo único — pero el patrón más profundo vive en tus casas y los aspectos entre planetas. El análisis con IA de Estrevia lee el mapa completo en capas.',
    triangleTeaseMoonOnly:
      'Tu Sol y tu Luna insinúan la superficie — pero el patrón más profundo vive en tus casas y los aspectos entre planetas. El análisis con IA de Estrevia lee el mapa completo en capas.',
    cta: 'Lee tu análisis de carta generado con IA',
    fallback:
      'Tu Luna sideral y tu Ascendente son parte de un patrón más profundo — legible en tu carta completa.',
    fallbackCta: 'Ver tu carta completa',
  },
};

export default function LeadMoonAscEmail({ locale, moonSign, ascSign, chartUrl }: Props) {
  const t = STRINGS[locale];
  const hasData = Boolean(moonSign || ascSign);

  return (
    <EmailLayout preview={t.preview(moonSign)} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>
        {moonSign ? t.headingWithMoon(moonSign) : t.headingFallback}
      </Heading>

      {hasData ? (
        <>
          {moonSign && (
            <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 18 }}>
              {t.moonBody(moonSign)}
            </Text>
          )}
          {ascSign && (
            <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>
              {t.ascBody(ascSign)}
            </Text>
          )}
          <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24, color: '#9CA3AF' }}>
            {ascSign ? t.triangleTease : t.triangleTeaseMoonOnly}
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
