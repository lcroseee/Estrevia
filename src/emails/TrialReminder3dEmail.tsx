import { Heading, Text, Link } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  trialEndDate: Date;
  proUrl: string;
  billingPortalUrl: string;
}

// TODO i18n: ES strings are structural stubs (español neutro LATAM, tú form).
// Review with native speaker before enabling ES trial sends.
const STRINGS = {
  en: {
    preview: "Your sidereal chart is waiting — keep your readings by continuing with Pro.",
    heading: "Your trial ends in 3 days",
    intro: "You started your Estrevia Pro trial a few days ago, and your full sidereal chart has been calculated using the Lahiri ayanamsa — the same standard used by Vedic astrologers worldwide.",
    lossIntro: (date: string) =>
      `On ${date}, your trial ends. After that, you'll lose access to:`,
    features: [
      "Your complete AI chart reading (all 12 placements interpreted)",
      "Saturn Return window and Dasha timing analysis",
      "Unlimited synastry (compatibility readings)",
      "Full moon calendar with Void-of-Course windows",
      "AI tarot interpretation",
      "Personalized Tree of Life (Kabbalistic mapping)",
    ],
    outro:
      "Your base chart won't disappear — but the deep reading layer will be Pro-only. One click keeps everything.",
    cta: "Continue with Pro",
    secondaryLabel: "Want to manage or cancel?",
    secondaryLink: "Visit your account settings",
    closing: "— The Estrevia team",
  },
  es: {
    // TODO i18n: revisado por native speaker pendiente
    preview: "Tu carta sideral te espera — mantén tus lecturas continuando con Pro.",
    heading: "Tu prueba termina en 3 días",
    intro: "Hace unos días comenzaste tu prueba de Estrevia Pro y tu carta sideral completa fue calculada con el ayanamsa Lahiri.",
    lossIntro: (date: string) =>
      `El ${date}, tu prueba termina. Después de eso, perderás acceso a:`,
    features: [
      "Tu lectura completa de carta con IA (las 12 posiciones interpretadas)",
      "Análisis de Retorno de Saturno y ventanas de tiempo Dasha",
      "Sinastría ilimitada (lecturas de compatibilidad)",
      "Calendario lunar completo con ventanas Void-of-Course",
      "Interpretación de tarot con IA",
      "Árbol de la Vida personalizado (mapeo cabalístico)",
    ],
    outro:
      "Tu carta base no desaparecerá — pero la capa de lecturas profundas será solo para Pro. Un clic para conservar todo.",
    cta: "Continuar con Pro",
    secondaryLabel: "¿Quieres gestionar o cancelar?",
    secondaryLink: "Visita la configuración de tu cuenta",
    closing: "— El equipo de Estrevia",
  },
} as const;

function formatDate(date: Date, locale: 'en' | 'es'): string {
  const lang = locale === 'es' ? 'es-419' : 'en-US';
  return date.toLocaleDateString(lang, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function TrialReminder3dEmail({ locale, trialEndDate, proUrl, billingPortalUrl }: Props) {
  const t = STRINGS[locale];
  const formattedDate = formatDate(trialEndDate, locale);

  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 26, marginBottom: 16, color: 'rgba(255,255,255,0.95)' }}>
        {t.heading}
      </Heading>

      <Text style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16, color: 'rgba(255,255,255,0.85)' }}>
        {t.intro}
      </Text>

      <Text style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 12, color: 'rgba(255,255,255,0.85)' }}>
        {t.lossIntro(formattedDate)}
      </Text>

      <ul style={{ paddingLeft: 20, margin: '0 0 24px', color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.9 }}>
        {t.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <Text style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 28, color: 'rgba(255,255,255,0.85)' }}>
        {t.outro}
      </Text>

      <Button href={proUrl}>{t.cta}</Button>

      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 20 }}>
        {t.secondaryLabel}{' '}
        <Link href={billingPortalUrl} style={{ color: 'rgba(255,255,255,0.55)' }}>
          {t.secondaryLink}
        </Link>
      </Text>

      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 28 }}>
        {t.closing}
      </Text>
    </EmailLayout>
  );
}
