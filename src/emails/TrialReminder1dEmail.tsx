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
    preview: "Your chart readings lock tomorrow — one click to keep them.",
    heading: "Last day of your trial",
    body1: (timeAndDate: string) =>
      `Tomorrow — ${timeAndDate} — your Estrevia Pro trial ends.`,
    body2:
      "After that, your access to the full chart reading, Saturn timing, synastry, and tarot interpretation will be restricted. Your base chart stays free — the interpretation layer goes Pro-only.",
    body3:
      "If you've been finding value in the readings, now is the moment to continue. If you'd rather not subscribe right now, you can pause or cancel anytime from your account settings — no pressure.",
    cta: "Keep Pro access",
    secondaryLabel: "Need to manage your subscription?",
    secondaryLink: "Account settings",
    closing: "— The Estrevia team",
  },
  es: {
    // TODO i18n: revisado por native speaker pendiente
    preview: "Tus lecturas de carta se bloquean mañana — un clic para conservarlas.",
    heading: "Último día de tu prueba",
    body1: (timeAndDate: string) =>
      `Mañana — ${timeAndDate} — termina tu prueba de Estrevia Pro.`,
    body2:
      "Después de eso, tu acceso a la lectura completa de carta, el timing de Saturno, la sinastría y la interpretación de tarot estará restringido. Tu carta base sigue siendo gratuita — la capa de interpretación es solo Pro.",
    body3:
      "Si has encontrado valor en las lecturas, este es el momento de continuar. Si prefieres no suscribirte ahora, puedes pausar o cancelar en cualquier momento desde la configuración de tu cuenta — sin presión.",
    cta: "Conservar acceso Pro",
    secondaryLabel: "¿Necesitas gestionar tu suscripción?",
    secondaryLink: "Configuración de cuenta",
    closing: "— El equipo de Estrevia",
  },
} as const;

function formatDateTime(date: Date, locale: 'en' | 'es'): string {
  const lang = locale === 'es' ? 'es-419' : 'en-US';
  return date.toLocaleString(lang, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export default function TrialReminder1dEmail({ locale, trialEndDate, proUrl, billingPortalUrl }: Props) {
  const t = STRINGS[locale];
  const formattedDateTime = formatDateTime(trialEndDate, locale);

  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 26, marginBottom: 16, color: 'rgba(255,255,255,0.95)' }}>
        {t.heading}
      </Heading>

      <Text style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16, color: 'rgba(255,255,255,0.9)' }}>
        {t.body1(formattedDateTime)}
      </Text>

      <Text style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16, color: 'rgba(255,255,255,0.85)' }}>
        {t.body2}
      </Text>

      <Text style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 28, color: 'rgba(255,255,255,0.85)' }}>
        {t.body3}
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
