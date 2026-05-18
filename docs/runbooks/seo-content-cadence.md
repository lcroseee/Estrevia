# SEO Content Cadence — Founder Runbook

**Goal:** Sustain 1 essay/week + ongoing extension of Wave 3 SEO infrastructure.

**Pre-conditions:**
- Wave 3 Section 3 deployed (commits Tn for /compatibility + /planetary-hours-cities + AEO schema).
- Founder writes content async; engineer-shipped factual stubs remain valid baseline.

## Weekly cadence (target: 30-60 min)

### 1. Publish 1 essay (low-competition keyword)

Topic queue suggestions (rotate):

- "Sidereal vs tropical: 5 myths that need to die" (EN)
- "Qué dicen las nakshatras sobre tu Sol sideral" (ES)
- "Planetary hours for new-moon manifestation" (EN)
- "Dashas: cómo el tiempo sideral predice fases vitales" (ES)
- "Lahiri vs Krishnamurti: which sidereal ayanamsa is right?" (EN)
- "Tu Mercurio retrógrado en sideral: por qué difiere del tropical" (ES)

Format: ≥1500 words, brand voice (no AI-slop — see `[[feedback-anti-ai-slop]]`), include 1 internal link to `/compatibility/[pair]` or `/planetary-hours-cities/[city]` pages.

Store under `content/essays/{en|es}/<slug>.mdx`. Existing sitemap auto-picks it up via `getAllEssaySlugs()`.

### 2. Extend compatibility pair prose (optional)

The 78 `/compatibility/[pair]` pages ship with factual stub content (element, modality, ruler, aspect). To add brand-voice prose:

- Open `src/app/[locale]/(marketing)/compatibility/[pair]/page.tsx`
- Add a `pairProse: Record<string, { en: string; es: string }>` constant keyed by canonical slug (e.g. `'aries-leo'`)
- Render below the existing `<dl>` when entry exists

Founder is free to add 3-5 pair prose entries per week. Engineer-shipped stub remains the fallback for the other 73 pairs.

### 3. Extend FAQ Q/A on /pricing and /sidereal-dates root

Currently `faqSchema()` injection lives only on `/why-sidereal` (Wave 3 proof-of-pattern). To extend:

- Identify 3-5 Q/A pairs per page that real users ask (replies to `[[feedback-meta-page-selector-gotcha]]` lead emails are a source).
- Import `faqSchema` and `JsonLdScript` from `@/shared/seo` in the target page.
- Add `<JsonLdScript schema={faqSchema([{ question, answer }, ...])} />` to the returned JSX.
- Localize for ES under the same pattern.

### 4. Add new astrological DefinedTerm entries

Beyond the initial 3 (Lahiri ayanamsa, sidereal astrology, Vedic astrology), extend to e.g.:

- "Nakshatra" — 27-segment sidereal lunar mansions
- "Dasha" — Vedic timing system
- "Yoga" (astrological) — planetary combinations

Pattern: same `definedTermSchema()` injection on the page where the term is canonically defined (usually `/why-sidereal` or a dedicated `/glossary` page Wave 3.5+).

## Monthly review

- [ ] Search Console: top 10 organic queries — match to essay topics? add if gap.
- [ ] Search Console: pages with impressions but 0 clicks — improve title/description in `createMetadata()`.
- [ ] PostHog AEO referrers (chatgpt.com / perplexity.ai / claude.ai / gemini.google.com) — note which pages they cite, prioritize Q/A extensions on those.

## When to ask for engineer help

- A new pair-prose pattern (e.g. interactive widget per pair) — file a Wave 3.5 spec.
- A bulk Q/A injection script — currently manual; can be batched in 1 spec.
- New programmatic SEO page type (e.g. moon-phase by city, by date) — Wave 4 candidate.

## Cross-references

- Spec §6: `docs/superpowers/specs/2026-05-17-wave-3-compound-growth-design.md`
- Anti-AI-slop: [[feedback-anti-ai-slop]]
- Spanish style: [[feedback-spanish-style]]
- SEO Phase 2 baseline: [[project-seo-phase2-shipped]]
