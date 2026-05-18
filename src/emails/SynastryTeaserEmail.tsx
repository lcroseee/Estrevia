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
      "Synastry is what we have not yet shown you — the chart comparison between two people. It's the oldest use of astrology, the one you actually do with friends: comparing where your Mars sits next to theirs, where your Moons echo or argue.",
    body2:
      "Add a partner, friend, or family member's birth data and Estrevia will calculate the synastry free. No card, no nudge: just one more pattern to look at.",
    cta: 'Open synastry',
  },
  es: {
    preview: 'Compara tu carta con alguien que amas — lectura de sinastría gratis.',
    heading: '¿Quieres ver tu compatibilidad?',
    body1:
      'La sinastría es lo que aún no te hemos mostrado — la comparación entre dos cartas. Es el uso más antiguo de la astrología, el que de hecho haces con tus amistades: ver dónde tu Marte queda junto al suyo, dónde tus Lunas se hacen eco o discuten.',
    body2:
      'Agrega los datos de nacimiento de una pareja, amistad o familiar y Estrevia calculará la sinastría gratis. Sin tarjeta, sin presión: solo un patrón más para observar.',
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
