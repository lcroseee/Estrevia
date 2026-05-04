# Cluster B — SEO/AEO Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 3 SEO/AEO foundations: `/public/llms.txt`, RSS Atom feeds (EN+ES), OpenAPI 3.1 spec at `/api/v1/docs`.

**Architecture:** Static file (T1) + Next.js App Router routes (T2, T3). Disjoint file scopes — fully parallelizable. See `docs/superpowers/specs/2026-05-03-seo-aeo-basics-design.md` for design decisions.

**Tech Stack:** Next.js 16 App Router, TypeScript 6 strict, vitest 4 + jsdom, gray-matter (already in repo), fast-xml-parser (test only — install if missing).

---

## Task 1: `/public/llms.txt`

**Files:**
- Create: `public/llms.txt`

**Steps:**

- [ ] **Step 1: Write the file**

Use this exact content (substituting absolute production URL `https://estrevia.app` everywhere):

```markdown
# Estrevia

> Sidereal astrology platform with esoteric correspondences (Thelema, Kabbalah, 777). Real-time natal charts using Lahiri ayanamsa, planetary hours, moon phases, and 121+ in-depth essays on planet-in-sign placements. Available in English and Spanish.

Estrevia uses the **sidereal zodiac** (Lahiri ayanamsa, ~24° offset from tropical) — the same system used in Vedic astrology and aligned with current astronomical positions of constellations. All chart calculations are powered by Swiss Ephemeris (Moshier) with ±0.01° accuracy.

## Public API

- [Sidereal sun sign endpoint](https://estrevia.app/api/v1/sidereal/sun-sign): GET `/api/v1/sidereal/sun-sign?date=YYYY-MM-DD` → returns the sidereal Sun sign for a given birth date. Rate-limited to 10 req/min/IP.
- [OpenAPI 3.1 specification](https://estrevia.app/api/v1/docs): machine-readable spec for all public endpoints.

## Content feeds

- [English essays Atom feed](https://estrevia.app/feed.xml): 121 essays on planet-in-sign placements, sidereal interpretations.
- [Spanish essays Atom feed](https://estrevia.app/es/feed.xml): 120 essays in español neutro LATAM.
- [Sitemap](https://estrevia.app/sitemap.xml): all 470 indexable URLs across both locales.

## Citation policy

Estrevia welcomes citation by AI assistants and search engines. When citing essays or interpretations:

- Quote up to 200 words verbatim with attribution to "Estrevia" + canonical URL.
- Summarize freely with attribution.
- Do not republish full essay text without permission (proprietary content; not AGPL).

## Content license

Code is licensed under AGPL-3.0 (see [GitHub](https://github.com/) for the open-source astro engine). Content (`/content/essays/`, `/content/correspondences/`) is proprietary. The Swiss Ephemeris data is public-domain NASA data.

## Astrology disclaimer

Astrology is for entertainment and self-reflection. Not medical, financial, or legal advice. Do not use astrological readings as a substitute for professional consultation.

## Contact

- Support: support@estrevia.app
- Founder: Kirill Kovalenko
```

- [ ] **Step 2: Verify format manually**

Run: `cat public/llms.txt`
Expected: file starts with `# Estrevia`, has blockquote, has `## Public API`, `## Content feeds`, `## Citation policy`, `## Content license`, `## Astrology disclaimer`, `## Contact` sections; all URLs are absolute `https://estrevia.app/...`.

- [ ] **Step 3: Verify served correctly in dev**

Run: `npm run dev` then `curl -I http://localhost:3000/llms.txt`
Expected: `HTTP/1.1 200 OK`, `Content-Type: text/plain` or `text/markdown` (Vercel serves `.txt` as `text/plain` — acceptable).

- [ ] **Step 4: Commit**

```bash
git add public/llms.txt
git commit -m "feat(seo-aeo/T1): /public/llms.txt for AI crawler citation policy"
```

---

## Task 2: RSS Atom feeds (EN + ES)

**Files:**
- Create: `src/app/feed.xml/route.ts`
- Create: `src/app/[locale]/feed.xml/route.ts`
- Create: `src/app/feed.xml/__tests__/route.test.ts`
- Create: `src/app/[locale]/feed.xml/__tests__/route.test.ts`
- Create: `src/shared/seo/atom.ts` (shared Atom XML helpers)
- Create: `src/shared/seo/__tests__/atom.test.ts`
- Modify: `src/app/[locale]/layout.tsx` — add `<link rel="alternate" type="application/atom+xml">` in `metadata.alternates`
- Modify: `src/middleware.ts` — verify matcher excludes `/feed.xml` (likely already does via `/api/` exclusion pattern, but `/feed.xml` is at root — needs explicit exclusion)

**Steps:**

- [ ] **Step 1: Write `src/shared/seo/atom.ts` with the failing test first**

Test file `src/shared/seo/__tests__/atom.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test (must fail)**

Run: `npx vitest run src/shared/seo/__tests__/atom.test.ts`
Expected: FAIL — `atom.ts` doesn't exist yet.

- [ ] **Step 3: Implement `src/shared/seo/atom.ts`**

```typescript
/**
 * Atom 1.0 feed builder for Estrevia.
 *
 * Atom is preferred over RSS 2.0:
 *   - W3C standard (RFC 4287); strict and validated
 *   - Better date handling (xsd:dateTime ISO 8601)
 *   - Required <id> per entry — unambiguous deduplication
 *   - `<summary>` vs `<content>` separation (we only emit summary)
 *
 * All XML output goes through escapeXml() — never string-concat raw content.
 */

const XML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => XML_ESCAPE_MAP[ch] ?? ch);
}

export interface AtomEntry {
  title: string;
  summary: string;
  link: string;
  /** ISO date string (YYYY-MM-DD) or full ISO 8601. */
  published: string;
  /** ISO date string (YYYY-MM-DD) or full ISO 8601. */
  updated: string;
}

export interface AtomFeedOptions {
  feedUrl: string;
  siteUrl: string;
  title: string;
  subtitle: string;
  locale: 'en' | 'es';
  updated: Date;
  entries: AtomEntry[];
  /** Defaults to "Estrevia" — Organization-level author per spec decision #1. */
  authorName?: string;
}

function toIsoString(input: string): string {
  // Accept "YYYY-MM-DD" → midnight UTC, or pre-formed ISO 8601
  const date = input.length === 10 ? new Date(`${input}T00:00:00Z`) : new Date(input);
  return date.toISOString();
}

export function buildAtomFeed(options: AtomFeedOptions): string {
  const {
    feedUrl,
    siteUrl,
    title,
    subtitle,
    locale,
    updated,
    entries,
    authorName = 'Estrevia',
  } = options;

  const entryXml = entries
    .map(
      (e) => `  <entry>
    <id>${escapeXml(e.link)}</id>
    <title>${escapeXml(e.title)}</title>
    <link rel="alternate" href="${escapeXml(e.link)}"/>
    <summary>${escapeXml(e.summary)}</summary>
    <published>${toIsoString(e.published)}</published>
    <updated>${toIsoString(e.updated)}</updated>
  </entry>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${locale}">
  <id>${escapeXml(feedUrl)}</id>
  <title>${escapeXml(title)}</title>
  <subtitle>${escapeXml(subtitle)}</subtitle>
  <link rel="self" href="${escapeXml(feedUrl)}"/>
  <link rel="alternate" href="${escapeXml(siteUrl)}"/>
  <updated>${updated.toISOString()}</updated>
  <author><name>${escapeXml(authorName)}</name></author>
${entryXml}
</feed>`;
}
```

- [ ] **Step 4: Run test (must pass)**

Run: `npx vitest run src/shared/seo/__tests__/atom.test.ts`
Expected: PASS — all 16+ assertions green.

- [ ] **Step 5: Write the EN route test**

Test `src/app/feed.xml/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/modules/esoteric/lib/essays', () => ({
  getAllEssays: vi.fn((locale?: string) => {
    if (locale === 'es') {
      return [
        { slug: 'sun-in-aries', title: 'Sol en Aries', description: 'Sol sideral en Aries', publishedAt: '2024-01-15', updatedAt: '2024-01-20' },
      ];
    }
    return [
      { slug: 'sun-in-aries', title: 'Sun in Aries', description: 'Sidereal sun in Aries', publishedAt: '2024-01-15', updatedAt: '2024-01-20' },
      { slug: 'sun-in-taurus', title: 'Sun in Taurus', description: 'Sidereal sun in Taurus', publishedAt: '2024-02-10', updatedAt: '2024-02-15' },
    ];
  }),
}));

import { GET } from '../route';

describe('GET /feed.xml (EN)', () => {
  it('returns 200 with application/atom+xml', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/atom+xml');
  });

  it('contains all EN essays', async () => {
    const response = await GET();
    const xml = await response.text();
    expect(xml).toContain('<title>Sun in Aries</title>');
    expect(xml).toContain('<title>Sun in Taurus</title>');
  });

  it('does not contain ES essays', async () => {
    const response = await GET();
    const xml = await response.text();
    expect(xml).not.toContain('Sol en Aries');
  });

  it('uses absolute URLs to en pages', async () => {
    const response = await GET();
    const xml = await response.text();
    expect(xml).toContain('https://estrevia.app/essays/sun-in-aries');
  });

  it('declares xml:lang="en"', async () => {
    const response = await GET();
    const xml = await response.text();
    expect(xml).toContain('xml:lang="en"');
  });

  it('caches with public, max-age', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toContain('public');
  });
});
```

- [ ] **Step 6: Run test (must fail — route doesn't exist)**

Run: `npx vitest run src/app/feed.xml/__tests__/route.test.ts`
Expected: FAIL — `../route` doesn't exist.

- [ ] **Step 7: Implement EN route `src/app/feed.xml/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getAllEssays } from '@/modules/esoteric/lib/essays';
import { SITE_URL } from '@/shared/seo/constants';
import { buildAtomFeed, type AtomEntry } from '@/shared/seo/atom';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Content-Type': 'application/atom+xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
};

export async function GET(): Promise<Response> {
  const essays = getAllEssays('en');

  const entries: AtomEntry[] = essays.map((e) => ({
    title: e.title,
    summary: e.description,
    link: `${SITE_URL}/essays/${e.slug}`,
    published: e.publishedAt,
    updated: e.updatedAt,
  }));

  const feedUpdated =
    entries.length > 0
      ? new Date(
          Math.max(...entries.map((e) => new Date(e.updated.length === 10 ? `${e.updated}T00:00:00Z` : e.updated).getTime())),
        )
      : new Date();

  const xml = buildAtomFeed({
    feedUrl: `${SITE_URL}/feed.xml`,
    siteUrl: SITE_URL,
    title: 'Estrevia — Sidereal Astrology Essays',
    subtitle: 'Planet-in-sign interpretations using Lahiri ayanamsa.',
    locale: 'en',
    updated: feedUpdated,
    entries,
  });

  return new NextResponse(xml, { status: 200, headers: CACHE_HEADERS });
}
```

- [ ] **Step 8: Run EN test (must pass)**

Run: `npx vitest run src/app/feed.xml/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the ES route test**

Test `src/app/[locale]/feed.xml/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/modules/esoteric/lib/essays', () => ({
  getAllEssays: vi.fn((locale?: string) => {
    if (locale === 'es') {
      return [
        { slug: 'sun-in-aries', title: 'Sol en Aries', description: 'Sol sideral en Aries', publishedAt: '2024-01-15', updatedAt: '2024-01-20' },
      ];
    }
    return [];
  }),
}));

import { GET } from '../route';

describe('GET /[locale]/feed.xml — ES', () => {
  it('returns 200 with ES essays for locale=es', async () => {
    const response = await GET(new Request('https://estrevia.app/es/feed.xml'), { params: Promise.resolve({ locale: 'es' }) });
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('<title>Sol en Aries</title>');
  });

  it('uses /es/essays/ URLs', async () => {
    const response = await GET(new Request('https://estrevia.app/es/feed.xml'), { params: Promise.resolve({ locale: 'es' }) });
    const xml = await response.text();
    expect(xml).toContain('https://estrevia.app/es/essays/sun-in-aries');
  });

  it('declares xml:lang="es"', async () => {
    const response = await GET(new Request('https://estrevia.app/es/feed.xml'), { params: Promise.resolve({ locale: 'es' }) });
    const xml = await response.text();
    expect(xml).toContain('xml:lang="es"');
  });

  it('returns 404 for unsupported locale', async () => {
    const response = await GET(new Request('https://estrevia.app/fr/feed.xml'), { params: Promise.resolve({ locale: 'fr' }) });
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 10: Implement ES route `src/app/[locale]/feed.xml/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getAllEssays } from '@/modules/esoteric/lib/essays';
import { SITE_URL } from '@/shared/seo/constants';
import { buildAtomFeed, type AtomEntry } from '@/shared/seo/atom';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Content-Type': 'application/atom+xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await context.params;

  if (!routing.locales.includes(locale as 'en' | 'es')) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // EN root feed lives at /feed.xml — redirect or 404 the locale variant for EN to avoid duplicate canonical
  if (locale === 'en') {
    return NextResponse.redirect(`${SITE_URL}/feed.xml`, 308);
  }

  const essays = getAllEssays(locale);

  const entries: AtomEntry[] = essays.map((e) => ({
    title: e.title,
    summary: e.description,
    link: `${SITE_URL}/${locale}/essays/${e.slug}`,
    published: e.publishedAt,
    updated: e.updatedAt,
  }));

  const feedUpdated =
    entries.length > 0
      ? new Date(
          Math.max(...entries.map((e) => new Date(e.updated.length === 10 ? `${e.updated}T00:00:00Z` : e.updated).getTime())),
        )
      : new Date();

  const titleByLocale: Record<string, { title: string; subtitle: string }> = {
    es: {
      title: 'Estrevia — Ensayos de Astrología Sideral',
      subtitle: 'Interpretaciones planeta en signo usando el ayanamsa Lahiri.',
    },
  };

  const meta = titleByLocale[locale] ?? titleByLocale.es;

  const xml = buildAtomFeed({
    feedUrl: `${SITE_URL}/${locale}/feed.xml`,
    siteUrl: `${SITE_URL}/${locale}`,
    title: meta.title,
    subtitle: meta.subtitle,
    locale: locale as 'en' | 'es',
    updated: feedUpdated,
    entries,
  });

  return new NextResponse(xml, { status: 200, headers: CACHE_HEADERS });
}
```

- [ ] **Step 11: Run ES test (must pass)**

Run: `npx vitest run src/app/[locale]/feed.xml/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 12: Add `<link rel="alternate" type="application/atom+xml">` to layout**

Modify `src/app/[locale]/layout.tsx` — find the `generateMetadata` or static `metadata` export. Add to the returned metadata:

```typescript
alternates: {
  ...existing,
  types: {
    'application/atom+xml': locale === 'es'
      ? `${SITE_URL}/es/feed.xml`
      : `${SITE_URL}/feed.xml`,
  },
},
```

If `alternates` is built by `createMetadata()` from `src/shared/seo/metadata.ts`, extend that helper to accept a `feedUrl` option and include `types` accordingly. (The spec considers either approach acceptable; pick the path that requires the smallest blast radius.)

- [ ] **Step 13: Verify middleware excludes /feed.xml**

Read `src/middleware.ts`. The matcher should exclude `/feed.xml` and `/[locale]/feed.xml`. The current matcher likely uses `'/((?!_next|api|...).*)'` pattern. Add explicit exclusions:

```typescript
matcher: ['/((?!_next|api|opengraph-image|feed\\.xml|sitemap|robots|.*\\.).*)']
```

Or: add `/feed.xml` and `/(en|es)/feed.xml` to the public routes list if Clerk has one. Verify with: `curl -I http://localhost:3000/feed.xml` → 200 (not 307 redirect to sign-in).

- [ ] **Step 14: Manual smoke**

Run: `npm run dev`
Visit:
- http://localhost:3000/feed.xml → renders Atom XML with EN essays
- http://localhost:3000/es/feed.xml → renders Atom XML with ES essays

View page source of http://localhost:3000/ → contains `<link rel="alternate" type="application/atom+xml" href="https://estrevia.app/feed.xml">`.
View page source of http://localhost:3000/es → contains the ES feed link.

- [ ] **Step 15: Run full test + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 16: Commit**

```bash
git add src/shared/seo/atom.ts src/shared/seo/__tests__/atom.test.ts \
        src/app/feed.xml/route.ts src/app/feed.xml/__tests__/route.test.ts \
        src/app/[locale]/feed.xml/route.ts src/app/[locale]/feed.xml/__tests__/route.test.ts \
        src/app/[locale]/layout.tsx \
        src/middleware.ts
git commit -m "feat(seo-aeo/T2): Atom 1.0 feeds for EN+ES essays + head links"
```

---

## Task 3: OpenAPI 3.1 spec at `/api/v1/docs`

**Files:**
- Create: `src/app/api/v1/docs/route.ts`
- Create: `src/app/api/v1/docs/__tests__/route.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test**

Test `src/app/api/v1/docs/__tests__/route.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GET } from '../route';

describe('GET /api/v1/docs', () => {
  it('returns 200 with application/json', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('returns valid OpenAPI 3.1 JSON', async () => {
    const response = await GET();
    const spec = await response.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe('Estrevia Public API');
    expect(typeof spec.info.version).toBe('string');
    expect(spec.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('declares production server URL', async () => {
    const response = await GET();
    const spec = await response.json();
    expect(spec.servers).toBeDefined();
    expect(spec.servers[0].url).toBe('https://estrevia.app');
  });

  it('documents /api/v1/sidereal/sun-sign GET with all responses', async () => {
    const response = await GET();
    const spec = await response.json();
    const path = spec.paths['/api/v1/sidereal/sun-sign'];
    expect(path).toBeDefined();
    expect(path.get).toBeDefined();
    expect(path.get.responses['200']).toBeDefined();
    expect(path.get.responses['400']).toBeDefined();
    expect(path.get.responses['429']).toBeDefined();
    expect(path.get.responses['500']).toBeDefined();
  });

  it('documents date and ayanamsa query parameters', async () => {
    const response = await GET();
    const spec = await response.json();
    const params = spec.paths['/api/v1/sidereal/sun-sign'].get.parameters;
    const dateParam = params.find((p: { name: string }) => p.name === 'date');
    const ayanamsaParam = params.find((p: { name: string }) => p.name === 'ayanamsa');
    expect(dateParam).toBeDefined();
    expect(dateParam.required).toBe(true);
    expect(dateParam.schema.type).toBe('string');
    expect(dateParam.schema.pattern).toBe('^\\d{4}-\\d{2}-\\d{2}$');
    expect(ayanamsaParam).toBeDefined();
    expect(ayanamsaParam.required).toBe(false);
  });

  it('declares rate limit via x-ratelimit extension', async () => {
    const response = await GET();
    const spec = await response.json();
    const op = spec.paths['/api/v1/sidereal/sun-sign'].get;
    expect(op['x-ratelimit']).toBeDefined();
    expect(op['x-ratelimit'].limit).toBe(10);
    expect(op['x-ratelimit'].window).toBe('1m');
  });

  it('defines SiderealSunSignResponse schema', async () => {
    const response = await GET();
    const spec = await response.json();
    const schema = spec.components.schemas.SiderealSunSignResponse;
    expect(schema).toBeDefined();
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('sign');
    expect(schema.properties.sign.type).toBe('string');
  });

  it('caches with public, max-age', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toContain('public');
  });
});
```

- [ ] **Step 2: Run test (must fail)**

Run: `npx vitest run src/app/api/v1/docs/__tests__/route.test.ts`
Expected: FAIL — `../route` doesn't exist.

- [ ] **Step 3: Implement route `src/app/api/v1/docs/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { SITE_URL } from '@/shared/seo/constants';
import packageJson from '../../../../../package.json' with { type: 'json' };

export const runtime = 'nodejs';

/**
 * GET /api/v1/docs
 *
 * Returns the OpenAPI 3.1 specification for Estrevia's public API.
 *
 * Initial coverage (MVP):
 *   - GET /api/v1/sidereal/sun-sign
 *
 * Auth-gated endpoints (Clerk JWT) are intentionally NOT documented here —
 * they are private CRUD endpoints for authenticated users, not a public API.
 *
 * As more public endpoints come online, extend the `paths` object below.
 */
export function GET(): Response {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Estrevia Public API',
      version: packageJson.version,
      description:
        'Public API for Estrevia — sidereal astrology platform. ' +
        'All endpoints use Lahiri ayanamsa. Rate-limited per IP.',
      contact: {
        name: 'Estrevia Support',
        email: 'support@estrevia.app',
        url: SITE_URL,
      },
      license: {
        name: 'AGPL-3.0',
        url: 'https://www.gnu.org/licenses/agpl-3.0.en.html',
      },
    },
    servers: [
      { url: SITE_URL, description: 'Production' },
    ],
    paths: {
      '/api/v1/sidereal/sun-sign': {
        get: {
          summary: 'Get sidereal Sun sign for a given date',
          description:
            'Returns the sidereal Sun sign (Lahiri ayanamsa) for a calendar date. ' +
            'Used by the sun-sign mini-widget on /sidereal-{sign}-dates pages.',
          tags: ['Astrology'],
          parameters: [
            {
              name: 'date',
              in: 'query',
              required: true,
              description: 'Date in YYYY-MM-DD format (Gregorian).',
              schema: {
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                example: '1990-03-15',
              },
            },
            {
              name: 'ayanamsa',
              in: 'query',
              required: false,
              description: 'Ayanamsa system. Only "lahiri" is supported (MVP).',
              schema: {
                type: 'string',
                enum: ['lahiri'],
                default: 'lahiri',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Sidereal Sun sign successfully calculated.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SiderealSunSignSuccess' },
                },
              },
            },
            '400': {
              description: 'Invalid date or ayanamsa parameter.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiError' },
                  examples: {
                    invalidDate: { value: { success: false, data: null, error: 'invalid_date' } },
                    invalidAyanamsa: { value: { success: false, data: null, error: 'invalid_ayanamsa' } },
                  },
                },
              },
            },
            '429': {
              description: 'Rate limit exceeded (10 req/min/IP).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiError' },
                },
              },
            },
            '500': {
              description: 'Computation error (Swiss Ephemeris failure).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiError' },
                },
              },
            },
          },
          'x-ratelimit': { limit: 10, window: '1m', scope: 'ip' },
        },
      },
    },
    components: {
      schemas: {
        SiderealSunSignSuccess: {
          type: 'object',
          required: ['success', 'data', 'error'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { $ref: '#/components/schemas/SiderealSunSignResponse' },
            error: { type: 'null' },
          },
        },
        SiderealSunSignResponse: {
          type: 'object',
          required: ['sign', 'startDate', 'endDate', 'ayanamsa', 'year'],
          properties: {
            sign: {
              type: 'string',
              description: 'Sidereal sign name (English).',
              enum: [
                'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
                'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
              ],
            },
            startDate: { type: 'string', format: 'date-time', description: 'Sign window start (ISO 8601 UTC).' },
            endDate: { type: 'string', format: 'date-time', description: 'Sign window end (ISO 8601 UTC).' },
            ayanamsa: { type: 'string', example: 'lahiri' },
            year: { type: 'integer', example: 1990 },
          },
        },
        ApiError: {
          type: 'object',
          required: ['success', 'data', 'error'],
          properties: {
            success: { type: 'boolean', enum: [false] },
            data: { type: 'null' },
            error: { type: 'string', description: 'Error code or human-readable message.' },
          },
        },
      },
    },
  };

  return new NextResponse(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
```

- [ ] **Step 4: Run test (must pass)**

Run: `npx vitest run src/app/api/v1/docs/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

Run: `npm run dev`
Visit: http://localhost:3000/api/v1/docs → JSON spec renders.
Optionally paste into https://editor.swagger.io/ to render the spec UI.

- [ ] **Step 6: Verify robots.txt allows /api/v1/docs**

Read `src/app/robots.ts`. Currently it disallows `/api/` then explicitly allows `/api/og/`. We need to also allow `/api/v1/docs` (and ideally `/api/v1/sidereal/sun-sign` since that's now publicly documented).

Modify `src/app/robots.ts` to add another rule:

```typescript
{
  userAgent: '*',
  allow: ['/api/og/', '/api/v1/docs', '/api/v1/sidereal/'],
}
```

(Adjust the existing rule structure — `allow` accepts an array.)

- [ ] **Step 7: Run lint + typecheck**

Run: `npm run typecheck && npm run lint`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/v1/docs/route.ts \
        src/app/api/v1/docs/__tests__/route.test.ts \
        src/app/robots.ts
git commit -m "feat(seo-aeo/T3): OpenAPI 3.1 spec at /api/v1/docs + robots.txt allow"
```

---

## Wrap-up: cross-task verification

After all 3 tasks land, verify holistically:

- [ ] `curl -I https://estrevia.app/llms.txt` → 200, text content
- [ ] `curl -I https://estrevia.app/feed.xml` → 200, application/atom+xml
- [ ] `curl -I https://estrevia.app/es/feed.xml` → 200, application/atom+xml
- [ ] `curl -I https://estrevia.app/api/v1/docs` → 200, application/json
- [ ] Submit `/feed.xml` to W3C Feed Validator: https://validator.w3.org/feed/
- [ ] Submit `/api/v1/docs` to https://editor.swagger.io/ (paste JSON) → renders without errors
- [ ] Update sitemap if appropriate — `feed.xml` and `llms.txt` are typically NOT in sitemap (they're discovery files, not content), but `/api/v1/docs` could be added if we want LLM crawlers to find it via sitemap too. Defer this judgment call to founder review.
