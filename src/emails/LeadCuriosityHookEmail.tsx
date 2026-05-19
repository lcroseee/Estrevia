import { Heading, Text } from '@react-email/components';
import type { Planet, Sign } from '@/shared/types';
import { PLANET_ES_NAMES } from '@/shared/lib/planet-i18n';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  planet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury';
  signName: string;
  chartUrl: string;
}

// Sign-level interpretations per planet (12 signs × 4 planets × 2 locales = 96 keys).
// Copy intentionally short (1 line) — full depth lives behind the paywall.
// Fallback: if sign not in map, generic copy is used.
const REVEAL_EN: Partial<Record<Planet, Partial<Record<Sign, string>>>> = {
  Saturn: {
    Capricorn: 'Saturn in Capricorn — discipline as your spine.',
    Aquarius: 'Saturn in Aquarius — your future arrives ahead of you.',
    Aries: 'Saturn in Aries — patience forged through impatience.',
    Taurus: 'Saturn in Taurus — slow weight that becomes foundation.',
    Gemini: 'Saturn in Gemini — your mind sharpened by limit.',
    Cancer: 'Saturn in Cancer — walls around water.',
    Leo: 'Saturn in Leo — authority you have to earn twice.',
    Virgo: 'Saturn in Virgo — perfectionism as protection.',
    Libra: 'Saturn in Libra — fairness as a discipline, not a feeling.',
    Scorpio: 'Saturn in Scorpio — depth that survives what burns.',
    Sagittarius: 'Saturn in Sagittarius — belief tested into wisdom.',
    Pisces: 'Saturn in Pisces — structure built on dreams.',
  },
  Mars: {
    Aries: 'Mars in Aries — pure ignition, no hesitation.',
    Scorpio: 'Mars in Scorpio — fury that holds its shape.',
    Taurus: 'Mars in Taurus — force you can lean on.',
    Gemini: 'Mars in Gemini — argument as armor.',
    Cancer: 'Mars in Cancer — protectiveness as warfare.',
    Leo: 'Mars in Leo — pride that wields you.',
    Virgo: 'Mars in Virgo — precision under heat.',
    Libra: 'Mars in Libra — diplomacy as a weapon.',
    Sagittarius: 'Mars in Sagittarius — conviction as motor.',
    Capricorn: 'Mars in Capricorn — patience that wins.',
    Aquarius: 'Mars in Aquarius — rebellion with a blueprint.',
    Pisces: 'Mars in Pisces — current you have to swim with.',
  },
  Venus: {
    Taurus: 'Venus in Taurus — beauty made tangible.',
    Libra: 'Venus in Libra — harmony as your magnetic north.',
    Aries: 'Venus in Aries — desire that does not wait.',
    Gemini: 'Venus in Gemini — affection through conversation.',
    Cancer: 'Venus in Cancer — love that remembers.',
    Leo: 'Venus in Leo — heart on full display.',
    Virgo: 'Venus in Virgo — care through small attentions.',
    Scorpio: 'Venus in Scorpio — intimacy or nothing.',
    Sagittarius: 'Venus in Sagittarius — love as a horizon.',
    Capricorn: 'Venus in Capricorn — affection earned.',
    Aquarius: 'Venus in Aquarius — friendship as romance.',
    Pisces: 'Venus in Pisces — devotion without edges.',
  },
  Mercury: {
    Gemini: 'Mercury in Gemini — your mind moves at the speed of curiosity.',
    Virgo: 'Mercury in Virgo — thought as instrument.',
    Aries: 'Mercury in Aries — quick conclusions, quicker tongue.',
    Taurus: 'Mercury in Taurus — slow ideas with deep roots.',
    Cancer: 'Mercury in Cancer — memory shapes your reasoning.',
    Leo: 'Mercury in Leo — speech as performance.',
    Libra: 'Mercury in Libra — balance in every sentence.',
    Scorpio: 'Mercury in Scorpio — investigation as instinct.',
    Sagittarius: 'Mercury in Sagittarius — your mind reaches past the visible.',
    Capricorn: 'Mercury in Capricorn — language built to last.',
    Aquarius: 'Mercury in Aquarius — pattern-seeing as your default mode.',
    Pisces: 'Mercury in Pisces — knowing without explaining.',
  },
};

const REVEAL_ES: Partial<Record<Planet, Partial<Record<Sign, string>>>> = {
  Saturn: {
    Capricorn: 'Saturno en Capricornio — la disciplina como columna vertebral.',
    Aquarius: 'Saturno en Acuario — tu futuro llega antes que tú.',
    Aries: 'Saturno en Aries — paciencia forjada en la impaciencia.',
    Taurus: 'Saturno en Tauro — peso lento que se vuelve cimiento.',
    Gemini: 'Saturno en Géminis — tu mente afilada por el límite.',
    Cancer: 'Saturno en Cáncer — muros alrededor del agua.',
    Leo: 'Saturno en Leo — autoridad que tienes que ganar dos veces.',
    Virgo: 'Saturno en Virgo — el perfeccionismo como protección.',
    Libra: 'Saturno en Libra — la justicia como disciplina, no como sentimiento.',
    Scorpio: 'Saturno en Escorpio — profundidad que sobrevive lo que arde.',
    Sagittarius: 'Saturno en Sagitario — la creencia probada hasta volverse sabiduría.',
    Pisces: 'Saturno en Piscis — estructura construida sobre sueños.',
  },
  Mars: {
    Aries: 'Marte en Aries — ignición pura, sin titubeos.',
    Scorpio: 'Marte en Escorpio — furia que mantiene su forma.',
    Taurus: 'Marte en Tauro — fuerza en la que puedes apoyarte.',
    Gemini: 'Marte en Géminis — el argumento como armadura.',
    Cancer: 'Marte en Cáncer — la protección como guerra.',
    Leo: 'Marte en Leo — el orgullo que te empuña.',
    Virgo: 'Marte en Virgo — precisión bajo presión.',
    Libra: 'Marte en Libra — la diplomacia como arma.',
    Sagittarius: 'Marte en Sagitario — la convicción como motor.',
    Capricorn: 'Marte en Capricornio — la paciencia que gana.',
    Aquarius: 'Marte en Acuario — rebelión con planos.',
    Pisces: 'Marte en Piscis — corriente con la que tienes que nadar.',
  },
  Venus: {
    Taurus: 'Venus en Tauro — belleza hecha tangible.',
    Libra: 'Venus en Libra — la armonía como tu norte magnético.',
    Aries: 'Venus en Aries — el deseo que no espera.',
    Gemini: 'Venus en Géminis — afecto a través de la conversación.',
    Cancer: 'Venus en Cáncer — amor que recuerda.',
    Leo: 'Venus en Leo — el corazón completamente expuesto.',
    Virgo: 'Venus en Virgo — cuidado a través de pequeñas atenciones.',
    Scorpio: 'Venus en Escorpio — intimidad o nada.',
    Sagittarius: 'Venus en Sagitario — el amor como horizonte.',
    Capricorn: 'Venus en Capricornio — afecto que se gana.',
    Aquarius: 'Venus en Acuario — la amistad como romance.',
    Pisces: 'Venus en Piscis — devoción sin bordes.',
  },
  Mercury: {
    Gemini: 'Mercurio en Géminis — tu mente se mueve a la velocidad de la curiosidad.',
    Virgo: 'Mercurio en Virgo — pensamiento como instrumento.',
    Aries: 'Mercurio en Aries — conclusiones rápidas, lengua aún más rápida.',
    Taurus: 'Mercurio en Tauro — ideas lentas con raíces profundas.',
    Cancer: 'Mercurio en Cáncer — la memoria moldea tu razón.',
    Leo: 'Mercurio en Leo — el habla como puesta en escena.',
    Libra: 'Mercurio en Libra — equilibrio en cada frase.',
    Scorpio: 'Mercurio en Escorpio — la investigación como instinto.',
    Sagittarius: 'Mercurio en Sagitario — tu mente alcanza más allá de lo visible.',
    Capricorn: 'Mercurio en Capricornio — lenguaje construido para durar.',
    Aquarius: 'Mercurio en Acuario — ver patrones como modo por defecto.',
    Pisces: 'Mercurio en Piscis — saber sin explicar.',
  },
};

const STRINGS = {
  en: {
    preview: (planet: string) => `Your ${planet} is doing something most charts don't.`,
    heading: (planet: string) => `Your ${planet} is rare`,
    intro: 'Most astrology stops at Sun-Moon-Rising. Estrevia reads the layer beneath — Lahiri sidereal placements, dignity, and house tone.',
    revealFallback: (planet: string, sign: string) => `Your ${planet} is in ${sign} — a placement that shapes how you operate beneath the visible.`,
    depthPitch: 'The full reading uses Thelemic correspondences and the 777 lattice — the system your chart actually responds to, not the diluted version most apps use.',
    cta: 'Unlock your full reading',
    trialNote: '3-day free trial. Cancel anytime.',
  },
  es: {
    preview: (planet: string) => `Tu ${PLANET_ES_NAMES[planet as 'Saturn' | 'Mars' | 'Venus' | 'Mercury'] ?? planet} está haciendo algo que la mayoría de las cartas no hace.`,
    heading: (planet: string) => `Tu ${PLANET_ES_NAMES[planet as 'Saturn' | 'Mars' | 'Venus' | 'Mercury'] ?? planet} es poco común`,
    intro: 'La mayoría de la astrología se queda en Sol-Luna-Ascendente. Estrevia lee la capa de abajo — posiciones siderales Lahiri, dignidad, y tono de las casas.',
    revealFallback: (planet: string, sign: string) => `Tu ${PLANET_ES_NAMES[planet as 'Saturn' | 'Mars' | 'Venus' | 'Mercury'] ?? planet} está en ${sign} — una posición que moldea cómo operas bajo lo visible.`,
    depthPitch: 'La lectura completa usa correspondencias de Thelema y la red 777 — el sistema al que tu carta realmente responde, no la versión diluida que la mayoría de apps usa.',
    cta: 'Desbloquea tu lectura completa',
    trialNote: '3 días de prueba gratis. Cancela cuando quieras.',
  },
};

export default function LeadCuriosityHookEmail({ locale, planet, signName, chartUrl }: Props) {
  const t = STRINGS[locale];
  const revealMap = locale === 'es' ? REVEAL_ES : REVEAL_EN;
  const revealLine = revealMap[planet as Planet]?.[signName as Sign] ?? t.revealFallback(planet, signName);

  return (
    <EmailLayout preview={t.preview(planet)} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading(planet)}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 20 }}>{t.intro}</Text>
      <Text style={{ fontSize: 17, lineHeight: 1.6, marginBottom: 24, fontWeight: 500 }}>
        {revealLine}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 28, color: '#9CA3AF' }}>
        {t.depthPitch}
      </Text>
      <Button href={chartUrl}>{t.cta}</Button>
      <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 16, textAlign: 'center' }}>
        {t.trialNote}
      </Text>
    </EmailLayout>
  );
}
