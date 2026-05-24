import { Heading, Text, Button } from '@react-email/components';
import { DunningEmailLayout } from './components/DunningEmailLayout';

interface Props {
  locale: 'en' | 'es';
  isHardDecline: boolean;
  billingPortalUrl?: string;
  settingsUrl: string;
}

const STRINGS = {
  en: {
    preview: "Your payment didn't go through — update your card to keep your access.",
    heading: "Your payment didn't go through",
    soft: 'This is usually a temporary issue. We\'ll retry your payment automatically.',
    hard: 'Your card was declined. Please add a new payment method to continue.',
    body: 'Update your payment method to keep your Estrevia Pro access and everything that comes with it: 240+ sidereal essays, synastry, AI tarot, and more.',
    cta: 'Update payment method',
    ctaFallback: 'Go to billing settings',
    closing: '— The Estrevia team',
  },
  es: {
    preview: 'Tu pago no se procesó — actualiza tu tarjeta para mantener tu acceso.',
    heading: 'Tu pago no se procesó',
    soft: 'Esto suele ser un problema temporal. Volveremos a intentar tu pago automáticamente.',
    hard: 'Tu tarjeta fue rechazada. Por favor, agrega un nuevo método de pago para continuar.',
    body: 'Actualiza tu método de pago para mantener tu acceso a Estrevia Pro: más de 240 ensayos siderales, sinastría, tarot con IA y mucho más.',
    cta: 'Actualizar método de pago',
    ctaFallback: 'Ir a configuración de facturación',
    closing: '— El equipo de Estrevia',
  },
};

export default function DunningAlertEmail({
  locale,
  isHardDecline,
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
        {isHardDecline ? t.hard : t.soft}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 1.6, color: '#3f3f46', marginBottom: 32 }}>
        {t.body}
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
