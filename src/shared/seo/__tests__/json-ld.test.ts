import { describe, it, expect } from 'vitest';
import {
  organizationSchema,
  softwareAppSchema,
  articleSchema,
  faqSchema,
  howToSchema,
  breadcrumbSchema,
} from '../json-ld';

// schema-dts types are complex union types — we cast through unknown for test assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchema = Record<string, any>;

describe('organizationSchema', () => {
  it('returns @type Organization', () => {
    const schema = organizationSchema() as unknown as AnySchema;
    expect(schema['@type']).toBe('Organization');
  });

  it('sets @context to https://schema.org', () => {
    const schema = organizationSchema() as unknown as AnySchema;
    expect(schema['@context']).toBe('https://schema.org');
  });

  it('includes name and url', () => {
    const schema = organizationSchema() as unknown as AnySchema;
    expect(schema.name).toBe('Estrevia');
    expect(typeof schema.url).toBe('string');
    expect(schema.url.length).toBeGreaterThan(0);
  });

  it('includes logo with url', () => {
    const schema = organizationSchema() as unknown as AnySchema;
    expect(schema.logo['@type']).toBe('ImageObject');
    expect(schema.logo.url).toContain('logo.png');
  });
});

describe('softwareAppSchema', () => {
  it('returns @type SoftwareApplication', () => {
    const schema = softwareAppSchema() as unknown as AnySchema;
    expect(schema['@type']).toBe('SoftwareApplication');
  });

  it('sets applicationCategory', () => {
    const schema = softwareAppSchema() as unknown as AnySchema;
    expect(schema.applicationCategory).toBe('LifestyleApplication');
  });

  it('includes offers with price', () => {
    const schema = softwareAppSchema() as unknown as AnySchema;
    expect(schema.offers['@type']).toBe('Offer');
    expect(schema.offers.price).toBe('0');
  });
});

describe('articleSchema', () => {
  const options = {
    title: 'Sun in sidereal Aries',
    description:
      'In sidereal astrology, the Sun transits Aries from 14 April to 14 May each year.',
    url: 'https://estrevia.app/essays/sun-in-aries',
    datePublished: '2024-01-15T00:00:00Z',
    dateModified: '2024-06-01T00:00:00Z',
  };

  it('returns @type Article', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema['@type']).toBe('Article');
  });

  it('includes headline', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema.headline).toBe(options.title);
  });

  it('includes datePublished', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema.datePublished).toBe(options.datePublished);
  });

  it('includes dateModified', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema.dateModified).toBe(options.dateModified);
  });

  it('includes author with @type Organization', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema.author['@type']).toBe('Organization');
    expect(typeof schema.author.name).toBe('string');
  });

  it('includes publisher with name Estrevia', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema.publisher['@type']).toBe('Organization');
    expect(schema.publisher.name).toBe('Estrevia');
  });

  it('includes url', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema.url).toBe(options.url);
  });

  it('includes mainEntityOfPage', () => {
    const schema = articleSchema(options) as unknown as AnySchema;
    expect(schema.mainEntityOfPage['@type']).toBe('WebPage');
    expect(schema.mainEntityOfPage['@id']).toBe(options.url);
  });

  it('includes image when imageUrl is provided', () => {
    const schema = articleSchema({
      ...options,
      imageUrl: 'https://estrevia.app/og/sun-in-aries.png',
    }) as unknown as AnySchema;
    expect(schema.image['@type']).toBe('ImageObject');
    expect(schema.image.url).toContain('sun-in-aries');
  });

  it('uses custom authorName when provided', () => {
    const schema = articleSchema({
      ...options,
      authorName: 'Estrevia Editorial',
    }) as unknown as AnySchema;
    expect(schema.author.name).toBe('Estrevia Editorial');
  });
});

describe('faqSchema', () => {
  const questions = [
    {
      question: 'What is sidereal astrology?',
      answer:
        'Sidereal astrology uses the actual positions of constellations, shifted ~24° from tropical signs.',
    },
    {
      question: 'How does sidereal differ from tropical?',
      answer:
        'Tropical astrology is based on the seasons; sidereal is based on fixed star positions.',
    },
  ];

  it('returns @type FAQPage', () => {
    const schema = faqSchema(questions) as unknown as AnySchema;
    expect(schema['@type']).toBe('FAQPage');
  });

  it('generates one Question entry per item', () => {
    const schema = faqSchema(questions) as unknown as AnySchema;
    const entities = schema.mainEntity as AnySchema[];
    expect(entities.length).toBe(2);
    expect(entities[0]['@type']).toBe('Question');
  });

  it('includes name (question text) on each Question', () => {
    const schema = faqSchema(questions) as unknown as AnySchema;
    const entities = schema.mainEntity as AnySchema[];
    expect(entities[0].name).toBe(questions[0].question);
    expect(entities[1].name).toBe(questions[1].question);
  });

  it('includes acceptedAnswer with @type Answer on each Question', () => {
    const schema = faqSchema(questions) as unknown as AnySchema;
    const entities = schema.mainEntity as AnySchema[];
    expect(entities[0].acceptedAnswer['@type']).toBe('Answer');
    expect(entities[0].acceptedAnswer.text).toBe(questions[0].answer);
  });

  it('handles empty questions array', () => {
    const schema = faqSchema([]) as unknown as AnySchema;
    expect(schema.mainEntity).toEqual([]);
  });
});

describe('howToSchema', () => {
  const options = {
    name: 'How to read your sidereal natal chart',
    description: 'A step-by-step guide to interpreting your sidereal chart positions.',
    steps: [
      { name: 'Calculate your chart', text: 'Enter your birth date, time, and location.' },
      { name: 'Find your Sun sign', text: 'Look up the Sun position in the chart wheel.' },
      { name: 'Read the interpretation', text: 'Navigate to the essay for your Sun sign.' },
    ],
  };

  it('returns @type HowTo', () => {
    const schema = howToSchema(options) as unknown as AnySchema;
    expect(schema['@type']).toBe('HowTo');
  });

  it('includes name and description', () => {
    const schema = howToSchema(options) as unknown as AnySchema;
    expect(schema.name).toBe(options.name);
    expect(schema.description).toBe(options.description);
  });

  it('generates HowToStep entries with correct count', () => {
    const schema = howToSchema(options) as unknown as AnySchema;
    const steps = schema.step as AnySchema[];
    expect(steps.length).toBe(3);
    expect(steps[0]['@type']).toBe('HowToStep');
  });

  it('assigns sequential position numbers starting from 1', () => {
    const schema = howToSchema(options) as unknown as AnySchema;
    const steps = schema.step as AnySchema[];
    expect(steps[0].position).toBe(1);
    expect(steps[1].position).toBe(2);
    expect(steps[2].position).toBe(3);
  });

  it('includes step name and text', () => {
    const schema = howToSchema(options) as unknown as AnySchema;
    const steps = schema.step as AnySchema[];
    expect(steps[0].name).toBe(options.steps[0].name);
    expect(steps[0].text).toBe(options.steps[0].text);
  });

  it('includes totalTime when provided', () => {
    const schema = howToSchema({ ...options, totalTime: 'PT5M' }) as unknown as AnySchema;
    expect(schema.totalTime).toBe('PT5M');
  });

  it('omits totalTime when not provided', () => {
    const schema = howToSchema(options) as unknown as AnySchema;
    expect(schema.totalTime).toBeUndefined();
  });
});

describe('breadcrumbSchema', () => {
  const items = [
    { name: 'Home', url: 'https://estrevia.app' },
    { name: 'Essays', url: 'https://estrevia.app/essays' },
    { name: 'Sun in Aries', url: 'https://estrevia.app/essays/sun-in-aries' },
  ];

  it('returns @type BreadcrumbList', () => {
    const schema = breadcrumbSchema(items) as unknown as AnySchema;
    expect(schema['@type']).toBe('BreadcrumbList');
  });

  it('generates ListItem entries with correct count', () => {
    const schema = breadcrumbSchema(items) as unknown as AnySchema;
    const list = schema.itemListElement as AnySchema[];
    expect(list.length).toBe(3);
    expect(list[0]['@type']).toBe('ListItem');
  });

  it('assigns sequential positions starting from 1', () => {
    const schema = breadcrumbSchema(items) as unknown as AnySchema;
    const list = schema.itemListElement as AnySchema[];
    expect(list[0].position).toBe(1);
    expect(list[1].position).toBe(2);
    expect(list[2].position).toBe(3);
  });

  it('includes name and item (url) on each ListItem', () => {
    const schema = breadcrumbSchema(items) as unknown as AnySchema;
    const list = schema.itemListElement as AnySchema[];
    expect(list[0].name).toBe('Home');
    expect(list[0].item).toBe('https://estrevia.app');
    expect(list[2].name).toBe('Sun in Aries');
    expect(list[2].item).toBe('https://estrevia.app/essays/sun-in-aries');
  });

  it('handles single-item breadcrumb (homepage)', () => {
    const schema = breadcrumbSchema([{ name: 'Home', url: 'https://estrevia.app' }]) as unknown as AnySchema;
    const list = schema.itemListElement as AnySchema[];
    expect(list.length).toBe(1);
    expect(list[0].position).toBe(1);
  });
});
