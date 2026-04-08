import { describe, it, expect } from 'vitest';
import { createMetadata } from '../metadata';
import { MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH, SITE_URL } from '../constants';

describe('createMetadata', () => {
  const baseOptions = {
    title: 'Sun in Aries — Sidereal',
    description:
      'In sidereal astrology, the Sun transits Aries from 14 April to 14 May. Calculate your chart to discover your sidereal Sun sign.',
    path: '/essays/sun-in-aries',
  };

  describe('title', () => {
    it('appends " | Estrevia" suffix', () => {
      const meta = createMetadata(baseOptions);
      expect(meta.title).toContain('Estrevia');
    });

    it('does not exceed 60 characters', () => {
      const meta = createMetadata(baseOptions);
      const title = meta.title as string;
      expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    });

    it('truncates long titles to ≤60 chars with ellipsis', () => {
      const meta = createMetadata({
        ...baseOptions,
        title: 'A very long title that would exceed the sixty character limit for sure',
      });
      const title = meta.title as string;
      expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
      expect(title.endsWith('\u2026')).toBe(true);
    });

    it('reflects the input title text (not truncated when short)', () => {
      const meta = createMetadata({ ...baseOptions, title: 'Sun in Aries' });
      expect(meta.title).toContain('Sun in Aries');
    });
  });

  describe('description', () => {
    it('does not exceed 155 characters', () => {
      const meta = createMetadata(baseOptions);
      expect((meta.description as string).length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    });

    it('truncates long descriptions to ≤155 chars with ellipsis', () => {
      const longDesc =
        'This description is intentionally made very long so that it will definitely exceed the maximum allowed length of one hundred and fifty-five characters total.';
      const meta = createMetadata({ ...baseOptions, description: longDesc });
      const desc = meta.description as string;
      expect(desc.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
      expect(desc.endsWith('\u2026')).toBe(true);
    });

    it('matches input when within limit', () => {
      const short = 'Short description.';
      const meta = createMetadata({ ...baseOptions, description: short });
      expect(meta.description).toBe(short);
    });
  });

  describe('canonical URL', () => {
    it('generates an absolute canonical URL', () => {
      const meta = createMetadata(baseOptions);
      const canonical = (meta.alternates as { canonical: string }).canonical;
      expect(canonical).toMatch(/^https?:\/\//);
    });

    it('uses SITE_URL as base when path is relative', () => {
      const meta = createMetadata({ ...baseOptions, path: '/essays/sun-in-aries' });
      const canonical = (meta.alternates as { canonical: string }).canonical;
      expect(canonical).toContain(SITE_URL.replace(/\/$/, ''));
      expect(canonical).toContain('/essays/sun-in-aries');
    });

    it('keeps absolute URL as-is when path is already absolute', () => {
      const absoluteUrl = 'https://custom.example.com/page';
      const meta = createMetadata({ ...baseOptions, path: absoluteUrl });
      const canonical = (meta.alternates as { canonical: string }).canonical;
      expect(canonical).toBe(absoluteUrl);
    });

    it('handles path without leading slash', () => {
      const meta = createMetadata({ ...baseOptions, path: 'essays/sun-in-aries' });
      const canonical = (meta.alternates as { canonical: string }).canonical;
      expect(canonical).toMatch(/^https?:\/\//);
      expect(canonical).toContain('/essays/sun-in-aries');
    });
  });

  describe('OpenGraph', () => {
    it('includes og:image', () => {
      const meta = createMetadata(baseOptions);
      const og = meta.openGraph as { images: { url: string }[] };
      expect(og.images).toBeDefined();
      expect(og.images.length).toBeGreaterThan(0);
      expect(og.images[0].url).toBeTruthy();
    });

    it('uses custom ogImage when provided', () => {
      const customImage = 'https://estrevia.app/og/custom.png';
      const meta = createMetadata({ ...baseOptions, ogImage: customImage });
      const og = meta.openGraph as { images: { url: string }[] };
      expect(og.images[0].url).toBe(customImage);
    });

    it('sets og:type to article for article pages', () => {
      const meta = createMetadata({ ...baseOptions, type: 'article' });
      const og = meta.openGraph as { type: string };
      expect(og.type).toBe('article');
    });

    it('sets og:type to website by default', () => {
      const meta = createMetadata(baseOptions);
      const og = meta.openGraph as { type: string };
      expect(og.type).toBe('website');
    });

    it('includes publishedTime on article type', () => {
      const meta = createMetadata({
        ...baseOptions,
        type: 'article',
        publishedTime: '2024-01-15T00:00:00Z',
      });
      const og = meta.openGraph as { publishedTime?: string };
      expect(og.publishedTime).toBe('2024-01-15T00:00:00Z');
    });

    it('includes siteName', () => {
      const meta = createMetadata(baseOptions);
      const og = meta.openGraph as { siteName: string };
      expect(og.siteName).toBe('Estrevia');
    });
  });

  describe('Twitter Card', () => {
    it('sets twitter:card to summary_large_image', () => {
      const meta = createMetadata(baseOptions);
      const twitter = meta.twitter as { card: string };
      expect(twitter.card).toBe('summary_large_image');
    });

    it('includes twitter:image', () => {
      const meta = createMetadata(baseOptions);
      const twitter = meta.twitter as { images: string[] };
      expect(twitter.images).toBeDefined();
      expect(twitter.images.length).toBeGreaterThan(0);
    });
  });

  describe('robots', () => {
    it('defaults to index: true, follow: true', () => {
      const meta = createMetadata(baseOptions);
      const robots = meta.robots as { index: boolean; follow: boolean };
      expect(robots.index).toBe(true);
      expect(robots.follow).toBe(true);
    });

    it('sets index: false when noIndex is true', () => {
      const meta = createMetadata({ ...baseOptions, noIndex: true });
      const robots = meta.robots as { index: boolean; follow: boolean };
      expect(robots.index).toBe(false);
      expect(robots.follow).toBe(false);
    });
  });

  describe('keywords', () => {
    it('includes keywords when provided', () => {
      const meta = createMetadata({
        ...baseOptions,
        keywords: ['sidereal astrology', 'sun in aries'],
      });
      expect(meta.keywords).toEqual(['sidereal astrology', 'sun in aries']);
    });

    it('omits keywords field when not provided', () => {
      const meta = createMetadata(baseOptions);
      expect(meta.keywords).toBeUndefined();
    });
  });
});
