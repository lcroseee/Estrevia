import { Heading, Text, Button } from '@react-email/components';
import { DunningEmailLayout } from './components/DunningEmailLayout';

interface Props {
  locale: 'en' | 'es';
  billingPortalUrl?: string;
  settingsUrl: string;
}

const STRINGS = {
  en: {
    preview: "Reminder: your Estrevia Pro payment still needs attention.",
    heading: 'Just a reminder about your payment',
    body1: "We tried your payment again, but it didn't go through. Your Pro access is still active for now — but we need a valid payment method to keep it that way.",
    featuresHeading: "What you keep with Pro:",
    features: [
      '240+ sidereal astrology essays',
      'Full moon calendar with Void-of-Course',
      'Unlimited synastry (compatibility)',
      'AI tarot interpretation',
    ],
    body2: 'It only takes a moment to update. If you have questions, reply to this email.',
    cta: 'Update payment method',
    ctaFallback: 'Go to billing settings',
    support: 'Need help? hello@estrevia.app',
    closing: '— The Estrevia team',
  },
  es: {
    preview: 'Recordatorio: tu pago de Estrevia Pro aún necesita atención.',
    heading: 'Solo un recordatorio sobre tu pago',
    body1: 'Intentamos procesar tu pago nuevamente, pero no fue posible. Tu acceso Pro sigue activo por ahora, pero necesitamos un método de pago válido para mantenerlo.',
    featuresHeading: 'Lo que mantienes con Pro:',
    features: [
      'Más de 240 ensayos de astrología sideral',
      'Calendario lunar completo con Void-of-Course',
      'Sinastría ilimitada (compatibilidad)',
      'Interpretación de tarot con IA',
    ],
    body2: 'Solo toma un momento actualizarlo. Si tienes preguntas, responde este correo.',
    cta: 'Actualizar método de pago',
    ctaFallback: 'Ir a configuración de facturación',
    support: '¿Necesitas ayuda? hello@estrevia.app',
    closing: '— El equipo de Estrevia',
  },
};

export default function DunningReminderEmail({
  locale,
  billingPortalUrl,
  settingsUrl,
}: Props) {
  const t = STRINGS[locale];
  const ctaUrl = billingPortalUrl ?? settingsUrl;
  const ctaLabel = billingPortalUrl ? t.cta : t.ctaFallback;

  return (
    <DunningEmailLayout preview={t.preview} locale={locale} settingsUrl={settingsUrl}>
      <Heading style={{ fontSize: 24, fontWeight: 600, color: '#1a1a2e', marginBottom: 16 }}>
        {t.heading}
      </Heading>
      <Text style={{ fontSize: 15, lineHeight: 1.6, color: '#3f3f46', marginBottom: 16 }}>
        {t.body1}
      </Text>
      <Text
        style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}
      >
        {t.featuresHeading}
      </Text>
      <ul
        style={{
          paddingLeft: 20,
          margin: '0 0 24px',
          color: '#52525b',
          fontSize: 14,
          lineHeight: 1.8,
        }}
      >
        {t.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <Text style={{ fontSize: 15, lineHeight: 1.6, color: '#3f3f46', marginBottom: 32 }}>
        {t.body2}
      </Text>
      <Button
        href={ctaUrl}
        style={{
          background: '#1a1a2e',
          color: '#ffffff',
          padding: '14px 28px',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 15,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        {ctaLabel}
      </Button>
      <Text style={{ fontSize: 13, color: '#a1a1aa', marginTop: 40 }}>{t.closing}</Text>
    </DunningEmailLayout>
  );
}
