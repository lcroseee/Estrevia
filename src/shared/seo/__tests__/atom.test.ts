import { describe, it, expect } from 'vitest';
import { buildAtomFeed, escapeXml, type AtomEntry } from '../atom';

describe('escapeXml', () => {
  it('escapes ampersands', () => {
    expect(escapeXml('Foo & Bar')).toBe('Foo &amp; Bar');
  });
  it('escapes less-than', () => {
    expect(escapeXml('a < b')).toBe('a &lt; b');
  });
  it('escapes greater-than', () => {
    expect(escapeXml('a > b')).toBe('a &gt; b');
  });
  it('escapes double quotes', () => {
    expect(escapeXml('"quoted"')).toBe('&quot;quoted&quot;');
  });
  it('escapes apostrophes', () => {
    expect(escapeXml("it's")).toBe('it&apos;s');
  });
  it('escapes all combined', () => {
    expect(escapeXml('A & B < "C\'s" > D')).toBe('A &amp; B &lt; &quot;C&apos;s&quot; &gt; D');
  });
});

describe('buildAtomFeed', () => {
  const now = new Date('2026-05-03T12:00:00Z');
  const entries: AtomEntry[] = [
    {
      title: 'Sun in Aries',
      summary: 'Sidereal sun in Aries — initiative.',
      link: 'https://estrevia.app/essays/sun-in-aries',
      published: '2024-01-15',
      updated: '2024-01-15',
    },
    {
      title: 'Bar & Foo',
      summary: 'Description with <special> chars',
      link: 'https://estrevia.app/essays/bar-foo',
      published: '2024-02-20',
      updated: '2024-03-15',
    },
  ];

  const feed = buildAtomFeed({
    feedUrl: 'https://estrevia.app/feed.xml',
    siteUrl: 'https://estrevia.app',
    title: 'Estrevia — Essays',
    subtitle: 'Sidereal astrology essays',
    locale: 'en',
    updated: now,
    entries,
  });

  it('starts with XML declaration', () => {
    expect(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('declares Atom namespace', () => {
    expect(feed).toContain('xmlns="http://www.w3.org/2005/Atom"');
  });

  it('contains feed title', () => {
    expect(feed).toContain('<title>Estrevia — Essays</title>');
  });

  it('contains feed self-link with rel="self"', () => {
    expect(feed).toContain('<link rel="self" href="https://estrevia.app/feed.xml"/>');
  });

  it('contains site link with rel="alternate"', () => {
    expect(feed).toContain('<link rel="alternate" href="https://estrevia.app"/>');
  });

  it('contains feed updated timestamp', () => {
    expect(feed).toContain('<updated>2026-05-03T12:00:00.000Z</updated>');
  });

  it('contains organization author', () => {
    expect(feed).toContain('<author><name>Estrevia</name></author>');
  });

  it('contains all entries', () => {
    expect(feed).toContain('<title>Sun in Aries</title>');
    expect(feed).toContain('<title>Bar &amp; Foo</title>');
  });

  it('escapes XML in summary', () => {
    expect(feed).toContain('Description with &lt;special&gt; chars');
  });

  it('uses link as id (Atom requires unique id per entry)', () => {
    expect(feed).toContain('<id>https://estrevia.app/essays/sun-in-aries</id>');
  });

  it('emits published and updated as ISO 8601', () => {
    expect(feed).toContain('<published>2024-01-15T00:00:00.000Z</published>');
    expect(feed).toContain('<updated>2024-03-15T00:00:00.000Z</updated>');
  });
});
