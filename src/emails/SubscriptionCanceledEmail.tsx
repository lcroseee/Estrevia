import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  accessEndDate: string;
}

const SITE_URL = 'https://estrevia.app';

const STRINGS = {
  en: {
    preview: 'Cancellation confirmed — your Pro access continues until your period ends.',
    heading: 'Subscription Canceled',
    body1: 'Cancellation confirmed. Your Pro access continues until',
    body1After: '— keep using everything until then.',
    body2: "You'll automatically move to the free plan after that. Reactivate any time from your settings.",
    cta: 'Manage subscription',
  },
  es: {
    preview: 'Cancelación confirmada — tu acceso Pro continúa hasta que termine tu período.',
    heading: 'Suscripción cancelada',
    body1: 'Cancelación confirmada. Tu acceso Pro continúa hasta el',
    body1After: '— sigue usando todo hasta entonces.',
    body2: 'Después pasarás automáticamente al plan gratuito. Puedes reactivar en cualquier momento desde tu configuración.',
    cta: 'Gestionar suscripción',
  },
};

export default function SubscriptionCanceledEmail({ locale, accessEndDate }: Props) {
  const t = STRINGS[locale];
  const settingsUrl = `${SITE_URL}/${locale === 'es' ? 'es/' : ''}settings`;
  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>
        {t.body1} <strong>{accessEndDate}</strong> {t.body1After}
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
        {t.body2}
      </Text>
      <Button href={settingsUrl}>{t.cta}</Button>
    </EmailLayout>
  );
}
