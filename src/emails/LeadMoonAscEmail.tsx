import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';

interface Props {
  locale: 'en' | 'es';
  moonSign: string | null;
  ascSign: string | null;
  signupUrl: string;
}

const MOON_INSIGHTS_EN: Record<string, string> = {
  Aries: 'reacts in flashes — momentum carries more than reflection',
  Taurus: 'needs grounded comfort — change feels like loss of footing',
  Gemini: 'cycles through moods like channels — naming each one steadies them',
  Cancer: 'absorbs other people\'s weather and calls it your own',
  Leo: 'wants to be seen at full brightness — privacy feels like dimming',
  Virgo: 'soothes through ordering, listing, sorting — chaos is grief',
  Libra: 'balances by mirroring — easy to lose your own mood inside theirs',
  Scorpio: 'feels in undertows; surface calm masks tidal depth',
  Sagittarius: 'restless without a horizon to project against',
  Capricorn: 'metabolizes feeling through structure and discipline',
  Aquarius: 'observes feeling from a slight distance, even your own',
  Pisces: 'permeable to atmospheres — needs the right water to swim in',
};

const ASC_INSIGHTS_EN: Record<string, string> = {
  Aries: 'people clock you as direct, sometimes before you speak',
  Taurus: 'you read as steady, slower-to-warm, worth the wait',
  Gemini: 'first impression: quick, curious, hard to pin down',
  Cancer: 'protective shell first; soft interior reserved for trust',
  Leo: 'you arrive in a room; absence is noticed',
  Virgo: 'crisp, observant, slightly evaluating',
  Libra: 'pleasant default; conflict-avoidant by reflex',
  Scorpio: 'you read as composed; people sense the held depth',
  Sagittarius: 'open posture, signals broad interests early',
  Capricorn: 'you read as older than you are — competence telegraphed',
  Aquarius: 'friendly but slightly elsewhere; angle of detachment',
  Pisces: 'soft edges; people project what they need onto you',
};

const MOON_INSIGHTS_ES: Record<string, string> = {
  Aries: 'reacciona en destellos — el momentum pesa más que la reflexión',
  Taurus: 'necesita comodidad firme — el cambio se siente como perder el suelo',
  Gemini: 'cicla entre estados como canales — nombrarlos los estabiliza',
  Cancer: 'absorbe el clima emocional de otros y lo llama propio',
  Leo: 'quiere ser visto con brillo completo — la privacidad se siente como bajar la luz',
  Virgo: 'se calma ordenando, listando — el caos es duelo',
  Libra: 'equilibra reflejando — fácil perder tu propio ánimo en el de ellos',
  Scorpio: 'siente en corrientes profundas; calma superficial enmascara mareas',
  Sagittarius: 'inquieto sin un horizonte para proyectarse',
  Capricorn: 'metaboliza el sentir a través de estructura y disciplina',
  Aquarius: 'observa el sentir desde cierta distancia, incluso el propio',
  Pisces: 'permeable a atmósferas — necesita el agua correcta para nadar',
};

const ASC_INSIGHTS_ES: Record<string, string> = {
  Aries: 'la gente te lee como directo, a veces antes de que hables',
  Taurus: 'te lees como estable, lento al calor, vale la espera',
  Gemini: 'primera impresión: rápido, curioso, difícil de fijar',
  Cancer: 'caparazón protector primero; interior suave reservado a la confianza',
  Leo: 'llegas a una sala; tu ausencia se nota',
  Virgo: 'nítido, observador, ligeramente evaluador',
  Libra: 'amable por defecto; evita el conflicto por reflejo',
  Scorpio: 'te lees como compuesto; la gente percibe la profundidad contenida',
  Sagittarius: 'postura abierta, señala intereses amplios temprano',
  Capricorn: 'te lees mayor de lo que eres — competencia telegrafiada',
  Aquarius: 'amistoso pero ligeramente en otra parte; ángulo de distancia',
  Pisces: 'bordes suaves; la gente proyecta sobre ti lo que necesita',
};

const STRINGS = {
  en: {
    preview: 'Your Moon shapes how you feel; your Ascendant shapes how you arrive.',
    heading: (moon: string | null) =>
      moon ? `Your Moon in ${moon}` : 'Your sidereal Moon',
    moonLead: 'Your Moon sign is where your emotional life actually lives — not your performed self.',
    ascLead: 'Your Ascendant is the angle the world meets you at — the first impression you can\'t pick.',
    cta: 'Save your chart — create free account',
    fallback: 'Sign up to save your chart and track Moon and Ascendant changes over time.',
  },
  es: {
    preview: 'Tu Luna moldea cómo sientes; tu Ascendente, cómo llegas.',
    heading: (moon: string | null) =>
      moon ? `Tu Luna en ${moon}` : 'Tu Luna sideral',
    moonLead: 'Tu signo lunar es donde tu vida emocional realmente vive — no tu yo performativo.',
    ascLead: 'Tu Ascendente es el ángulo con el que el mundo te encuentra — la primera impresión que no eliges.',
    cta: 'Guarda tu carta — crea cuenta gratis',
    fallback: 'Crea una cuenta para guardar tu carta y seguir cambios de Luna y Ascendente con el tiempo.',
  },
};

export default function LeadMoonAscEmail({ locale, moonSign, ascSign, signupUrl }: Props) {
  const t = STRINGS[locale];
  const moonInsight = moonSign
    ? (locale === 'en' ? MOON_INSIGHTS_EN[moonSign] : MOON_INSIGHTS_ES[moonSign])
    : null;
  const ascInsight = ascSign
    ? (locale === 'en' ? ASC_INSIGHTS_EN[ascSign] : ASC_INSIGHTS_ES[ascSign])
    : null;

  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 26, marginBottom: 16 }}>{t.heading(moonSign)}</Heading>

      {moonInsight ? (
        <>
          <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>{t.moonLead}</Text>
          <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            <strong>{moonSign}:</strong> {moonInsight}
          </Text>
          {ascInsight && (
            <>
              <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>{t.ascLead}</Text>
              <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
                <strong>{ascSign}:</strong> {ascInsight}
              </Text>
            </>
          )}
        </>
      ) : (
        <Text style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>{t.fallback}</Text>
      )}

      <Button href={signupUrl}>{t.cta}</Button>
    </EmailLayout>
  );
}
