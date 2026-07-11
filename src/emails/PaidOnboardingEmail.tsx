import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
}

const SITE_URL = 'https://estrevia.app';

// Transactional activation nudge sent ~24h after subscribing (paid-onboarding
// cron). No unsubscribeUrl — EmailLayout's CAN-SPAM postal-address gate applies
// only to commercial (unsubscribe-bearing) emails.
const STRINGS = {
  en: {
    preview: 'Your first AI reading is waiting — it takes two minutes.',
    heading: 'Your chart has more to say',
    intro:
      "You unlocked Estrevia Pro yesterday. The fastest way to feel the difference: generate your AI reading — a personal interpretation of your actual sidereal chart, not a generic horoscope.",
    how: 'Open your chart and press "Generate reading". About two minutes, and it stays saved to your account.',
    cta: 'Generate my AI reading',
    also: 'Also included in Pro: unlimited synastry, AI tarot spreads, and 240+ essays.',
  },
  es: {
    preview: 'Tu primera lectura con IA te espera — toma dos minutos.',
    heading: 'Tu carta tiene más que decir',
    intro:
      'Ayer desbloqueaste Estrevia Pro. La forma más rápida de notar la diferencia: genera tu lectura con IA — una interpretación personal de tu carta sideral real, no un horóscopo genérico.',
    how: 'Abre tu carta y presiona "Generar lectura". Toma unos dos minutos y queda guardada en tu cuenta.',
    cta: 'Generar mi lectura con IA',
    also: 'También incluido en Pro: sinastría ilimitada, tiradas de tarot con IA y más de 240 ensayos.',
  },
};

export default function PaidOnboardingEmail({ locale }: Props) {
  const t = STRINGS[locale];
  const chartUrl = `${SITE_URL}${locale === 'es' ? '/es' : ''}/chart`;
  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.intro}</Text>
      <Text style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', marginBottom: 28 }}>
        {t.how}
      </Text>
      <Button href={chartUrl}>{t.cta}</Button>
      <Text style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.5)', marginTop: 28 }}>
        {t.also}
      </Text>
    </EmailLayout>
  );
}
