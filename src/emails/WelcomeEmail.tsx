import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  hasSavedChart: boolean;
}

const SITE_URL = 'https://estrevia.app';

const STRINGS = {
  en: {
    preview: 'Your sidereal chart awaits — Estrevia uses Lahiri, the system aligned with the actual sky.',
    heading: 'Welcome to Estrevia',
    body1Saved: 'Your natal chart is ready. Open it to see your sidereal Sun, Moon, and rising sign with Lahiri ayanamsa interpretations.',
    body1New: 'Estrevia uses Lahiri sidereal — the system that aligns with the actual sky, not the calendar. Create your first chart in 30 seconds.',
    cta: (saved: boolean) => (saved ? 'Open your chart' : 'Create your first chart'),
    body2: 'Curious why sidereal? Read the comparison: ',
    essayLink: 'sidereal vs tropical',
  },
  es: {
    preview: 'Tu carta sideral te espera — Estrevia usa Lahiri, el sistema alineado con el cielo real.',
    heading: 'Bienvenido a Estrevia',
    body1Saved: 'Tu carta natal está lista. Ábrela para ver tu Sol, Luna y ascendente siderales con interpretaciones del ayanamsa Lahiri.',
    body1New: 'Estrevia usa el sistema sideral Lahiri — el que se alinea con el cielo real, no con el calendario. Crea tu primera carta en 30 segundos.',
    cta: (saved: boolean) => (saved ? 'Abre tu carta' : 'Crea tu primera carta'),
    body2: '¿Por qué sideral? Lee la comparación: ',
    essayLink: 'sideral vs tropical',
  },
};

export default function WelcomeEmail({ locale, hasSavedChart }: Props) {
  const t = STRINGS[locale];
  const ctaUrl = hasSavedChart
    ? `${SITE_URL}/${locale === 'es' ? 'es/' : ''}chart`
    : `${SITE_URL}/${locale === 'es' ? 'es' : ''}`;
  const essayUrl = `${SITE_URL}/${locale === 'es' ? 'es/' : ''}essays/sidereal-vs-tropical`;
  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>
        {hasSavedChart ? t.body1Saved : t.body1New}
      </Text>
      <Button href={ctaUrl}>{t.cta(hasSavedChart)}</Button>
      <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 32 }}>
        {t.body2}<a href={essayUrl} style={{ color: '#FFD700' }}>{t.essayLink}</a>.
      </Text>
    </EmailLayout>
  );
}
