# Cluster B — SEO/AEO Basics Design

**Status:** Approved (compressed brainstorm — direct execution per founder request 2026-05-03)
**Date:** 2026-05-03
**Source:** May-3 audit, Cluster B (items #1-3; #4 author attribution dropped per founder direction)

## Goal

Close 3 SEO/AEO foundation gaps in a single sub-project so essays + the public API surface are discoverable by both classical search crawlers and AI engines (Perplexity, Claude, ChatGPT, Bing/Copilot).

1. `/public/llms.txt` — explicit citation grant + content licensing for AI crawlers
2. RSS/Atom feeds (EN + ES) — distribute 121 + 120 essays via Feedly, Substack imports, IFTTT, RSS clients
3. OpenAPI 3.1 spec at `/api/v1/docs` — machine-readable API documentation for LLM crawlers

**Dropped (May-3 audit item #4):** E-E-A-T `author` / `reviewedBy` in essay frontmatter + `Person` schema upgrade. Per founder direction 2026-05-03: "авторство не нужно" — keep Organization-level attribution.

## Architecture

### Task 1 — `/public/llms.txt`
Static Markdown file following the [llmstxt.org](https://llmstxt.org/) spec: H1 with site name, blockquote summary, "Optional" sections linking to the API docs (`/api/v1/docs`), the RSS feeds (`/feed.xml`, `/es/feed.xml`), the sitemap, and the content license statement.

Served as a static asset by Vercel (no Next.js route required). Already excluded from middleware since `/public/` files are served directly.

### Task 2 — RSS Atom feeds
Two routes:
- `src/app/feed.xml/route.ts` → EN essays Atom feed (default locale, root URL)
- `src/app/[locale]/feed.xml/route.ts` → handles `/es/feed.xml` (and any future locale)

Both serve **Atom 1.0** XML (modern; W3C standard; better date precision than RSS 2.0; aggregators support both equally).

Item shape (per essay):
- `<title>` — frontmatter `title`
- `<summary>` — frontmatter `description`
- `<link href={SITE_URL/locale/essays/slug}/>`
- `<id>` — same as link (Atom requires globally unique ID)
- `<published>` — frontmatter `publishedAt`
- `<updated>` — frontmatter `updatedAt`
- `<author><name>Estrevia</name></author>` — Organization-level (per founder direction, no per-author attribution)

Linked from each locale's `<head>` via `<link rel="alternate" type="application/atom+xml">` injected through the layout's `metadata.alternates.types` map (Next.js App Router pattern).

### Task 3 — OpenAPI 3.1 at `/api/v1/docs`
Single route `src/app/api/v1/docs/route.ts` returning OpenAPI 3.1 JSON. Initial coverage: only the truly public endpoint `/api/v1/sidereal/sun-sign` (the only v1 route with rate-limit-only auth, no Clerk JWT).

Spec structure: `info` (title, version, contact email), `servers` (production URL), `paths` (sun-sign GET with all params/responses + rate-limit `x-` extension), `components.schemas` for the response payload type.

Validated against OpenAPI 3.1 schema in tests using a JSON-Schema validator (or hand-rolled assertions on shape).

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Author attribution = Organization (`Estrevia`), not Person | Per founder direction; no per-author surface in MVP |
| 2 | OpenAPI initial scope = `sun-sign` only | Only truly public endpoint; auth-gated routes excluded by design |
| 3 | RSS = Atom 1.0, not RSS 2.0 | Better date handling (xsd:dateTime); W3C standard; modern aggregators support both |
| 4 | RSS scope = essays only | Signs/tarot are pillar pages, not time-sequenced; not feed-appropriate |
| 5 | `llms.txt` minimal variant only (no `llms-full.txt`) | The longer variant is for content full-text dump; not needed at MVP |
| 6 | RSS `<author>` = `Estrevia` (Organization name) | Consistent with Decision #1 |

## Out of scope

- Programmatic SEO expansion (planet-in-house, aspects, sidereal-by-date) — Cluster C
- E-E-A-T per-essay `author` / `reviewedBy` frontmatter (audit item #4) — dropped per founder
- `Person` schema upgrade in `articleSchema()` — dropped per founder
- `/about/editorial-team` page — dropped per founder
- `llms-full.txt` (the full content dump variant) — only minimal `llms.txt` for now
- Documenting auth-gated endpoints in OpenAPI — deferred until they become public

## Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R1 | Atom XML escaping (descriptions may contain `&`, `<`, smart quotes) | Hand-rolled `escapeXml()` helper or `xmlbuilder2`; never string-concat raw content |
| R2 | OpenAPI 3.1 schema completeness | Validate response in tests against schema (or hand-rolled assertions on shape) |
| R3 | Clerk middleware intercepts `/feed.xml` | Verify middleware matcher excludes `/feed.xml` and `/es/feed.xml`; same pattern as `/api/og/*` and `/opengraph-image` |
| R4 | `<link rel="alternate">` cross-linking locales | EN page links EN feed; ES page links ES feed; per-locale conditional in layout metadata |
| R5 | Atom feed must validate against W3C Feed Validator | Test with `fast-xml-parser` or equivalent; assert namespace, required elements (id, title, updated, author, entry) |

## Testing

| Task | Test Coverage |
|------|---------------|
| T1 | File exists at `/public/llms.txt`; H1 starts with "Estrevia"; URLs are absolute (production domain); contains links to `/api/v1/docs`, `/feed.xml`, `/es/feed.xml`, `/sitemap.xml` |
| T2 | Both routes return 200 with `application/atom+xml`; valid Atom 1.0 XML (parse with `fast-xml-parser`); all 121 EN essays in EN feed; all 120 ES essays in ES feed; cross-locale links don't leak; `<published>` matches frontmatter `publishedAt`; XML escaping correct on a fixture essay with `&`, `<`, smart quotes |
| T3 | Route returns 200 with `application/json`; valid OpenAPI 3.1 JSON; `paths` includes `/api/v1/sidereal/sun-sign` with `400`, `429`, `500` responses; `info.version` matches `package.json`; query params `date` and `ayanamsa` documented with correct types |

## Files affected

| Task | Files Created | Files Modified |
|------|---------------|----------------|
| T1 | `public/llms.txt` | — |
| T2 | `src/app/feed.xml/route.ts`, `src/app/[locale]/feed.xml/route.ts`, tests | `src/app/[locale]/layout.tsx` (head links), `src/middleware.ts` (matcher) |
| T3 | `src/app/api/v1/docs/route.ts`, tests | — |

## Parallelization safety

All 3 tasks have **disjoint file scopes** — they can run in parallel without conflicts:
- T1: only `public/llms.txt`
- T2: only `src/app/feed.xml/`, `src/app/[locale]/feed.xml/`, `src/app/[locale]/layout.tsx`, `src/middleware.ts`
- T3: only `src/app/api/v1/docs/`

No cross-task contracts to lock — fully independent.
