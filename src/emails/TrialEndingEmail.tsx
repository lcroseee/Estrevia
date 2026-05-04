import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  trialEnd: Date;
}

const SITE_URL = 'https://estrevia.app';

const STRINGS = {
  en: {
    preview: 'Your Estrevia Pro trial ends tomorrow — keep everything by staying subscribed.',
    heading: 'Your trial ends tomorrow',
    body1: (date: string) =>
      `Your Estrevia Pro free trial ends on ${date}. After that, your subscription will be charged automatically.`,
    body2: "If you want to cancel, you can do so anytime from your settings.",
    featuresHeading: 'What you get with Pro:',
    features: [
      'All 240+ sidereal astrology essays',
      'Full moon calendar with Void-of-Course',
      'Complete planetary hours table',
      'Unlimited synastry (compatibility)',
      'AI tarot interpretation',
      'Personalized Tree of Life',
    ],
    cta: 'Manage subscription',
    closing: '— The Estrevia team',
  },
  es: {
    preview: 'Tu prueba gratuita de Estrevia Pro termina mañana — mantén todo siguiendo suscrito.',
    heading: 'Tu prueba termina mañana',
    body1: (date: string) =>
      `Tu prueba gratuita de Estrevia Pro termina el ${date}. Después de eso, tu suscripción se cobrará automáticamente.`,
    body2: 'Si quieres cancelar, puedes hacerlo en cualquier momento desde tu configuración.',
    featuresHeading: 'Lo que obtienes con Pro:',
    features: [
      'Todos los 240+ ensayos de astrología sideral',
      'Calendario lunar completo con Void-of-Course',
      'Tabla de horas planetarias completa',
      'Sinastría ilimitada (compatibilidad)',
      'Interpretación de tarot con IA',
      'Árbol de la Vida personalizado',
    ],
    cta: 'Gestionar suscripción',
    closing: '— El equipo de Estrevia',
  },
};

function formatTrialEnd(date: Date, locale: 'en' | 'es'): string {
  const lang = locale === 'es' ? 'es-419' : 'en-US';
  return date.toLocaleDateString(lang, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function TrialEndingEmail({ locale, trialEnd }: Props) {
  const t = STRINGS[locale];
  const settingsUrl = `${SITE_URL}/${locale === 'es' ? 'es/' : ''}settings`;
  const formattedDate = formatTrialEnd(trialEnd, locale);
  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.body1(formattedDate)}</Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>{t.body2}</Text>
      <Text style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t.featuresHeading}</Text>
      <ul style={{ paddingLeft: 20, margin: '0 0 32px', color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 1.8 }}>
        {t.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <Button href={settingsUrl}>{t.cta}</Button>
      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 32 }}>{t.closing}</Text>
    </EmailLayout>
  );
}
