import { Heading, Text, Button } from '@react-email/components';
import { DunningEmailLayout } from './components/DunningEmailLayout';

interface Props {
  locale: 'en' | 'es';
  settingsUrl: string;
}

const SUPPORT_EMAIL = 'hello@estrevia.app';

const STRINGS = {
  en: {
    preview: "Last chance — keep Estrevia Pro at 20% off for 2 months.",
    heading: 'Last chance to keep your Pro access',
    body1: "This is our final attempt to reach you. We haven't been able to process your payment, and your Estrevia Pro access will be downgraded unless we hear from you.",
    offerHeading: 'A special offer for you:',
    offer: 'Reply to this email with the subject "20% off" and we\'ll apply a 20% discount to your next 2 months — no strings attached. This offer expires in 48 hours.',
    body2: "If you'd like to update your payment method instead, you can do that from your settings.",
    cta: 'Go to billing settings',
    replySubject: 'Reply to apply discount',
    closing: '— The Estrevia team',
  },
  es: {
    preview: 'Última oportunidad — mantén Estrevia Pro con 20% de descuento por 2 meses.',
    heading: 'Última oportunidad para mantener tu acceso Pro',
    body1: 'Este es nuestro último intento de contactarte. No hemos podido procesar tu pago y tu acceso a Estrevia Pro será degradado a menos que nos contactes.',
    offerHeading: 'Una oferta especial para ti:',
    offer: 'Responde este correo con el asunto "20% descuento" y aplicaremos un 20% de descuento en tus próximos 2 meses, sin condiciones. Esta oferta expira en 48 horas.',
    body2: 'Si prefieres actualizar tu método de pago, puedes hacerlo desde tu configuración.',
    cta: 'Ir a configuración de facturación',
    replySubject: 'Responder para aplicar descuento',
    closing: '— El equipo de Estrevia',
  },
};

export default function DunningFinalEmail({ locale, settingsUrl }: Props) {
  const t = STRINGS[locale];

  return (
    <DunningEmailLayout preview={t.preview} locale={locale} settingsUrl={settingsUrl}>
      <Heading
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: '#1a1a2e',
          marginBottom: 16,
        }}
      >
        {t.heading}
      </Heading>
      <Text style={{ fontSize: 15, lineHeight: 1.6, color: '#3f3f46', marginBottom: 24 }}>
        {t.body1}
      </Text>

      {/* Save offer box */}
      <div
        style={{
          background: '#fef9c3',
          border: '1px solid #fde047',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 24,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#713f12',
            marginBottom: 8,
            marginTop: 0,
          }}
        >
          {t.offerHeading}
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 1.6, color: '#713f12', margin: 0 }}>
          {t.offer}
        </Text>
      </div>

      <Text style={{ fontSize: 15, lineHeight: 1.6, color: '#3f3f46', marginBottom: 32 }}>
        {t.body2}
      </Text>

      <Button
        href={settingsUrl}
        style={{
          background: '#1a1a2e',
          color: '#ffffff',
          padding: '14px 28px',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 15,
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 16,
        }}
      >
        {t.cta}
      </Button>

      {/* Reply CTA as a secondary link */}
      <Text style={{ fontSize: 14, color: '#3f3f46', marginTop: 8, marginBottom: 0 }}>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=20%25 off`}
          style={{ color: '#1a1a2e', fontWeight: 600 }}
        >
          {t.replySubject} →
        </a>
      </Text>

      <Text style={{ fontSize: 13, color: '#a1a1aa', marginTop: 40 }}>{t.closing}</Text>
    </DunningEmailLayout>
  );
}
