/**
 * DiscountLaunchEmail — one-off promotional blast for the HALF50 launch-week offer.
 *
 * 50% off the first charge after the free 3-day trial, valid for 7 days, both
 * plans. Framed as a continuation of the user's reading value (not a generic
 * "SALE") to stay inside the chart-calculation soft-opt-in consent basis and
 * avoid spam-filter tone shift on a transactional-only sending domain.
 *
 * The coupon is carried by `trialUrl` (built by the send script with
 * &coupon=HALF50). `unsubscribeUrl` drives the one-click List-Unsubscribe footer.
 */
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  /** /checkout/start URL with plan + &coupon=HALF50 already appended */
  trialUrl: string;
  /** One-click unsubscribe URL (RFC 8058) — required for marketing footer */
  unsubscribeUrl: string;
}

const STRINGS = {
  en: {
    preview: 'Your sidereal reading is ready — 50% off your first month, this week only.',
    eyebrow: 'Launch week · 7 days only',
    heading: 'Your full sidereal reading — now 50% off',
    body: 'You calculated your chart with us, but the full reading is still waiting: your Sun, Moon, Ascendant, all 8 outer planets, the houses, and your tightest aspects — woven into one personal synthesis for your exact chart.',
    offer: 'For the next 7 days, claim 50% off your first month or year of Star.',
    disclaimer:
      'The 50% discount applies to your first charge after the free 3-day trial. Cancel anytime before then and you pay nothing.',
    cta: 'Claim 50% off — start free trial',
    trustLine: 'Cancel anytime. No charge until your trial ends.',
  },
  es: {
    preview: 'Tu lectura sideral está lista — 50% de descuento en tu primer mes, solo esta semana.',
    eyebrow: 'Semana de lanzamiento · solo 7 días',
    heading: 'Tu lectura sideral completa — ahora con 50% de descuento',
    body: 'Calculaste tu carta con nosotros, pero la lectura completa sigue esperándote: tu Sol, Luna, Ascendente, los 8 planetas exteriores, las casas y tus aspectos más cerrados — tejidos en una síntesis personal para tu carta exacta.',
    offer: 'Por los próximos 7 días, reclama 50% de descuento en tu primer mes o año de Star.',
    disclaimer:
      'El 50% de descuento aplica a tu primer cobro después de la prueba gratis de 3 días. Cancela antes y no pagas nada.',
    cta: 'Reclamar 50% off — iniciar prueba gratis',
    trustLine: 'Cancela cuando quieras. Sin cobro hasta que termine la prueba.',
  },
};

export default function DiscountLaunchEmail({ locale, trialUrl, unsubscribeUrl }: Props) {
  const t = STRINGS[locale];

  return (
    <EmailLayout preview={t.preview} locale={locale} unsubscribeUrl={unsubscribeUrl}>
      <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,215,0,0.6)', marginBottom: 8 }}>
        {t.eyebrow}
      </Text>
      <Heading style={{ fontSize: 24, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>{t.body}</Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: 'rgba(255,215,0,0.9)',
          fontWeight: 600,
          marginBottom: 16,
          padding: '12px 16px',
          backgroundColor: 'rgba(255,215,0,0.08)',
          borderLeft: '2px solid rgba(255,215,0,0.4)',
        }}
      >
        {t.offer}
      </Text>
      <Button href={trialUrl}>{t.cta}</Button>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 16 }}>{t.trustLine}</Text>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginTop: 12 }}>
        {t.disclaimer}
      </Text>
    </EmailLayout>
  );
}
