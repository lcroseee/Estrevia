# Cosmic Portrait — selfie-referenced AI avatar driven by the natal chart

**Date:** 2026-08-02
**Status:** Approved for planning
**Supersedes:** nothing. Extends the shipped abstract AI Avatar feature.

---

## 1. Summary

Add a second mode — **Portrait** — to the existing AI Avatar feature. The user uploads a
selfie; the system generates a stylized cosmic portrait that preserves their facial
structure, hair, and characteristic features while theming colour, symbol, and element
from their natal chart via the proprietary 777 correspondences.

Portrait mode is **Pro-only**. The existing **Abstract** mode is unchanged and remains
free at 3 generations/month.

The uploaded selfie is **never written to disk**. It is held in the browser tab for the
session, sent in the request body, forwarded to the model, and discarded.

---

## 2. Baseline — verified repository state

Every claim below was verified against the repo on 2026-08-02. File:line references are
exact at that commit.

### 2.1 An AI Avatar feature already ships, and it is deliberately faceless

| Fact | Evidence |
|---|---|
| Prompt forbids faces | `src/modules/astro-engine/avatar-prompt.ts:74` and `:89` both end: `"... No text, no face, no human features. Square format, mystical and ethereal."` |
| Model is text-to-image only | `src/app/api/v1/avatar/generate/route.ts:177` → `imagen-4.0-fast-generate-001:predict`; body is `instances: [{ prompt }]` |
| Quota | `route.ts:83` → `checkAndIncrementUsage(userId, 'avatar', 'month', 3)`; premium skips the branch entirely |
| Output is not persisted | `route.ts:225` — `// TODO: Upload to Vercel Blob for persistent storage instead of returning base64 inline.` Response returns `imageBase64` |
| Sold on the pricing page | `messages/en.json:1023` `"3 AI avatars per month"`, `:1035` `"Unlimited AI avatars, all 4 styles"` |
| `saveToProfile` is dead copy | Present in `messages/en.json:1349` and `messages/es.json:1353`; zero implementation in `src/` |
| Only `color.king` is used | `avatar-prompt.ts:80` — `const dominantColor = sunCorr.color.king.toLowerCase();` |

Portrait mode is therefore **not** a parameter on the shipped feature. It is a second
mode that inverts the shipped feature's central constraint.

### 2.2 Model capability — confirmed against the live API

`GET /v1beta/models` with the project's `GEMINI_API_KEY` (2026-08-02):

| Model | Method | Consequence |
|---|---|---|
| `imagen-4.0-fast-generate-001`, `imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001` | `predict` | Text-only input. Cannot accept a selfie. |
| `gemini-3.1-flash-image` | `generateContent` | GA. Multimodal input → image output. **Chosen.** |
| `gemini-3-pro-image`, `gemini-2.5-flash-image`, `gemini-3.1-flash-lite-image` | `generateContent` | Alternatives; not used in v1. |

Contract smoke test against `gemini-3.1-flash-image` with a synthetic 8×8 PNG (no PII):

```
HTTP 200
parts: text | inlineData(image/jpeg, 1004280 b64 chars)
promptTokensDetails:    [ TEXT 19, IMAGE 258 ]
candidatesTokensDetails:[ IMAGE 1120 ]
finishReason: STOP
```

Two consequences that bind the implementation:

1. The response contains **both** a text part and an image part. The parser MUST locate
   the part carrying `inlineData` and MUST NOT assume `parts[0]`.
2. The returned image is ~750 KB. Returning it inline as base64 would produce a ~1 MB
   JSON response. It goes to Blob storage instead.

### 2.3 Reusable infrastructure

| Asset | Location | Signature / note |
|---|---|---|
| Monthly quota | `src/shared/lib/usage.ts:91` | `checkAndIncrementUsage(userId, feature, period, limit, now?)` → `{allowed, count, limit}`. Atomic `onConflictDoUpdate` with `setWhere: count < limit`. Generic on the `feature` string. |
| Quota refund | `src/shared/lib/usage.ts:138` | `decrementUsage(...)` |
| Premium gate | `src/modules/auth/lib/premium.ts:36,61` | `isPremium(userId)`, `requirePremium()` |
| Rate limiting | `src/shared/lib/rate-limit.ts:172` | `getRateLimiter(endpoint)`. Registry entries are `new Ratelimit({redis, limiter: Ratelimit.slidingWindow(n,'1m'), prefix})`. |
| Image-in-to-Gemini, working today | `src/modules/advertising/creative-gen/safety/vision-checker.ts:65` | `model.generateContent([{inlineData:{data:base64,mimeType}}, prompt])` — exactly the call shape Portrait needs. |
| 777 lookups | `src/modules/esoteric/lib/correspondences.ts` | `getBySign()`, `getByPlanet()` over `content/correspondences/777.json` |
| Chart → symbols | `src/modules/astro-engine/passport.ts` | `generatePassport(chart)` → `{sunSign, moonSign, ascendantSign, element, rulingPlanet, rarityPercent}` |
| Analytics | `src/shared/lib/analytics.ts:254-257` | `AVATAR_GENERATED`, `AVATAR_GENERATION_FAILED`, `AVATAR_QUOTA_EXHAUSTED`, `AVATAR_STYLE_LOCKED_CLICKED` |
| CSP already allows blob display | `next.config.ts:55` | `img-src` includes `https://*.public.blob.vercel-storage.com`, `data:`, `blob:` |

### 2.4 777 data shape

`content/correspondences/777.json` — 22 path entries plus sephiroth. Per-entry keys:

```
path, hebrewLetter, hebrewSymbol, meaning, tarotTrump, tarotNumber,
element, zodiacOrPlanet, color{king,queen,prince,princess},
stone, perfume, plant, animal, astrologicalAttribution
```

All four Golden Dawn colour scales are present. Example:
`{"king":"Bright pale yellow","queen":"Sky blue","prince":"Blue emerald green","princess":"Emerald flecked gold"}`

Three of the four scales are currently unused by any code.

### 2.5 Gaps that Portrait mode must fill

Verified absences — these are zero, not thin:

| Missing | Evidence |
|---|---|
| Any file upload path | `grep -rE 'type="file"\|formData()\|multipart' src/` → 0 hits |
| Any gender concept | `grep -riE '\bgender\b' src/ messages/` → 0 hits |
| Any image-to-image call | Only concrete client types its model as `'imagen-4-fast' \| 'imagen-4-ultra'`; `reference_images` is declared in `src/shared/types/advertising/creative.ts:57` and forwarded by `nano-banana.ts:35` but has **no wire implementation** |
| Persistence for generated avatars | `route.ts:225` TODO; no `avatars` table in `drizzle/*.sql` |
| Blob deletion | `del` / `list` / `head` from `@vercel/blob` imported nowhere. Only `put`, twice, both `access: 'public'` |
| Blob cleanup on account deletion | `src/app/api/v1/user/account/route.ts:261-264` deletes exactly 4 tables; blobs survive |
| Any biometric policy | `grep -ri biometric src/ content/ messages/ docs/` → 0 hits |
| Google in the privacy policy | Processor list is Clerk, Stripe, PostHog, Neon, Vercel, Resend, Sentry, Meta. Google is **absent** despite already receiving data today |
| UGC / likeness clause in Terms | None |
| Server-readable feature flags | `useFeatureFlag` is client-only, gated behind cookie consent, zero production call sites |
| Tests for the avatar route | No test file, despite the route spending money per call |
| `maxDuration` on the avatar route | Not set |

### 2.6 Constraints adjudicated

**`CLAUDE.md:63`** — *"Image generation pipeline — provider-agnostic interface in
`src/modules/advertising/creative-gen/generators/`. Don't bypass; don't generate Cosmic
Passport cards via AI (use Satori / `@vercel/og` deterministic only)."*

Two rulings, both made by the founder in the design session:

1. **The Cosmic Passport is not touched.** No AI-generated raster is composited into
   `/api/og/passport/[id]`. That route stays a deterministic function of its DB row and
   keeps `Cache-Control: public, max-age=31536000, immutable`
   (`src/app/api/og/passport/[id]/route.tsx:36,634`). No `<img>` has ever appeared in a
   Satori layout in this repo, and none is introduced.
2. **The `generators/` bypass is repaired, not repeated.** The shipped avatar route
   currently violates the rule with a raw `fetch` at `route.ts:177`. Portrait mode does
   not inherit that. A Gemini image client is lifted into `src/shared/lib/gemini/` so
   both `advertising` and `astro-engine` consume it without a cross-module dependency
   (`CLAUDE.md` Architecture: *"No cross-module deps; depend only on `shared/`"*).

**`CLAUDE.md:62`** — *"Third-party MCP servers for PII / payments / deployment — never."*
No MCP, hosted avatar API, or third-party image service touches the selfie. Google is
reached over first-party server-side HTTP with a key from `process.env`, and is already a
processor for this project.

---

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Portrait is **Pro-only**; Abstract stays free at 3/month | Cost is bounded by subscriber count; the pricing-page promise (`en.json:1023,1035`) is kept intact; Portrait becomes a reason to hold the subscription. |
| D2 | Two **modes of one feature**, not a replacement or a separate product | Nothing shipped breaks; free users see Portrait as a locked teaser — the repo's established value-then-block pattern. |
| D3 | Chart → visuals is a **hybrid**: deterministic 777 core, model-authored prose | The correspondences are proprietary and are the moat. Locking palette and symbols makes the result reproducible and explainable; prose keeps variety. |
| D4 | The selfie is **never persisted** | Sending to a processor and storing are separate legal events; only storage carries retention, destruction, and erasure duties. Storage would also require binary encryption (`encrypt()` at `src/shared/encryption/…:87` is `string → string`, `cipher.update(plaintext,'utf8')`), private blob reads, a sweep cron, and an erasure path that does not exist. |
| D5 | The **generated portrait is persisted** to a private blob, with its own share page | A Pro feature that vanishes on page refresh is a defect. Revives the dead `saveToProfile` key. The Passport is untouched (see 2.6). |
| D6 | Gender is modelled as **presentation**, and it selects the 777 colour scale | Asks how to render rather than for gender identity — no stored personal attribute, no migration for it. Doctrinally coherent: the four scales are the four worlds and the four letters of the Tetragrammaton (Yod/Father → King, Heh/Mother → Queen, Vav/Son → Prince, Heh-final/Daughter → Princess). Puts three unused scales to work. |
| D7 | **Two passes**, shared client in `src/shared/lib/gemini/` | One vision call yields safety verdict, appearance traits, and photo-aware prose together. Repairs the `generators/` bypass rather than repeating it. |
| D8 | Face-derived data is **not stored**; chart-derived data is | Keeps "we do not keep your photo" literally true. Traits exist only inside the request and in the response payload. |

---

## 4. Architecture

### 4.1 Module layout

```
src/shared/lib/gemini/
  ├── image-client.ts     NEW — generateContent with inline image parts → Buffer
  ├── vision-client.ts    MOVED from advertising/creative-gen/safety/vision-checker.ts
  └── index.ts

src/modules/advertising/creative-gen/safety/vision-checker.ts
                          becomes a re-export of shared/lib/gemini/vision-client
                          — advertising behaviour unchanged, zero call-site edits

src/modules/astro-engine/
  ├── portrait-prompt.ts  NEW — pure prompt composition
  └── portrait-scale.ts   NEW — presentation → 777 colour scale

src/app/api/v1/avatar/portrait/route.ts        NEW — multipart, generation
src/app/api/v1/avatar/[id]/image/route.ts      NEW — authorised blob read
src/app/[locale]/s/avatar/[id]/page.tsx        NEW — share page
```

`astro-engine` never imports from `advertising`.

### 4.2 Endpoint

`POST /api/v1/avatar/portrait`, `multipart/form-data`. A separate route from
`/generate` because that route is JSON; mixing content types on one handler is a
reliable source of defects.

Fields: `file`, `presentation`, `style`, `chartId`.

`export const maxDuration = 60`.

**Style scope.** `AvatarStyle` is `'cosmic' | 'tarot' | 'geometric' | 'nebula'`
(`src/modules/astro-engine/avatar-prompt.ts:21`). Portrait mode is available for
**`cosmic` only** in v1 — this follows the founder brief verbatim ("For 'Cosmic' style —
option to upload picture of self") and matches the aesthetic: `geometric` and `nebula`
are non-figurative by construction. The route rejects any other style with
400 `STYLE_NOT_PORTRAIT_CAPABLE`. The other three styles remain abstract-only and are
unchanged.

### 4.3 Request flow

```
CLIENT
  file picked
  → canvas re-encode: JPEG, longest edge ≤ 1024px, quality 0.9
      strips EXIF (including GPS) on-device, before any upload
      ~4 MB → ~300 KB
  → File kept in React state for the tab session (regeneration needs no re-upload)
  → POST multipart

SERVER
  requireAuth()
  requirePremium()                          → 402 PRO_REQUIRED
  AVATAR_PORTRAIT_ENABLED !== 'true'        → 503 FEATURE_DISABLED
  getRateLimiter('avatar/portrait')         → 429 RATE_LIMITED
  daily global spend guard (Redis)          → 503 BUDGET_EXCEEDED
  checkAndIncrementUsage(userId,'avatar_portrait','month',30)
                                            → 402 QUOTA_EXCEEDED
  parse formData; validate magic bytes, MIME, byte size, pixel dimensions
                                            → 400 INVALID_IMAGE  (refund)

  PASS 1  gemini-2.5-flash, ~$0.0002
    → { safe, reasons[], traits{}, prose }
    !safe                                   → 422 UNSAFE_IMAGE   (refund)

  buildPortraitPrompt(...)                  pure, no network, unit-tested

  PASS 2  gemini-3.1-flash-image
    selfie as inline_data + composed prompt
    locate the part carrying inlineData     → 502 NO_IMAGE_GENERATED (refund)

  put(pathname, buffer, { access: 'private' })
  insert into avatars
  release buffers — the selfie is never written anywhere

  → 200 { id, url, palette: { scale, colors }, traitsSummary }
```

Quota is refunded on **every** failure branch after it is taken. The shipped route
already implements this pattern correctly; it is reused.

### 4.4 Pass 1 — safety and essence, in one call

`gemini-2.5-flash` returns strict JSON, zod-validated:

```ts
{
  safe: boolean,
  reasons: Array<'no_face' | 'multiple_faces' | 'likely_minor'
                | 'nsfw' | 'not_a_photo' | 'low_quality'>,
  traits: {
    hair: { texture: string; length: string; colour: string; style: string },
    face: { shape: string; jaw: string; brows: string },
    skinTone: string,
    facialHair?: string,
    glasses?: boolean,
    distinguishing?: string[],
  },
  prose: string,
}
```

**Traits are described by appearance, never by category.** "Dense spiral curls",
"warm skin tone" — not ethnic or racial classification. This is both an ethical line and
avoidance of inferring special-category data.

`prose` describes pose, atmosphere, and composition. It is constrained: it may not name
colours (those are locked by the 777 layer) and may not alter identity. Because the same
call sees the photograph, the prose is photo-aware rather than composed blind from a Sun
sign.

`likely_minor` is a hard block. No override, no styling variant, no retry path.

### 4.5 Pass 2 — prompt composition

`buildPortraitPrompt()` is pure and fully unit-testable.

**Locked layer** — deterministic, derived from 777, not selectable by the model:

```ts
scale   = presentationToScale(presentation, chart)  // king | queen | prince | princess
palette = [ getBySign(sunSign).color[scale],        // lead
            getBySign(moonSign).color[scale] ]      // accent
symbols = { tarotTrump, animal, stone, element }    // from the solar sign
metal   = sephira of the ruling planet
```

`presentationToScale`:

| Presentation | Scale |
|---|---|
| `feminine` | `queen` |
| `masculine` | `king` |
| `androgynous` | `prince` |
| `auto` (default) | from solar sign polarity — Fire/Air → `king`, Water/Earth → `queen` |

**Prose layer** — `prose` from Pass 1.

**Likeness layer** — a tuned constant, not a user control: preserve facial structure,
hair shape and texture, and characteristic features; heighten rather than replace;
never flat; the subject must read as alive. No user-facing resemblance slider in v1.

### 4.6 Persistence

Migration **0019** (`0018_discount_blast_emails.sql` is the current head).
Per project history, `db:generate` diffs from a stale `0012` snapshot and re-emits whole
tables — the generated `.sql` must be hand-trimmed to the delta with `IF NOT EXISTS`.

```
avatars
  id             text primary key          -- nanoid
  user_id        text not null references users(id)
  mode           text not null             -- 'portrait' | 'abstract'
  style          text not null
  presentation   text                      -- null for abstract
  scale          text                      -- king|queen|prince|princess
  blob_pathname  text not null
  palette        jsonb not null            -- chart-derived; safe to store
  is_shared      boolean not null default false
  created_at     timestamptz not null default now()
```

`mode` exists from the start so abstract avatars can be persisted later without a second
migration. Abstract persistence is **not** wired in this work.

**Deliberately absent: any face-derived column.** No traits, no appearance description,
no selfie reference. The boundary is stated plainly and is easy to explain to a user:
*chart-derived data is kept; face-derived data is not.*

Reads: `GET /api/v1/avatar/[id]/image` verifies owner **or** `is_shared`, then streams
from the private blob. Share page `/s/avatar/[id]` renders only when `is_shared`; its OG
image is the portrait served through that same route.

Account deletion (`src/app/api/v1/user/account/route.ts:261-264`) gains deletion of
`avatars` rows and `del()` of their blobs. This also repairs the pre-existing gap where
blobs outlive account deletion.

### 4.7 Cost ceiling and kill switch

Three independent guards, because today there are none:

1. **Own quota key** `'avatar_portrait'`, capped **including Pro** at 30/month.
   `checkAndIncrementUsage` is already generic over the feature string; no change to it.
   The current "unlimited for Pro" on a per-image-priced model is an uncapped liability.
2. **`AVATAR_PORTRAIT_ENABLED`** environment variable, read server-side. Client flags are
   unusable here: `useFeatureFlag` runs only in the browser, behind cookie consent, and
   has zero production call sites.
3. **Daily global spend guard** in Redis — a counter of Portrait generations across all
   users for the UTC day, ceiling from `AVATAR_PORTRAIT_DAILY_CAP` (default `200`).
   On breach, 503 `BUDGET_EXCEEDED`. The counter is incremented only after Pass 2
   succeeds, so rejected uploads do not consume the global budget.

Plus mandatory registration of `'avatar/portrait'` in the rate-limit registry at
3 req/min. Unregistered endpoints do not fail — they silently fall through to the default
100 req/min (`src/shared/lib/rate-limit.ts:164,170`), which on a per-call-priced endpoint
is an open tap.

### 4.8 Errors and latency

Error taxonomy follows the existing convention (`GEMINI_AUTH`, `GEMINI_QUOTA`,
`GEMINI_5XX`), extended with `PRO_REQUIRED`, `FEATURE_DISABLED`, `BUDGET_EXCEEDED`,
`INVALID_IMAGE`, `UNSAFE_IMAGE`, `NO_IMAGE_GENERATED`. Every user-facing error string
lands in both locales.

Generation is expected at 10–25 s against a 300 s Vercel function limit. **No job queue
is required**; the request is held synchronously with an honest staged waiting state.
Real latency is measured on the first run and recorded.

### 4.9 UI

`AvatarSection` gains a mode switch. Portrait for a free user renders as a locked teaser
using the existing `PaywallCta` / `PaywallModal`, which requires adding
`'avatar-portrait'` to the `PaywallTrigger` union (`src/shared/types/paywall.ts:11`,
currently `essay | celtic-cross | three-card | synastry-ai | natal-chart | generic`) plus
matching i18n keys in both locales.

A **"why this portrait"** panel shows the resolved scale and palette with their 777
provenance — the visible payoff of D3 and D6.

New analytics events follow the existing `avatar_*` convention:
`AVATAR_PORTRAIT_UPLOADED`, `AVATAR_PORTRAIT_GENERATED`, `AVATAR_PORTRAIT_REJECTED`
(with `reason`), `AVATAR_PORTRAIT_SHARED`.

---

## 5. Testing

Tests are written before implementation.

| Level | Coverage |
|---|---|
| Unit — pure | `buildPortraitPrompt` table-driven across signs × scales; `presentationToScale` including `auto` polarity; locked tokens provably present and prose provably unable to override them |
| Unit — validation | Pass-1 zod schema: valid, malformed, fenced JSON, missing fields, unknown reason codes |
| Unit — client | canvas re-encode utility: EXIF removal, dimension cap, output MIME |
| Unit — image client | `generateContent` response parsing — asserts the `inlineData` part is located when it is **not** `parts[0]`, matching the verified live response shape |
| Integration — route | Injected fake vision and image clients; every guard in 4.3 in order; quota refunded on every failure branch |
| Contract | Live `gemini-3.1-flash-image` call behind an env flag, excluded from CI |
| i18n | `scripts/qa/i18n-key-parity.test.ts` enforces both locales |
| a11y | Upload control, waiting state, and result image meet WCAG 2.1 AA |

Test fixtures use synthetic images only — never a real face.

The shipped `/api/v1/avatar/generate` route currently has no tests at all. Adding coverage
for it is **not** in scope here, but it is recorded as debt.

---

## 6. Launch blockers outside the code

These gate release; they are not follow-ups.

1. **Privacy policy** — add Google as a processor. This is an overdue debt: data already
   flows there today and it is absent from the eight-processor list. Add an image
   processing category and an explicit statement that the selfie is not retained.
2. **Terms** — there is no user-generated-content clause at all. Add: the uploader
   warrants they hold rights to the likeness; no third parties' photos; no photos of
   minors; a takedown route.
3. **Consent** — the current banner is a single localStorage flag worded for analytics
   and ad measurement. An explicit in-flow consent checkbox is required before the first
   upload.

---

## 7. Out of scope

Compositing into the Cosmic Passport · storing the selfie · persisting abstract-mode
avatars · video or animated avatars · generating several variants in one request · a
user-facing resemblance-strength control · replacing the avatar app-wide · retrofitting
tests onto the shipped abstract route.

---

## 8. Open items carried into planning

- Exact per-image cost of `gemini-3.1-flash-image` at current pricing — measure and
  record on the first live run; the 30/month Pro cap is provisional until then.
- Real end-to-end latency — measured on the first live run; if it exceeds ~45 s the
  synchronous decision in 4.8 must be revisited.
