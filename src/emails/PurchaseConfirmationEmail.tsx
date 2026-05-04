import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  plan: 'pro_monthly' | 'pro_annual';
  nextChargeDate: string;
}

const SITE_URL = 'https://estrevia.app';

const PLAN_LABELS = {
  en: { pro_monthly: 'Pro Monthly', pro_annual: 'Pro Annual' },
  es: { pro_monthly: 'Pro Mensual', pro_annual: 'Pro Anual' },
};

const STRINGS = {
  en: {
    preview: "You're in — welcome to Estrevia Pro.",
    heading: 'Welcome to Estrevia Pro',
    intro: "You're in. Here's what unlocks:",
    features: [
      '240+ sidereal astrology essays',
      'Full moon calendar with Void-of-Course',
      'Planetary hours table',
      'Unlimited synastry (compatibility)',
      'AI tarot interpretation',
      'Personalized Tree of Life',
    ],
    plan: 'Plan',
    nextCharge: 'Next charge',
    cta: 'Open your dashboard',
  },
  es: {
    preview: 'Ya estás dentro — bienvenido a Estrevia Pro.',
    heading: 'Bienvenido a Estrevia Pro',
    intro: 'Ya estás dentro. Esto es lo que tienes disponible:',
    features: [
      'Más de 240 ensayos de astrología sideral',
      'Calendario lunar completo con Void-of-Course',
      'Tabla de horas planetarias',
      'Sinastría ilimitada (compatibilidad)',
      'Interpretación de tarot con IA',
      'Árbol de la Vida personalizado',
    ],
    plan: 'Plan',
    nextCharge: 'Próximo cobro',
    cta: 'Abre tu panel',
  },
};

export default function PurchaseConfirmationEmail({ locale, plan, nextChargeDate }: Props) {
  const t = STRINGS[locale];
  const planLabel = PLAN_LABELS[locale][plan];
  const dashUrl = `${SITE_URL}/${locale === 'es' ? 'es' : ''}`;
  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 8 }}>{t.intro}</Text>
      <ul style={{ paddingLeft: 20, margin: '0 0 24px', color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 1.8 }}>
        {t.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
        {t.plan}: <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{planLabel}</strong>
      </Text>
      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 32 }}>
        {t.nextCharge}: <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{nextChargeDate}</strong>
      </Text>
      <Button href={dashUrl}>{t.cta}</Button>
    </EmailLayout>
  );
}
