import { describe, it, expect } from 'vitest';
import { createMetadata } from '../metadata';
import { articleSchema, faqSchema, breadcrumbSchema } from '../json-ld';
import { SITE_URL } from '../constants';

// schema-dts types are complex union types — we cast through unknown for test assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchema = Record<string, any>;

const essayOptions = {
  title: 'Sun in Aries — Sidereal Astrology',
  description:
    'In sidereal astrology, the Sun transits Aries from 14 April to 14 May. Discover what this placement means for your chart.',
  path: '/essays/sun-in-aries',
  type: 'article' as const,
  publishedTime: '2024-01-15T00:00:00Z',
};

describe('Essay page — createMetadata', () => {
  it('sets og:type to article for essay pages', () => {
    const meta = createMetadata(essayOptions);
    const og = meta.openGraph as { type: string };
    expect(og.type).toBe('article');
  });

  it('includes publishedTime when type is article', () => {
    const meta = createMetadata(essayOptions);
    const og = meta.openGraph as { publishedTime?: string };
    expect(og.publishedTime).toBe('2024-01-15T00:00:00Z');
  });

  it('essay title includes planet name', () => {
    const meta = createMetadata(essayOptions);
    expect(meta.title as string).toContain('Sun');
  });

  it('essay title includes sign name', () => {
    const meta = createMetadata(essayOptions);
    expect(meta.title as string).toContain('Aries');
  });

  it('essay description mentions sidereal', () => {
    const meta = createMetadata(essayOptions);
    expect(meta.description as string).toContain('sidereal');
  });

  it('uses custom ogImage when essay-specific URL is provided', () => {
    const essayOgUrl = `${SITE_URL}/api/og/essay/sun-in-aries`;
    const meta = createMetadata({ ...essayOptions, ogImage: essayOgUrl });
    const og = meta.openGraph as { images: { url: string }[] };
    expect(og.images[0].url).toContain('/api/og/essay/');
  });

  it('ogImage URL contains essay slug when essay-specific URL is provided', () => {
    const essayOgUrl = `${SITE_URL}/api/og/essay/sun-in-aries`;
    const meta = createMetadata({ ...essayOptions, ogImage: essayOgUrl });
    const og = meta.openGraph as { images: { url: string }[] };
    expect(og.images[0].url).toContain('sun-in-aries');
  });
});

describe('Essay page — articleSchema', () => {
  const articleOptions = {
    title: 'Sun in sidereal Aries',
    description:
      'In sidereal astrology, the Sun transits Aries from 14 April to 14 May each year.',
    url: 'https://estrevia.app/essays/sun-in-aries',
    datePublished: '2024-01-15T00:00:00Z',
    dateModified: '2024-06-01T00:00:00Z',
  };

  it('headline is present in article schema', () => {
    const schema = articleSchema(articleOptions) as unknown as AnySchema;
    expect(schema.headline).toBeTruthy();
    expect(schema.headline).toBe(articleOptions.title);
  });

  it('datePublished is present in article schema', () => {
    const schema = articleSchema(articleOptions) as unknown as AnySchema;
    expect(schema.datePublished).toBe(articleOptions.datePublished);
  });

  it('publisher.name is Estrevia', () => {
    const schema = articleSchema(articleOptions) as unknown as AnySchema;
    expect(schema.publisher.name).toBe('Estrevia');
  });
});

describe('Essay page — faqSchema', () => {
  const faqs = [
    {
      question: 'What does Sun in sidereal Aries mean?',
      answer:
        'Sun in sidereal Aries indicates strong initiative and leadership energy, positioned in the first sign of the sidereal zodiac.',
    },
    {
      question: 'How is sidereal Aries different from tropical Aries?',
      answer:
        'Sidereal Aries is shifted ~24° behind tropical Aries due to the precession of equinoxes, placing the Sun there from ~14 April to ~14 May.',
    },
    {
      question: 'Which planets rule sidereal Aries?',
      answer: 'Mars is the traditional ruler of Aries in both sidereal and tropical systems.',
    },
  ];

  it('produces @type FAQPage', () => {
    const schema = faqSchema(faqs) as unknown as AnySchema;
    expect(schema['@type']).toBe('FAQPage');
  });

  it('generates one Question entry per FAQ item', () => {
    const schema = faqSchema(faqs) as unknown as AnySchema;
    const entities = schema.mainEntity as AnySchema[];
    expect(entities.length).toBe(faqs.length);
    entities.forEach((entity: AnySchema) => {
      expect(entity['@type']).toBe('Question');
    });
  });

  it('each Question includes the question text as name', () => {
    const schema = faqSchema(faqs) as unknown as AnySchema;
    const entities = schema.mainEntity as AnySchema[];
    expect(entities[0].name).toBe(faqs[0].question);
    expect(entities[1].name).toBe(faqs[1].question);
  });

  it('each Question includes an acceptedAnswer with the answer text', () => {
    const schema = faqSchema(faqs) as unknown as AnySchema;
    const entities = schema.mainEntity as AnySchema[];
    expect(entities[0].acceptedAnswer['@type']).toBe('Answer');
    expect(entities[0].acceptedAnswer.text).toBe(faqs[0].answer);
  });
});

describe('Essay page — breadcrumbSchema', () => {
  const breadcrumbs = [
    { name: 'Home', url: 'https://estrevia.app' },
    { name: 'Essays', url: 'https://estrevia.app/essays' },
    { name: 'Sun in sidereal Aries', url: 'https://estrevia.app/essays/sun-in-aries' },
  ];

  it('produces @type BreadcrumbList', () => {
    const schema = breadcrumbSchema(breadcrumbs) as unknown as AnySchema;
    expect(schema['@type']).toBe('BreadcrumbList');
  });

  it('has three items: Home > Essays > [essay title]', () => {
    const schema = breadcrumbSchema(breadcrumbs) as unknown as AnySchema;
    const list = schema.itemListElement as AnySchema[];
    expect(list.length).toBe(3);
  });

  it('first item is Home', () => {
    const schema = breadcrumbSchema(breadcrumbs) as unknown as AnySchema;
    const list = schema.itemListElement as AnySchema[];
    expect(list[0].name).toBe('Home');
    expect(list[0].position).toBe(1);
  });

  it('second item is Essays', () => {
    const schema = breadcrumbSchema(breadcrumbs) as unknown as AnySchema;
    const list = schema.itemListElement as AnySchema[];
    expect(list[1].name).toBe('Essays');
    expect(list[1].position).toBe(2);
  });

  it('third item is the essay title with correct URL', () => {
    const schema = breadcrumbSchema(breadcrumbs) as unknown as AnySchema;
    const list = schema.itemListElement as AnySchema[];
    expect(list[2].name).toBe('Sun in sidereal Aries');
    expect(list[2].item).toBe('https://estrevia.app/essays/sun-in-aries');
    expect(list[2].position).toBe(3);
  });
});
