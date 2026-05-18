import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';
import { Button } from './components/Button';
import {
  getSignKeywords,
  type Locale,
  type SignKey,
} from '@/shared/lib/chart-keywords';

interface Props {
  locale: Locale;
  sunSign: string | null;
  moonSign: string | null;
  ascSign: string | null;
  chartUrl: string;
  unsubscribeUrl: string;
}

const HEADING = {
  en: 'Your sidereal mini-reading',
  es: 'Tu mini-lectura sideral',
};

const PREVIEW = {
  en: 'A short reading from your sidereal chart — Sun, Moon, and Ascendant.',
  es: 'Una lectura corta de tu carta sideral — Sol, Luna y Ascendente.',
};

const CTA = {
  en: 'See your full chart',
  es: 'Ver tu carta completa',
};

interface LineBuilder {
  prefix: string;
  middle: string;
  suffix: string;
}

const LINE_BUILDERS: Record<Locale, { sun: LineBuilder; moon: LineBuilder; asc: LineBuilder }> = {
  en: {
    sun: { prefix: 'Your Sun in ', middle: ' suggests ', suffix: '.' },
    moon: { prefix: 'Your Moon in ', middle: ' reveals ', suffix: '.' },
    asc: { prefix: 'Your Ascendant in ', middle: ' shapes how others see you: ', suffix: '.' },
  },
  es: {
    sun: { prefix: 'Tu Sol en ', middle: ' sugiere ', suffix: '.' },
    moon: { prefix: 'Tu Luna en ', middle: ' revela ', suffix: '.' },
    asc: { prefix: 'Tu Ascendente en ', middle: ' moldea cómo te ven los demás: ', suffix: '.' },
  },
};

function titleCase(sign: string): string {
  return sign.charAt(0).toUpperCase() + sign.slice(1);
}

function isKnownSign(sign: string | null): sign is SignKey {
  if (!sign) return false;
  const known: SignKey[] = [
    'aries', 'taurus', 'gemini', 'cancer',
    'leo', 'virgo', 'libra', 'scorpio',
    'sagittarius', 'capricorn', 'aquarius', 'pisces',
  ];
  return (known as string[]).includes(sign.toLowerCase());
}

function renderLine(
  locale: Locale,
  placement: 'sun' | 'moon' | 'asc',
  sign: string | null,
) {
  if (!isKnownSign(sign)) return null;
  const normalized = sign.toLowerCase() as SignKey;
  const builder = LINE_BUILDERS[locale][placement];
  const keyword = getSignKeywords(locale, normalized, placement);
  return (
    <Text key={placement} style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 12 }}>
      {builder.prefix}
      {titleCase(normalized)}
      {builder.middle}
      {keyword}
      {builder.suffix}
    </Text>
  );
}

export default function MiniReadingEmail({
  locale,
  sunSign,
  moonSign,
  ascSign,
  chartUrl,
  unsubscribeUrl,
}: Props) {
  const lines = [
    renderLine(locale, 'sun', sunSign),
    renderLine(locale, 'moon', moonSign),
    renderLine(locale, 'asc', ascSign),
  ].filter((x) => x !== null);

  return (
    <EmailLayout preview={PREVIEW[locale]} locale={locale} unsubscribeUrl={unsubscribeUrl}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{HEADING[locale]}</Heading>
      {lines}
      <div style={{ marginTop: 24 }}>
        <Button href={chartUrl}>{CTA[locale]}</Button>
      </div>
    </EmailLayout>
  );
}
