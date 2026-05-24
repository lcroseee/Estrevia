import { Heading, Text, Button } from '@react-email/components';
import { DunningEmailLayout } from './components/DunningEmailLayout';

interface Props {
  locale: 'en' | 'es';
  settingsUrl: string;
}

const STRINGS = {
  en: {
    preview: 'Your Estrevia Pro access will pause in 3 days — act now to keep it.',
    heading: 'Your Pro access will pause in 3 days',
    body1: "We've tried several times to process your payment without success. Unless you update your payment method, your Estrevia Pro access will be paused.",
    loseHeading: "You'll lose access to:",
    loseItems: [
      '240+ sidereal astrology essays',
      'Unlimited synastry readings',
      'AI tarot interpretation',
      'Full moon calendar',
    ],
    body2: "We want you to stay. Update your payment method now and your access continues without interruption.",
    cta: 'Update payment method',
    closing: '— The Estrevia team',
  },
  es: {
    preview: 'Tu acceso a Estrevia Pro se pausará en 3 días — actúa ahora para mantenerlo.',
    heading: 'Tu acceso Pro se pausará en 3 días',
    body1: 'Hemos intentado procesar tu pago varias veces sin éxito. A menos que actualices tu método de pago, tu acceso a Estrevia Pro será pausado.',
    loseHeading: 'Perderás acceso a:',
    loseItems: [
      'Más de 240 ensayos de astrología sideral',
      'Lecturas de sinastría ilimitadas',
      'Interpretación de tarot con IA',
      'Calendario lunar completo',
    ],
    body2: 'Queremos que te quedes. Actualiza tu método de pago ahora y tu acceso continuará sin interrupciones.',
    cta: 'Actualizar método de pago',
    closing: '— El equipo de Estrevia',
  },
};

export default function DunningUrgencyEmail({ locale, settingsUrl }: Props) {
  const t = STRINGS[locale];

  return (
    <DunningEmailLayout preview={t.preview} locale={locale} settingsUrl={settingsUrl}>
      <Heading
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: '#b91c1c',
          marginBottom: 16,
        }}
      >
        {t.heading}
      </Heading>
      <Text style={{ fontSize: 15, lineHeight: 1.6, color: '#3f3f46', marginBottom: 16 }}>
        {t.body1}
      </Text>
      <Text
        style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}
      >
        {t.loseHeading}
      </Text>
      <ul
        style={{
          paddingLeft: 20,
          margin: '0 0 24px',
          color: '#b91c1c',
          fontSize: 14,
          lineHeight: 1.8,
        }}
      >
        {t.loseItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Text style={{ fontSize: 15, lineHeight: 1.6, color: '#3f3f46', marginBottom: 32 }}>
        {t.body2}
      </Text>
      <Button
        href={settingsUrl}
        style={{
          background: '#b91c1c',
          color: '#ffffff',
          padding: '14px 28px',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 15,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        {t.cta}
      </Button>
      <Text style={{ fontSize: 13, color: '#a1a1aa', marginTop: 40 }}>{t.closing}</Text>
    </DunningEmailLayout>
  );
}
