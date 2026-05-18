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
    preview: 'A weekly note from Estrevia about Saturn.',
    heading: 'A weekly note about Saturn',
    body1:
      'Sade-sati is the seven-and-a-half-year Saturn passage that visits every chart in three phases: twelfth-house preparation, first-house stripping-down, second-house rebuild of what matters. Whether you are inside it now or watching its memory, Saturn\'s task does not change — to build the structure your future self will rest on.',
    body2:
      'Step back and notice: what would you keep building if no one were watching? Saturn\'s question is rarely the urgent one — it is the slow one that compounds.',
    cta: 'Open your chart',
  },
  es: {
    preview: 'Una nota semanal de Estrevia sobre Saturno.',
    heading: 'Una nota semanal sobre Saturno',
    body1:
      'Sade-sati es el tránsito saturnino de siete años y medio que visita toda carta en tres fases: preparación en la casa doce, desmonte de identidad en la primera, reconstrucción de valores en la segunda. Estés dentro ahora o viendo su memoria, la tarea de Saturno no cambia — construir la estructura sobre la cual tu yo futuro descansará.',
    body2:
      'Da un paso atrás y observa: ¿qué seguirías construyendo si nadie te mirara? La pregunta de Saturno rara vez es la urgente — es la lenta, la que compone.',
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
