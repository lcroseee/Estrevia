import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { createMetadata, articleSchema, breadcrumbSchema, faqSchema, JsonLdScript, SITE_URL } from '@/shared/seo';
import { ALL_PAIR_SLUGS, parsePairSlug } from '@/shared/seo/compatibility-pairs';
import { localizeElement, localizeModality } from '@/shared/lib/astro-i18n';
import { getReadyEnrichedPairContent } from '@/shared/seo/compatibility-content';
import { Link } from '@/i18n/navigation';
import enSigns from '../../../../../../content/signs/descriptions.json';
import esSigns from '../../../../../../content/signs/descriptions.es.json';

interface PageProps {
  params: Promise<{ locale: 'en' | 'es'; pair: string }>;
}

interface SignRow {
  sign: string;
  slug: string;
  element: string;
  modality: string;
  ruler: string;
  symbol: string;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return ALL_PAIR_SLUGS.map((pair) => ({ pair }));
}

function findSign(rows: SignRow[], slug: string): SignRow | undefined {
  return rows.find((r) => r.slug === slug);
}

type ElementName = 'Fire' | 'Earth' | 'Air' | 'Water';
type ModalityName = 'Cardinal' | 'Fixed' | 'Mutable';

function elementCompatibility(e1: ElementName, e2: ElementName, locale: 'en' | 'es'): string {
  const same = e1 === e2;
  const pair = `${e1}-${e2}`;
  const pairs: Record<string, { en: string; es: string }> = {
    'Fire-Air':    { en: 'Harmonious (Fire feeds on Air).', es: 'Armónica (el Fuego se alimenta del Aire).' },
    'Air-Fire':    { en: 'Harmonious (Fire feeds on Air).', es: 'Armónica (el Fuego se alimenta del Aire).' },
    'Earth-Water': { en: 'Harmonious (Water nourishes Earth).', es: 'Armónica (el Agua nutre la Tierra).' },
    'Water-Earth': { en: 'Harmonious (Water nourishes Earth).', es: 'Armónica (el Agua nutre la Tierra).' },
    'Fire-Earth':  { en: 'Challenging (Fire scorches Earth).', es: 'Desafiante (el Fuego quema la Tierra).' },
    'Earth-Fire':  { en: 'Challenging (Fire scorches Earth).', es: 'Desafiante (el Fuego quema la Tierra).' },
    'Fire-Water':  { en: 'Clashing (Water extinguishes Fire).', es: 'Conflictiva (el Agua apaga el Fuego).' },
    'Water-Fire':  { en: 'Clashing (Water extinguishes Fire).', es: 'Conflictiva (el Agua apaga el Fuego).' },
    'Air-Earth':   { en: 'Neutral (different planes).', es: 'Neutra (planos distintos).' },
    'Earth-Air':   { en: 'Neutral (different planes).', es: 'Neutra (planos distintos).' },
    'Air-Water':   { en: 'Mixed (Air ripples Water).', es: 'Mixta (el Aire agita el Agua).' },
    'Water-Air':   { en: 'Mixed (Air ripples Water).', es: 'Mixta (el Aire agita el Agua).' },
  };
  if (same) {
    const el = localizeElement(e1, locale).toLowerCase();
    return locale === 'es'
      ? `Doble intensidad ${el} — afinidad fuerte, sin contraste.`
      : `Double ${el} intensity — strong affinity, no contrast.`;
  }
  const entry = pairs[pair];
  return entry ? entry[locale] : (locale === 'es' ? 'Combinación poco estudiada.' : 'Less-studied combination.');
}

function modalityCompatibility(m1: ModalityName, m2: ModalityName, locale: 'en' | 'es'): string {
  if (m1 === m2 && m1 === 'Cardinal') {
    return locale === 'es' ? 'Doble cardinal — ambos quieren liderar; choque probable.' : 'Double cardinal — both want to lead; clash likely.';
  }
  if (m1 === m2 && m1 === 'Fixed') {
    return locale === 'es' ? 'Doble fijo — máxima estabilidad pero resistencia al cambio.' : 'Double fixed — maximum stability but resistance to change.';
  }
  if (m1 === m2 && m1 === 'Mutable') {
    return locale === 'es' ? 'Doble mutable — adaptabilidad, falta de dirección clara.' : 'Double mutable — adaptable, lacks clear direction.';
  }
  const set = new Set([m1, m2]);
  if (set.has('Cardinal') && set.has('Fixed')) {
    return locale === 'es' ? 'Cardinal + Fijo — iniciativa estabilizada; equilibrio bueno.' : 'Cardinal + Fixed — initiative anchored; healthy balance.';
  }
  if (set.has('Cardinal') && set.has('Mutable')) {
    return locale === 'es' ? 'Cardinal + Mutable — el líder propone, el mutable adapta.' : 'Cardinal + Mutable — leader proposes, mutable adapts.';
  }
  return locale === 'es' ? 'Fijo + Mutable — estabilidad con flexibilidad ocasional.' : 'Fixed + Mutable — stability with occasional flexibility.';
}

function aspectByDistanceIdx(d: number, locale: 'en' | 'es'): string {
  const min = Math.min(d, 12 - d);
  const labels: Record<number, { en: string; es: string }> = {
    0: { en: 'Conjunction (same sign) — fused energy', es: 'Conjunción (mismo signo) — energía fusionada' },
    1: { en: 'Semi-sextile — subtle adjustment, minor learning aspect', es: 'Semisextil — ajuste sutil, aspecto menor de aprendizaje' },
    2: { en: 'Sextile — supportive, opportunity-flavored', es: 'Sextil — apoyo, sabor de oportunidad' },
    3: { en: 'Square — friction, growth pressure', es: 'Cuadratura — fricción, presión de crecimiento' },
    4: { en: 'Trine — flowing, easy compatibility', es: 'Trígono — fluidez, compatibilidad fácil' },
    5: { en: 'Quincunx — uneasy, requires adjustment', es: 'Quincuncio — inquietud, requiere ajuste' },
    6: { en: 'Opposition — magnetic polarity, balance challenge', es: 'Oposición — polaridad magnética, desafío de equilibrio' },
  };
  return labels[min]![locale];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, pair } = await params;
  const parsed = parsePairSlug(pair);
  if (!parsed) return {};
  const [s1, s2] = parsed;
  const rows = locale === 'es' ? esSigns : enSigns;
  const r1 = findSign(rows as SignRow[], s1);
  const r2 = findSign(rows as SignRow[], s2);
  if (!r1 || !r2) return {};
  const content = getReadyEnrichedPairContent(pair);
  const lc = content?.[locale];

  const title = lc?.metaTitle ?? (locale === 'es'
    ? `${r1.sign} × ${r2.sign} — compatibilidad sideral`
    : `${r1.sign} × ${r2.sign} — sidereal compatibility`);
  const description = lc?.metaDescription ?? (locale === 'es'
    ? `Análisis sideral de la compatibilidad ${r1.sign} y ${r2.sign}: elemento, modalidad, regente y tipo de aspecto.`
    : `Sidereal analysis of ${r1.sign} and ${r2.sign} compatibility: element, modality, ruler, and aspect type.`);

  const metadata = createMetadata({ title, description, path: `/compatibility/${pair}`, locale });

  // Enriched (ready) pairs re-index; thin/un-authored pairs stay noindex (T2),
  // follow so outbound sign-essay links keep passing equity.
  return content ? metadata : { ...metadata, robots: { index: false, follow: true } };
}

export default async function CompatibilityPairPage({ params }: PageProps) {
  const { locale, pair } = await params;
  setRequestLocale(locale);
  const parsed = parsePairSlug(pair);
  if (!parsed) notFound();
  const [s1, s2] = parsed;
  const rows = (locale === 'es' ? esSigns : enSigns) as SignRow[];
  const r1 = findSign(rows, s1);
  const r2 = findSign(rows, s2);
  if (!r1 || !r2) notFound();

  const ZODIAC_ORDER = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
  const idx1 = ZODIAC_ORDER.indexOf(s1);
  const idx2 = ZODIAC_ORDER.indexOf(s2);

  const heading = `${r1.sign} × ${r2.sign}`;
  const localePath = locale === 'es' ? '/es' : '';
  const url = `${SITE_URL}${localePath}/compatibility/${pair}`;

  const content = getReadyEnrichedPairContent(pair);
  if (content) {
    const lc = content[locale];
    const dateModified = content.updatedAt && !content.updatedAt.includes('__PLACEHOLDER__')
      ? content.updatedAt
      : '2026-07-10';
    const disclaimer = locale === 'es'
      ? 'Estrevia es para la reflexión y el entretenimiento; no es consejo médico, psicológico, financiero ni de pareja.'
      : 'Estrevia is for reflection and entertainment; it is not medical, psychological, financial, or relationship advice.';
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <JsonLdScript
          schema={articleSchema({
            title: lc.h1,
            description: lc.metaDescription,
            datePublished: '2026-07-10',
            dateModified,
            authorName: 'Estrevia',
            url,
          })}
        />
        <JsonLdScript
          schema={breadcrumbSchema([
            { name: locale === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}${localePath}` },
            { name: locale === 'es' ? 'Compatibilidad sideral' : 'Sidereal compatibility', url: `${SITE_URL}${localePath}/compatibility` },
            { name: lc.h1, url },
          ])}
        />
        <JsonLdScript schema={faqSchema(lc.faq)} />
        <header className="mb-8 text-center">
          <p className="text-5xl">{r1.symbol} {r2.symbol}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white/90">{lc.h1}</h1>
        </header>
        <p className="text-base text-white/80 leading-relaxed">{lc.intro}</p>
        {lc.sections.map((section, i) => (
          <section key={i} className="mt-8">
            <h2 className="text-xl font-semibold text-white/90">{section.heading}</h2>
            <p className="mt-2 text-sm text-white/75 leading-relaxed whitespace-pre-line">{section.body}</p>
          </section>
        ))}
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-white/90">{locale === 'es' ? 'Preguntas frecuentes' : 'FAQ'}</h2>
          <dl className="mt-3 space-y-4">
            {lc.faq.map((item, i) => (
              <div key={i}>
                <dt className="text-sm font-medium text-white/90">{item.question}</dt>
                <dd className="mt-1 text-sm text-white/70">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
        <nav className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label={locale === 'es' ? 'Signos relacionados' : 'Related signs'}>
          <Link href={`/signs/${s1}`} className="text-amber-300/90 underline underline-offset-4 hover:text-amber-200">{r1.sign}</Link>
          <Link href={`/signs/${s2}`} className="text-amber-300/90 underline underline-offset-4 hover:text-amber-200">{r2.sign}</Link>
        </nav>
        <p className="mt-10 text-xs text-white/40">{disclaimer}</p>
      </main>
    );
  }

  const elementText = elementCompatibility(r1.element as ElementName, r2.element as ElementName, locale);
  const modalityText = modalityCompatibility(r1.modality as ModalityName, r2.modality as ModalityName, locale);
  const aspectText = aspectByDistanceIdx(Math.abs(idx1 - idx2), locale);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <JsonLdScript
        schema={articleSchema({
          title: heading,
          description: elementText,
          datePublished: '2026-05-17',
          dateModified: '2026-05-17',
          authorName: 'Estrevia',
          url,
        })}
      />
      <JsonLdScript
        schema={breadcrumbSchema([
          { name: locale === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}${localePath}` },
          { name: locale === 'es' ? 'Compatibilidad sideral' : 'Sidereal compatibility', url: `${SITE_URL}${localePath}/compatibility` },
          { name: heading, url },
        ])}
      />
      <header className="mb-8 text-center">
        <p className="text-5xl">{r1.symbol} {r2.symbol}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white/90">{heading}</h1>
      </header>
      <dl className="space-y-6">
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/40">{locale === 'es' ? 'Elemento' : 'Element'}</dt>
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{localizeElement(r1.element, locale)} + {localizeElement(r2.element, locale)}</strong> — {elementText}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/40">{locale === 'es' ? 'Modalidad' : 'Modality'}</dt>
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{localizeModality(r1.modality, locale)} + {localizeModality(r2.modality, locale)}</strong> — {modalityText}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/40">{locale === 'es' ? 'Regentes' : 'Rulers'}</dt>
          <dd className="mt-1 text-sm text-white/80"><strong className="text-white">{r1.ruler} + {r2.ruler}</strong></dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-white/40">{locale === 'es' ? 'Tipo de aspecto' : 'Aspect type'}</dt>
          <dd className="mt-1 text-sm text-white/80">{aspectText}</dd>
        </div>
      </dl>
    </main>
  );
}
