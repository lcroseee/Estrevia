import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  unsubscribeUrl: string;
}

const SITE_URL = 'https://estrevia.app';

const STRINGS = {
  en: {
    preview: "It's been a few weeks — your chart and saved data are still here.",
    heading: 'Estrevia misses you',
    body1: "It's been a few weeks. Since you last visited, the Moon has moved through several signs and the planetary hour table has refreshed daily.",
    body2: 'Your chart and saved data are exactly where you left them.',
    cta: 'Open your chart',
  },
  es: {
    preview: 'Han pasado algunas semanas — tu carta y tus datos siguen aquí.',
    heading: 'Estrevia te extraña',
    body1: 'Han pasado algunas semanas. Desde tu última visita, la Luna ha transitado por varios signos y la tabla de horas planetarias se ha actualizado cada día.',
    body2: 'Tu carta y tus datos guardados están exactamente donde los dejaste.',
    cta: 'Abre tu carta',
  },
};

export default function ReEngagementEmail({ locale, unsubscribeUrl }: Props) {
  const t = STRINGS[locale];
  const chartUrl = `${SITE_URL}/${locale === 'es' ? 'es/' : ''}chart`;
  return (
    <EmailLayout preview={t.preview} locale={locale} unsubscribeUrl={unsubscribeUrl}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.body1}</Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>{t.body2}</Text>
      <Button href={chartUrl}>{t.cta}</Button>
    </EmailLayout>
  );
}
