import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  saturnSign: string | null;
  checkoutClicks: number;
  ctaUrl: string;
  unsubscribeUrl: string;
}

const STRINGS = {
  en: {
    preview: 'Your Saturn return timing, Jupiter windows, and synastry — plus a 48h offer.',
    offerBadge: '48-hour offer',
    heading: 'You were one step away',
    checkoutMotivation: 'You even clicked to checkout — something made you pause. Here\'s a reason to finish.',
    saturnPersonalized: (sign: string) =>
      `Your Saturn is in ${sign}. Depending on your exact degree, you're entering, deep in, or past your Saturn return — one of the most defining 2–3 year windows in a life. The full reading shows you exactly where you stand.`,
    saturnGeneric:
      'Saturn-return timing. Your sidereal placement tells you whether you\'re entering, deep in, or past your Saturn return — one of the most defining 2–3 year windows in a life.',
    jupiterParagraph:
      'Jupiter expansion windows. Jupiter cycles through signs in ~12 years. Your next major opportunity window opens when it hits your natal Sun or Moon. The chart reading shows when that is.',
    synastryParagraph:
      'Synastry. Drop any birth data alongside yours — the AI reads the inter-chart aspects and tells you what actually drives the friction or flow between two charts.',
    synthesisParagraph:
      'The full synthesis. Sun + Moon + Ascendant + 8 outer planets + houses + top aspects, woven into one narrative written for your exact chart — not a generic horoscope.',
    bridge: 'You were one step away.',
    ctaText: 'Unlock Pro Annual — Save $7 (48h only)',
    expiryLine: 'This offer expires in 48 hours.',
    recoveryLine: 'After that, annual Pro remains $34.99/year — still far less than monthly.',
    trustLine: 'Cancel anytime. No hidden fees.',
  },
  es: {
    preview: 'Tu retorno de Saturno, ventanas de Júpiter y sinastría — más una oferta de 48h.',
    offerBadge: 'Oferta de 48 horas',
    heading: 'Estabas a un paso',
    checkoutMotivation: 'Incluso llegaste a la pantalla de pago — algo te hizo pausar. Aquí tienes una razón para terminar.',
    saturnPersonalized: (sign: string) =>
      `Tu Saturno está en ${sign}. Dependiendo de tu grado exacto, puedes estar entrando, en plena etapa o pasando tu retorno de Saturno — una de las ventanas más definitorias de 2–3 años en una vida. La lectura completa te muestra exactamente dónde estás.`,
    saturnGeneric:
      'Timing del retorno de Saturno. Tu posición sideral indica si estás entrando, en plena etapa o superando tu retorno de Saturno — una de las ventanas más definitorias de una vida.',
    jupiterParagraph:
      'Ventanas de expansión de Júpiter. Júpiter recorre los signos en ~12 años. Tu próxima ventana de gran oportunidad se abre cuando toca tu Sol o tu Luna natal. La lectura de la carta muestra cuándo ocurre.',
    synastryParagraph:
      'Sinastría. Ingresa cualquier dato de nacimiento junto al tuyo — la IA lee los aspectos entre cartas y te dice qué genera realmente la fricción o el flujo entre dos personas.',
    synthesisParagraph:
      'La síntesis completa. Sol + Luna + Ascendente + 8 planetas exteriores + casas + aspectos principales, tejidos en una narrativa escrita para tu carta exacta — no un horóscopo genérico.',
    bridge: 'Estabas a un paso.',
    ctaText: 'Desbloquea Pro Anual — Ahorra $7 (48h)',
    expiryLine: 'Esta oferta vence en 48 horas.',
    recoveryLine: 'Después, el plan anual sigue a $34.99/año — mucho menos que el mensual.',
    trustLine: 'Cancela cuando quieras. Sin cargos ocultos.',
  },
};

export default function CartAbandonEmail({
  locale,
  saturnSign,
  checkoutClicks,
  ctaUrl,
  unsubscribeUrl,
}: Props) {
  const t = STRINGS[locale];
  return (
    <EmailLayout preview={t.preview} locale={locale} unsubscribeUrl={unsubscribeUrl}>
      {/* Offer badge */}
      <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,215,0,0.7)', marginBottom: 8 }}>
        {t.offerBadge}
      </Text>

      {/* Heading */}
      <Heading style={{ fontSize: 24, marginBottom: 20 }}>
        {t.heading}
      </Heading>

      {/* Checkout motivation (only for high-intent leads who clicked checkout) */}
      {checkoutClicks > 0 && (
        <Text style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(255,215,0,0.85)', marginBottom: 20, fontStyle: 'italic' }}>
          {t.checkoutMotivation}
        </Text>
      )}

      {/* Saturn paragraph — personalized if we have the sign */}
      <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
        {saturnSign ? t.saturnPersonalized(saturnSign) : t.saturnGeneric}
      </Text>

      {/* Jupiter */}
      <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
        {t.jupiterParagraph}
      </Text>

      {/* Synastry */}
      <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
        {t.synastryParagraph}
      </Text>

      {/* Full synthesis */}
      <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
        {t.synthesisParagraph}
      </Text>

      {/* CTA */}
      <Button href={ctaUrl}>{t.ctaText}</Button>

      {/* Expiry + trust */}
      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 16, lineHeight: 1.5 }}>
        {t.expiryLine}
        {' '}
        {t.recoveryLine}
      </Text>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
        {t.trustLine}
      </Text>
    </EmailLayout>
  );
}
