import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  synastryUrl: string;
  unsubscribeUrl: string;
}

const STRINGS = {
  en: {
    preview: 'Compare your chart with someone you love — free synastry reading.',
    heading: 'Want to see your compatibility?',
    body1:
      "We've sent you your sidereal chart, your Moon and Ascendant, a paywall teaser, and a weekly Saturn note. Here's one more: synastry — the chart comparison between two people.",
    body2:
      "Add a partner, friend, or family member's birth data and Estrevia will calculate your synastry reading free. No card required, no nudge: just curiosity.",
    cta: 'Open synastry',
  },
  es: {
    preview: 'Compara tu carta con alguien que amas — lectura de sinastría gratis.',
    heading: '¿Quieres ver tu compatibilidad?',
    body1:
      'Te hemos enviado tu carta sideral, tu Luna y Ascendente, un teaser del paywall y una nota semanal sobre Saturno. Aquí hay una más: la sinastría — la comparación entre dos cartas.',
    body2:
      'Agrega los datos de nacimiento de una pareja, amistad o familiar y Estrevia calculará tu lectura de sinastría gratis. Sin tarjeta, sin presión: pura curiosidad.',
    cta: 'Abrir sinastría',
  },
};

export default function SynastryTeaserEmail({
  locale,
  synastryUrl,
  unsubscribeUrl,
}: Props) {
  const t = STRINGS[locale];
  return (
    <EmailLayout preview={t.preview} locale={locale} unsubscribeUrl={unsubscribeUrl}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.body1}</Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>{t.body2}</Text>
      <Button href={synastryUrl}>{t.cta}</Button>
    </EmailLayout>
  );
}
