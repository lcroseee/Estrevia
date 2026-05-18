import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  chartUrl: string;
  unsubscribeUrl: string;
}

const STRINGS = {
  en: {
    preview: 'A weekly note from Estrevia: what your Saturn is doing.',
    heading: 'Your Saturn this week',
    body1:
      'Saturn rules discipline, time, and the slow shaping of who you are becoming. In sidereal Vedic astrology, its position right now shows where life is asking for patience and structure.',
    body2:
      'Step back this week and notice: where are you being asked to slow down? Where would 1% more consistency compound over the next year?',
    cta: 'Open your chart',
  },
  es: {
    preview: 'Una nota semanal de Estrevia: qué está haciendo tu Saturno.',
    heading: 'Tu Saturno esta semana',
    body1:
      'Saturno rige la disciplina, el tiempo y la lenta formación de quien estás siendo. En astrología sideral védica, su posición ahora muestra dónde la vida pide paciencia y estructura.',
    body2:
      'Esta semana, da un paso atrás y observa: ¿dónde te están pidiendo desacelerar? ¿Dónde un 1% más de consistencia compondría durante el próximo año?',
    cta: 'Abre tu carta',
  },
};

export default function SaturnWeeklyEmail({ locale, chartUrl, unsubscribeUrl }: Props) {
  const t = STRINGS[locale];
  return (
    <EmailLayout preview={t.preview} locale={locale} unsubscribeUrl={unsubscribeUrl}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.body1}</Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>{t.body2}</Text>
      <Button href={chartUrl}>{t.cta}</Button>
    </EmailLayout>
  );
}
