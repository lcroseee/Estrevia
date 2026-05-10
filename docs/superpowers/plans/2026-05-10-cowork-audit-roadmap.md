# Cowork Audit Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended for parallel execution of Step 2 tracks) or superpowers:executing-plans (for serial execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the AI Content Label compliance fix (P0) plus the audit-validated subset of Cowork patches 01 / 02 / 03 to `main` within one week (2026-05-10 → 2026-05-17).

**Architecture:** Step 1 (one task, sequential, P0) closes the Meta AI Content Label compliance gap on the upload pipeline. Step 2 dispatches three parallel-eligible tracks: Track A — Patch 01 brand-policy regex + canonical palette; Track B — Patch 02 `lead_magnet` archetype + 6 new hook templates; Track C — Patch 03 12 Canva-generated anchor creatives via Canva MCP → Vercel Blob → seeded as `pre_approved`. Tracks B and C both touch `src/shared/types/advertising/creative.ts`; Track C must serialize after Track B by running `git pull` in its worktree before its final commit.

**Tech Stack:** TypeScript 6 strict, Next.js 16 App Router, vitest, Drizzle ORM + Neon Postgres, Meta Marketing API v22.0, Canva MCP server, Vercel Blob (`@vercel/blob`), tsx scripts. Direct-to-`main` workflow per CLAUDE.md.

**Parallel execution opportunity:** Tasks 2 / 3 / 4 are independent except for the shared types file. Subagent-driven execution can spawn one subagent per track in `isolation: 'worktree'` mode. Task 4 (Track C) waits for Task 3 (Track B) to land in `main`, then `git pull` in its worktree before its final commit.

**Spec:** `docs/superpowers/specs/2026-05-10-cowork-audit-roadmap-design.md` (committed `3446a47`).

**Verification report (read-only audit input):** `outputs/cowork-handoff-2026-05-10/05-verification-report.md` under the local agent-mode session directory.

---

## Task 1 — Step 1: AI Content Label compliance fix

**Files:**
- Modify: `src/modules/advertising/creative-gen/upload/meta-upload.ts` — interface @ lines 9-17, caller @ lines 81-111
- Modify: `src/modules/advertising/meta-graph-api/upload-client.ts` — method signature @ lines 9-21, `/adcreatives` POST body @ lines 52-71
- Modify: `src/modules/advertising/meta-graph-api/publish-approved-service.ts` — `ApprovedRow` @ lines 3-12
- Modify: `src/app/api/admin/creatives/publish-batch/route.ts` — `selectApproved` @ lines 57-79, `uploadCreative` @ lines 81-86
- Modify: `scripts/advertising/publish-approved.ts` — mirrors route.ts above @ lines 40-69
- Test: `src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts` — append two cases inside the existing `describe('MetaUploadClient.uploadCreative', ...)`

- [ ] **Step 1: Lock the Meta API v22.0 AI Content Label field name**

Use WebFetch on each of these URLs and search for `AI`, `creative_source`, `AI_GENERATED`, `is_ai_generated`, `GenAI`:

- `https://developers.facebook.com/docs/marketing-api/reference/ad-creative`
- `https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data/`
- `https://www.facebook.com/business/help/169003020369435` (AI content disclosure policy)

Document the locked field shape, position in the request body, and reference URL. The candidate shapes are:

```
A) creative_source: 'AI_GENERATED'                  // top-level on AdCreative
B) degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status: 'OPT_IN'
C) is_ai_generated: true                            // nested in object_story_spec.link_data
```

Pick exactly one. The locked field name and its position fill in `<FIELD_PATH>` and `<EXPECTED_VALUE>` placeholders in subsequent steps.

- [ ] **Step 2: Write the two failing tests**

Append to `src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts`, inside `describe('MetaUploadClient.uploadCreative', ...)`:

```ts
it('sets AI Content Label field when is_ai_generated=true', async () => {
  const fetchImpl = chainedFetch(
    assetResponse(),
    new Response(JSON.stringify({ images: { bytes: { hash: 'h' } } })),
    new Response(JSON.stringify({ id: 'cr_ai' })),
    new Response(JSON.stringify({ id: 'ad_ai' })),
  );
  const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
  await client.uploadCreative({
    asset_url: 'https://blob/x.png', copy: 'x', cta: 'x', locale: 'en',
    is_ai_generated: true,
    tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'c', utm_content: 'cb', utm_term: 't' },
  });
  const creativeBody = JSON.parse(
    ((fetchImpl.mock.calls[2] as unknown as [string, RequestInit])[1]).body as string,
  );
  // Replace assertion below per the locked shape from Step 1:
  //   A) expect(creativeBody.creative_source).toBe('AI_GENERATED');
  //   C) expect(creativeBody.object_story_spec.link_data.is_ai_generated).toBe(true);
  expect(/* <FIELD_PATH from Step 1> */).toBe(/* <EXPECTED_VALUE from Step 1> */);
});

it('omits or sets non-AI value for AI Content Label when is_ai_generated=false', async () => {
  const fetchImpl = chainedFetch(
    assetResponse(),
    new Response(JSON.stringify({ images: { bytes: { hash: 'h' } } })),
    new Response(JSON.stringify({ id: 'cr_no_ai' })),
    new Response(JSON.stringify({ id: 'ad_no_ai' })),
  );
  const client = new MetaUploadClient({ accessToken: 'T', adAccountId: 'act_1', fetchImpl });
  await client.uploadCreative({
    asset_url: 'https://blob/x.png', copy: 'x', cta: 'x', locale: 'en',
    is_ai_generated: false,
    tracking: { utm_source: 'meta', utm_medium: 'image', utm_campaign: 'c', utm_content: 'cb', utm_term: 't' },
  });
  const creativeBody = JSON.parse(
    ((fetchImpl.mock.calls[2] as unknown as [string, RequestInit])[1]).body as string,
  );
  // Replace negative assertion per Step 1's locked spec:
  //   A) expect(creativeBody.creative_source).toBeUndefined();
  //   C) expect(creativeBody.object_story_spec.link_data.is_ai_generated ?? false).toBe(false);
  expect(/* <FIELD_PATH from Step 1> */).toBeUndefined();
});
```

- [ ] **Step 3: Run new tests to verify they fail**

```sh
npx vitest run src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts -t 'AI Content Label'
```

Expected: TypeScript compile error: `Object literal may only specify known properties, and 'is_ai_generated' does not exist in type ...`. The interface doesn't yet accept the field.

- [ ] **Step 4: Add `is_ai_generated: boolean;` to the `MetaApiClient.uploadCreative` interface**

In `src/modules/advertising/creative-gen/upload/meta-upload.ts`, replace the interface @ lines 9-17:

```ts
export interface MetaApiClient {
  uploadCreative(opts: {
    asset_url: string;
    copy: string;
    cta: string;
    locale: string;
    tracking: TrackingParams;
    is_ai_generated: boolean;
  }): Promise<{ creative_id: string; ad_id: string }>;
}
```

- [ ] **Step 5: Add `is_ai_generated: boolean;` to `MetaUploadClient.uploadCreative` impl signature**

In `src/modules/advertising/meta-graph-api/upload-client.ts`, replace the method signature @ lines 9-21:

```ts
async uploadCreative(opts: {
  asset_url: string;
  copy: string;
  cta: string;
  locale: string;
  is_ai_generated: boolean;
  tracking: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content: string;
    utm_term: string;
  };
}): Promise<{ creative_id: string; ad_id: string }> {
```

- [ ] **Step 6: Set the AI Content Label field in the `/adcreatives` POST body**

In the same `upload-client.ts`, modify the `creativeRes` POST body @ lines 52-71. Use the spread-conditional pattern so the field is omitted entirely (not `false`) for Satori uploads. Pick the variant that matches the shape locked in Step 1:

For shape A (top-level on AdCreative):

```ts
const creativeRes = await this.request<MetaIdResponse>(
  'POST',
  `/${this.adAccountId}/adcreatives`,
  {
    name: `creative_${opts.tracking.utm_content}`,
    ...(opts.is_ai_generated ? { creative_source: 'AI_GENERATED' } : {}),
    object_story_spec: {
      page_id: pageId,
      link_data: {
        image_hash: imageHash,
        message: opts.copy,
        link: linkUrl,
        name: opts.copy.slice(0, 40),
        call_to_action: { type: 'LEARN_MORE', value: { link: linkUrl } },
      },
    },
  },
);
```

For shape C (nested in `link_data`):

```ts
const creativeRes = await this.request<MetaIdResponse>(
  'POST',
  `/${this.adAccountId}/adcreatives`,
  {
    name: `creative_${opts.tracking.utm_content}`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        image_hash: imageHash,
        message: opts.copy,
        link: linkUrl,
        name: opts.copy.slice(0, 40),
        call_to_action: { type: 'LEARN_MORE', value: { link: linkUrl } },
        ...(opts.is_ai_generated ? { is_ai_generated: true } : {}),
      },
    },
  },
);
```

- [ ] **Step 7: Run the new unit tests to verify pass**

```sh
npx vitest run src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts -t 'AI Content Label'
```

Expected: 2 PASS.

- [ ] **Step 8: Add `generator: string;` to `ApprovedRow`**

In `src/modules/advertising/meta-graph-api/publish-approved-service.ts`, replace the interface @ lines 3-12:

```ts
export interface ApprovedRow {
  id: string;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  assetUrl: string;
  assetKind: 'image' | 'video';
  hookTemplateId: string;
  metaAdId: string | null;
  generator: string;
}
```

- [ ] **Step 9: Update `publish-batch/route.ts` to select `generator` and pass `is_ai_generated`**

In `src/app/api/admin/creatives/publish-batch/route.ts`, replace the SELECT in `selectApproved` @ lines 57-79 to include `generator`:

```ts
async selectApproved(): Promise<ApprovedRow[]> {
  const rows = await db
    .select({
      id: advertisingCreatives.id,
      copy: advertisingCreatives.copy,
      cta: advertisingCreatives.cta,
      locale: advertisingCreatives.locale,
      assetUrl: advertisingCreatives.assetUrl,
      assetKind: advertisingCreatives.assetKind,
      hookTemplateId: advertisingCreatives.hookTemplateId,
      metaAdId: advertisingCreatives.metaAdId,
      generator: advertisingCreatives.generator,
    })
    .from(advertisingCreatives)
    .where(and(
      eq(advertisingCreatives.status, 'approved'),
      isNull(advertisingCreatives.metaAdId),
    ));
  return rows.map((r) => ({
    ...r,
    locale: r.locale as 'en' | 'es',
    assetKind: r.assetKind as 'image' | 'video',
  }));
},
```

Replace the `uploadCreative` callback @ lines 81-86:

```ts
async uploadCreative(row) {
  const tracking = buildTracking(row);
  return uploadClient!.uploadCreative({
    asset_url: row.assetUrl,
    copy: row.copy,
    cta: row.cta,
    locale: row.locale,
    tracking,
    is_ai_generated: row.generator !== 'satori',
  });
},
```

- [ ] **Step 10: Mirror the same two changes in `scripts/advertising/publish-approved.ts`**

In `scripts/advertising/publish-approved.ts`:

- Add `generator: advertisingCreatives.generator,` to the SELECT @ lines 42-50 (right after `metaAdId`).
- Add `is_ai_generated: row.generator !== 'satori',` to the `uploadCreative` call @ lines 64-68.

The shape mirrors Step 9 exactly.

- [ ] **Step 11: Update `uploadApprovedCreative` in `meta-upload.ts` to derive and pass `is_ai_generated` from the bundle**

In `src/modules/advertising/creative-gen/upload/meta-upload.ts`, modify the `metaApi.uploadCreative` call @ lines 93-99:

```ts
const metaResult = await deps.metaApi.uploadCreative({
  asset_url: bundle.asset.url,
  copy: bundle.copy,
  cta: bundle.cta,
  locale: bundle.locale,
  tracking,
  is_ai_generated: bundle.asset.generator !== 'satori',
});
```

- [ ] **Step 12: Run typecheck + lint + full test suite**

```sh
npm run typecheck && npm run lint && npm test
```

Expected: 0 errors, all tests pass. The two new upload-client cases pass; existing upload-client cases that don't set `is_ai_generated` will fail typecheck — they need the field added.

If existing tests in `upload-client.test.ts` fail because they don't pass `is_ai_generated`, add `is_ai_generated: false` (or `: true`, matching what each test exercises) to each existing case's `uploadCreative({...})` call. Existing cases don't assert anything about the AI label, so picking `false` (the safe default for tests) keeps semantics identical.

- [ ] **Step 13: Commit**

```sh
git add src/modules/advertising/creative-gen/upload/meta-upload.ts \
        src/modules/advertising/meta-graph-api/upload-client.ts \
        src/modules/advertising/meta-graph-api/__tests__/upload-client.test.ts \
        src/modules/advertising/meta-graph-api/publish-approved-service.ts \
        src/app/api/admin/creatives/publish-batch/route.ts \
        scripts/advertising/publish-approved.ts
git commit -m "$(cat <<'EOF'
fix(advertising/upload): set AI Content Label on Meta creative upload

Closes P0 compliance gap — every AI-generated creative uploaded by the
agent since 2026-04-26 was missing Meta's AI Content Label, theoretically
at policy risk under Meta's March 2026 rule.

Locked field per Marketing API v22.0: <FIELD from Task 1 Step 1>
Reference: <URL from Task 1 Step 1>

is_ai_generated derived as (generator !== 'satori'); Satori is
deterministic templating, not AI.

Refs: docs/superpowers/specs/2026-05-10-cowork-audit-roadmap-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 14: Push to `main` (Vercel auto-deploys)**

```sh
git push
```

Wait for the Vercel deploy to go green (~2 min). Confirm build success on the Vercel dashboard before continuing.

- [ ] **Step 15: Smoke-test in production via dry-run, then real upload**

```sh
curl -X POST 'https://estrevia.app/api/admin/creatives/publish-batch?dry_run=1&limit=1' \
  -H 'Authorization: Bearer <CLERK_JWT>'
```

Expected: HTTP 200 with `{ "previewed": 1, ... }`, no errors.

Then with one real test creative (one that has `status='approved'` and `meta_ad_id IS NULL`):

```sh
curl -X POST 'https://estrevia.app/api/admin/creatives/publish-batch?limit=1' \
  -H 'Authorization: Bearer <CLERK_JWT>'
```

Expected: HTTP 200 with `{ "uploaded": 1, ... }` and the corresponding `meta_ad_id` populated in the DB.

In Meta Ads Manager UI → Ads tab → click the new ad → confirm the AI Content Label badge is visible. If the badge is absent, the locked field name was wrong:

```sh
git revert HEAD && git push
```

Then redo Task 1 Step 1 with the corrected field choice.

---

## Task 2 — Step 2 / Track A: Patch 01 brand-policy fixes

**Worktree (recommended):** `git worktree add ../estrevia-track-a main` for isolation. Independent of Tasks 3 and 4 — can run in parallel.

**Files:**
- Modify: `src/modules/advertising/creative-gen/safety/checks.ts` — `PERSONAL_CLAIM_PATTERNS` @ line 32, `META_POLICY_PROMPT` @ line 64, `BRAND_PALETTE` @ line 132, `BRAND_PROMPT` @ lines 134-139
- Modify: `src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts` — append three new `describe(...)` blocks; extend top-level import to include `BRAND_PALETTE`

- [ ] **Step 1: Extend the test-file import to bring in `BRAND_PALETTE`**

In `src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts`, replace the import block @ lines 2-12:

```ts
import {
  personalClaimCheck,
  metaAdPolicyCheck,
  ocrTextAccuracyCheck,
  brandConsistencyCheck,
  controversialSymbolCheck,
  runAllChecks,
  isBlocked,
  newVisionCostAccumulator,
  recordVisionCall,
  BRAND_PALETTE,
} from '../checks';
```

- [ ] **Step 2: Write three failing test groups**

Append at the end of `checks.test.ts` (after the last `describe(...)` closes):

```ts
// ---------------------------------------------------------------------------
// Patch 01 — bilingual brand-policy hardening
// ---------------------------------------------------------------------------
describe('personalClaimCheck — Patch 01 bilingual brand-policy hardening', () => {
  it.each([
    // EN fortune-telling beyond second person
    ['fate awaits all of us'],
    ['this is your destiny'],
    ['what awaits you in the cosmos'],
    ['predict your future'],
    ['ancient mystics could foretell this'],
    // ES predictive
    ['predice tu futuro de manera precisa'],
    ['mira tu futuro en las estrellas'],
    ['descubre tu destino'],
    ['te espera una semana intensa'],
    ['adivina tu signo'],
    // EN absolutism
    ['all aries are stubborn'],
    ['every leo loves attention'],
    ['every person with this placement experiences chaos'],
    // ES absolutism — masculine + feminine
    ['todos los aries son impulsivos'],
    ['todas las leo son extrovertidas'],
    // ES "usted" form
    ['usted recibirá grandes cambios'],
    // Translated sign names that diverge from Latin
    ['Tauro es leal'],
    ['Géminis tiene dos caras'],
    ['Escorpio es intenso'],
    ['Sagitario ama viajar'],
    ['Capricornio es disciplinado'],
    ['Acuario es independiente'],
    ['Piscis es soñador'],
  ])('blocks: %s', async (copy) => {
    const result = await personalClaimCheck(copy);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('block');
  });

  it.each([
    // CRITICAL: Latin canonical forms required by CLAUDE.md i18n rules — must NOT be blocked
    ['Cáncer es emocional'],          // Cáncer is the canonical Latin form in ES
    ['Virgo placement matters'],      // Virgo is identical EN/ES, canonical
    ['Aries can be impulsive at times'],  // No "all"/"every" → not absolutist
    ['explore your sidereal placements'], // Reflection, not prediction
  ])('passes Latin canonical sign names: %s', async (copy) => {
    const result = await personalClaimCheck(copy);
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
  });
});

describe('META_POLICY_PROMPT — Patch 01 brand-voice extensions', () => {
  it('includes fluff-phrase forbidden examples', async () => {
    const deps = makeDeps();
    await metaAdPolicyCheck(mockBundle(), deps);
    const [promptArg] = (deps.claudeClient.moderationCheck as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(promptArg).toMatch(/cosmic dance/);
    expect(promptArg).toMatch(/stars whisper/);
    expect(promptArg).toMatch(/celestial tapestry/);
  });

  it('includes apologizing-language clause', async () => {
    const deps = makeDeps();
    await metaAdPolicyCheck(mockBundle(), deps);
    const [promptArg] = (deps.claudeClient.moderationCheck as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(promptArg).toMatch(/some believe/);
    expect(promptArg).toMatch(/according to astrologers/);
    expect(promptArg).toMatch(/whether you believe/);
  });

  it('includes Title Case + Book of Thoth + Eshelman clauses', async () => {
    const deps = makeDeps();
    await metaAdPolicyCheck(mockBundle(), deps);
    const [promptArg] = (deps.claudeClient.moderationCheck as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(promptArg).toMatch(/Title Case/);
    expect(promptArg).toMatch(/Book of Thoth/);
    expect(promptArg).toMatch(/Eshelman/);
  });

  it('mentions tropical-astrology mocking is forbidden', async () => {
    const deps = makeDeps();
    await metaAdPolicyCheck(mockBundle(), deps);
    const [promptArg] = (deps.claudeClient.moderationCheck as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(promptArg).toMatch(/mocking tropical astrology/);
  });
});

describe('BRAND_PALETTE — Patch 01 canonical palette', () => {
  it('matches docs/design.md canonical four colors in canonical order', () => {
    expect([...BRAND_PALETTE]).toEqual(['#0A0A0F', '#12121A', '#F0F0F5', '#FFD700']);
  });

  it('BRAND_PROMPT names colors consistent with new palette indices', async () => {
    const visionClient = makeVision({ passed: true, dominantColors: [] });
    await brandConsistencyCheck(mockBundle(), { visionClient });
    const [, prompt] = (visionClient.analyzeImage as ReturnType<typeof vi.fn>).mock.calls[0];
    // Stale labels must be gone
    expect(prompt).not.toMatch(/silver \(#/);
    expect(prompt).not.toMatch(/deep purple/);
    // New labels paired with correct hex
    expect(prompt).toMatch(/deep space \(#0A0A0F\)/i);
    expect(prompt).toMatch(/dark navy \(#12121A\)/i);
    expect(prompt).toMatch(/ivory \(#F0F0F5\)/i);
    expect(prompt).toMatch(/gold \(#FFD700\)/i);
  });
});
```

- [ ] **Step 3: Run failing tests to verify they fail**

```sh
npx vitest run src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts -t 'Patch 01'
```

Expected: most cases FAIL — current regex doesn't catch the new patterns; current `META_POLICY_PROMPT` lacks the new clauses; current `BRAND_PALETTE` is `['#FFD700', '#C0C0C0', '#9B8EC4', '#0A0A0F']`.

- [ ] **Step 4: Extend `PERSONAL_CLAIM_PATTERNS`**

In `src/modules/advertising/creative-gen/safety/checks.ts`, replace the array @ lines 32-39:

```ts
const PERSONAL_CLAIM_PATTERNS: RegExp[] = [
  /\byou are not\b/i,
  /\byou'?re not\b/i,
  /\byou will\b/i,
  /\byour future\b/i,
  /\byou deserve\b/i,
  /\byou know that\b/i,
  // EN fortune-telling beyond second person
  /\bfate\b/i,
  /\bdestiny\b/i,
  /\bwhat awaits you\b/i,
  /\bawaits you\b/i,
  /\bpredict your\b/i,
  /\bforetell\b/i,
  // ES (LATAM neutro) predictive forms
  /\bpredice tu\b/i,
  /\btu futuro\b/i,
  /\btu destino\b/i,
  /\bte espera\b/i,
  /\badivina\b/i,
  // Absolutism — sign-level (EN)
  /\b(all|every) (aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i,
  /\bevery person with this\b/i,
  // Absolutism — sign-level (ES, signs stay in Latin form), masculine + feminine
  /\btodos los (aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i,
  /\btodas las (aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i,
  // Spanish "usted" form (Estrevia uses "tú"/LATAM neutro)
  /\busted\b/i,
  // Translated sign names that DIVERGE from Latin (must stay in Latin form per
  // CLAUDE.md i18n rules). \bcáncer\b and \bvirgo\b are intentionally EXCLUDED —
  // Cáncer and Virgo are the canonical Latin forms required in EN and ES.
  /\btauro\b/i,
  /\bgéminis\b/i,
  /\bescorpio\b/i,
  /\bsagitario\b/i,
  /\bcapricornio\b/i,
  /\bacuario\b/i,
  /\bpiscis\b/i,
];
```

- [ ] **Step 5: Extend `META_POLICY_PROMPT`**

Same file `checks.ts`, replace @ lines 64-68:

```ts
const META_POLICY_PROMPT = (copy: string) =>
  `Does this ad copy violate Meta's ad policy? Copy: "${copy}". ` +
  `Check for: personal attribute claims, predictive language, fortune-telling, ` +
  `sensational health/wealth promises, exposed body parts, sensitive content, ` +
  `fluff phrases ("cosmic dance", "stars whisper", "celestial tapestry"), ` +
  `apologizing for astrology ("some believe", "according to astrologers", "whether you believe"), ` +
  `mocking tropical astrology (Estrevia differentiates by accuracy, not by attacking it), ` +
  `Title Case in headings (must be sentence case), ` +
  `Book of Thoth content or paraphrasing (copyright until 2039 — only Liber 777 from 1909 is public domain), ` +
  `direct quotation of James Eshelman (living author). ` +
  `Reply JSON: { "passed": boolean, "reason": string }.`;
```

- [ ] **Step 6: Replace `BRAND_PALETTE` and `BRAND_PROMPT` with the canonical palette**

Same file `checks.ts`, replace @ lines 131-139:

```ts
/**
 * Estrevia core palette per docs/design.md.
 * Order: background, surface, text-primary, accent.
 */
export const BRAND_PALETTE = [
  '#0A0A0F',  // Deep Space — primary background
  '#12121A',  // Dark Navy — surface
  '#F0F0F5',  // Ivory — primary text
  '#FFD700',  // Gold — accent
] as const;

const BRAND_PROMPT = `Does this image use the Estrevia astrology brand palette? \
Approved colors: deep space (${BRAND_PALETTE[0]}), dark navy (${BRAND_PALETTE[1]}), \
ivory (${BRAND_PALETTE[2]}), gold (${BRAND_PALETTE[3]}). \
The dominant 3-4 colors of the image should match within reasonable tolerance \
(CIE76 ΔE ≤ 25 — generous for AI-generated variations). \
Respond JSON: {"passed": boolean, "dominantColors": ["#hex", ...], "reason": "..."}.`;
```

- [ ] **Step 7: Run tests to verify pass**

```sh
npm test
```

Expected: all tests pass including the new Patch 01 groups; no regressions.

- [ ] **Step 8: Run typecheck + lint**

```sh
npm run typecheck && npm run lint
```

Expected: 0 errors.

- [ ] **Step 9: Commit and push**

```sh
git add src/modules/advertising/creative-gen/safety/checks.ts \
        src/modules/advertising/creative-gen/safety/__tests__/checks.test.ts
git commit -m "$(cat <<'EOF'
feat(advertising/safety): brand-policy regex hardening + canonical palette

Patch 01 (audited subset) — adds bilingual fortune-telling + absolutism
regex, ES "usted" rejection, ES translated-sign-name rejection (excludes
Cáncer + Virgo per CLAUDE.md Latin-canonical rule); expands Meta-policy
moderation prompt with fluff/apologizing/Title-Case/Thoth/Eshelman clauses;
replaces BRAND_PALETTE + BRAND_PROMPT with the canonical four colors from
docs/design.md (Deep Space, Dark Navy, Ivory, Gold).

Refs: docs/superpowers/specs/2026-05-10-cowork-audit-roadmap-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

If executed in a worktree, follow the worktree exit/merge flow per the `superpowers:using-git-worktrees` skill before pushing.

---

## Task 3 — Step 2 / Track B: Patch 02 templates

**Worktree (recommended):** `git worktree add ../estrevia-track-b main`. Run in parallel with Task 2.

**Files:**
- Modify: `src/shared/types/advertising/creative.ts` — `HookArchetype` @ lines 1-2
- Modify: `src/modules/advertising/creative-gen/templates/hooks-en.ts` — append 4 entries before the closing `];` of `hooksEn`
- Modify: `src/modules/advertising/creative-gen/templates/hooks-es.ts` — append 4 entries before the closing `];` of `hooksEs`
- Modify: `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts` — append one new `describe(...)` block
- Modify: `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts` — append one new `describe(...)` block

- [ ] **Step 1: Write failing tests in `hooks-en.test.ts`**

Append to `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts`, after the last `});`:

```ts
describe('Patch 02 — lead_magnet archetype + new templates', () => {
  it.each([
    'en-rarity-7',
    'en-lead-magnet-1',
    'en-lead-magnet-2',
    'en-lead-magnet-3',
  ])('contains %s', (id) => {
    const t = hooksEn.find(h => h.id === id);
    expect(t).toBeDefined();
    expect(t?.locale).toBe('en');
    expect(t?.policy_constraints.length).toBeGreaterThan(0);
  });

  it('en-lead-magnet templates use lead_magnet archetype', () => {
    for (const id of ['en-lead-magnet-1', 'en-lead-magnet-2', 'en-lead-magnet-3']) {
      const t = hooksEn.find(h => h.id === id);
      expect(t?.archetype).toBe('lead_magnet');
    }
  });

  it('en-rarity-7 uses rarity archetype (Cosmic Passport variant)', () => {
    const t = hooksEn.find(h => h.id === 'en-rarity-7');
    expect(t?.archetype).toBe('rarity');
  });
});
```

- [ ] **Step 2: Write failing tests in `hooks-es.test.ts`**

Append to `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts`, after the last `});`:

```ts
describe('Patch 02 — lead_magnet archetype + new templates (ES)', () => {
  it.each([
    'es-rarity-7',
    'es-lead-magnet-1',
    'es-lead-magnet-2',
    'es-lead-magnet-3',
  ])('contains %s', (id) => {
    const t = hooksEs.find(h => h.id === id);
    expect(t).toBeDefined();
    expect(t?.locale).toBe('es');
    expect(t?.policy_constraints.length).toBeGreaterThan(0);
  });

  it('es-lead-magnet templates use lead_magnet archetype', () => {
    for (const id of ['es-lead-magnet-1', 'es-lead-magnet-2', 'es-lead-magnet-3']) {
      const t = hooksEs.find(h => h.id === id);
      expect(t?.archetype).toBe('lead_magnet');
    }
  });

  it('es-rarity-7 uses rarity archetype', () => {
    const t = hooksEs.find(h => h.id === 'es-rarity-7');
    expect(t?.archetype).toBe('rarity');
  });

  it('new ES templates do not contain "usted"', () => {
    for (const id of ['es-rarity-7', 'es-lead-magnet-1', 'es-lead-magnet-2', 'es-lead-magnet-3']) {
      const t = hooksEs.find(h => h.id === id);
      expect(t?.copy_template).not.toMatch(/\busted\b/i);
    }
  });

  it('new ES templates do not contain translated sign names that diverge from Latin', () => {
    for (const id of ['es-rarity-7', 'es-lead-magnet-1', 'es-lead-magnet-2', 'es-lead-magnet-3']) {
      const t = hooksEs.find(h => h.id === id);
      expect(t?.copy_template).not.toMatch(
        /\b(tauro|géminis|escorpio|sagitario|capricornio|acuario|piscis)\b/i,
      );
    }
  });
});
```

- [ ] **Step 3: Run failing tests to verify they fail**

```sh
npx vitest run src/modules/advertising/creative-gen/templates/__tests__/ -t 'Patch 02'
```

Expected: all `contains <id>` cases FAIL (templates missing); `archetype: 'lead_magnet'` triggers a TypeScript compile error in the templates files (next steps add the union member + the templates).

- [ ] **Step 4: Add `'lead_magnet'` to the `HookArchetype` union**

In `src/shared/types/advertising/creative.ts`, replace @ lines 1-2:

```ts
export type HookArchetype = 'identity_reveal' | 'authority' | 'rarity'
  | 'identity_continuation' | 'paywall_nudge' | 'lead_magnet';
```

- [ ] **Step 5: Append 4 new EN templates to `hooks-en.ts`**

In `src/modules/advertising/creative-gen/templates/hooks-en.ts`, append the following entries inside the `hooksEn` array, BEFORE its closing `];`:

```ts
  // ---------------------------------------------------------------------------
  // ARCHETYPE: lead_magnet
  // Direct-response hook for cold audience → trial signup.
  // Imperative framing ("calculate", "map") — instruction, not personal claim.
  // ---------------------------------------------------------------------------
  {
    id: 'en-lead-magnet-1',
    name: 'Lead Magnet — Free Sidereal Chart',
    archetype: 'lead_magnet',
    copy_template:
      'Your sidereal birth chart, free. Calculated to ±0.01° against the Swiss Ephemeris. No sun-sign guesswork.',
    visual_mood:
      'Photorealistic sidereal birth chart wheel, fine pale-gold linework on deep navy-to-black background. Twelve sectors, planetary glyphs at precise degrees, thin radial lines, observatory plate aesthetic. Soft halo above wheel. Empty negative space at the bottom for CTA overlay. NO text, NO labels, NO mystic clipart, NO crystal balls. Vertical 9:16 composition.',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'free chart claim is product-truthful — acceptable',
      '±0.01° accuracy cites Swiss Ephemeris / Moshier',
      'no personal predictions',
      'no fortune-telling language',
    ],
  },
  {
    id: 'en-lead-magnet-2',
    name: 'Lead Magnet — Map Your Sky',
    archetype: 'lead_magnet',
    copy_template:
      'Map your real sky in 90 seconds. Sidereal positions, calibrated to where the planets actually are tonight.',
    visual_mood:
      'Photorealistic deep night sky with subtle Milky Way band. Three planets visible with mathematical precision (Saturn with rings, Jupiter cream-banded, Mars deep red). Empty negative space at the bottom. NO UI, NO text, NO data dashboards. Vertical 9:16 composition.',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'en',
    policy_constraints: [
      'product-action framing — acceptable',
      'no personal claims about the viewer',
      'no fortune-telling',
    ],
  },
  {
    id: 'en-lead-magnet-3',
    name: 'Lead Magnet — Not a Horoscope',
    archetype: 'lead_magnet',
    copy_template:
      "Not a horoscope. The actual sidereal chart, calibrated to the real sky — not the calendar's average.",
    visual_mood:
      'Split-screen comparison: left side a generic horoscope newspaper clipping aesthetic faded out; right side a precise sidereal chart wheel in pale-gold linework on deep navy-to-black. Vertical 9:16. NO text in image, NO logos. Empty bottom for CTA overlay.',
    duration_sec: 18,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'en',
    policy_constraints: [
      'comparative framing is factual — acceptable',
      'does not mock tropical astrology by name (just contrasts approaches)',
      'no personal claims about the viewer',
    ],
  },
  // ---------------------------------------------------------------------------
  // ADDITION TO ARCHETYPE: rarity (Cosmic Passport variant from Canva)
  // ---------------------------------------------------------------------------
  {
    id: 'en-rarity-7',
    name: 'Rarity — Your Cosmic Passport',
    archetype: 'rarity',
    copy_template:
      'Your Cosmic Passport. Sun, Moon, and Ascendant in their actual sidereal signs — a single shareable card.',
    visual_mood:
      'A single luminous astrological identity card centered, slightly tilted, vintage observatory pass aesthetic. Card face shows a circular sidereal chart wheel in pale-gold linework with twelve sectors, abstract symbolic forms (no readable script), small bright golden dots marking planetary positions. Subtle Tree-of-Life node geometry as corner watermark — NOT Frieda Harris Thoth deck imagery. Deep navy-to-black background with sparse stars. NO crystal balls, NO tarot, NO mystical clipart. NO text in image. Vertical 9:16 composition.',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'product description — acceptable',
      'Tree-of-Life geometry is symbolic schematic, not Frieda Harris Thoth (copyright until 2064)',
      'no personal claims about the viewer',
      'no fortune-telling',
    ],
  },
```

- [ ] **Step 6: Append 4 new ES templates to `hooks-es.ts`**

In `src/modules/advertising/creative-gen/templates/hooks-es.ts`, append the following entries inside the `hooksEs` array, BEFORE its closing `];`:

```ts
  // ---------------------------------------------------------------------------
  // ARQUETIPO: lead_magnet
  // Hook directo, CTA fuerte, imperativo "tú": calcula, mapea.
  // ---------------------------------------------------------------------------
  {
    id: 'es-lead-magnet-1',
    name: 'Lead Magnet — Carta Sideral Gratis',
    archetype: 'lead_magnet',
    copy_template:
      'Tu carta natal sideral, sin costo. Calculada con precisión védica al ±0.01° contra Swiss Ephemeris. Sin generalizaciones de signo solar.',
    visual_mood:
      'Rueda fotorrealista de carta natal sideral, líneas finas en oro pálido sobre fondo azul marino profundo a negro. Doce sectores, glifos planetarios en grados precisos, líneas radiales finas, estética de placa de observatorio. Halo suave sobre la rueda. Espacio negativo vacío en la parte inferior para overlay del CTA. SIN texto, SIN etiquetas, SIN clipart místico, SIN bolas de cristal. Composición vertical 9:16.',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'afirmación de carta gratuita es veraz al producto — aceptable',
      '±0.01° cita Swiss Ephemeris / Moshier',
      'sin predicciones personales',
      'sin lenguaje adivinatorio',
      'forma "tú" — nunca "usted"',
      'nombres de signos en forma latina (Aries, Taurus, ...) — no traducir',
    ],
  },
  {
    id: 'es-lead-magnet-2',
    name: 'Lead Magnet — Mapea Tu Cielo',
    archetype: 'lead_magnet',
    copy_template:
      'Mapea tu cielo real en 90 segundos. Posiciones siderales, calibradas a donde los planetas están esta noche.',
    visual_mood:
      'Cielo nocturno fotorrealista con banda sutil de la Vía Láctea. Tres planetas visibles con precisión matemática (Saturno con anillos, Júpiter con bandas crema, Marte rojo profundo). Espacio negativo vacío en la parte inferior. SIN UI, SIN texto, SIN dashboards. Composición vertical 9:16.',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'es',
    policy_constraints: [
      'enmarque de acción del producto — aceptable',
      'sin afirmaciones personales sobre el espectador',
      'sin adivinación',
      'forma "tú"',
    ],
  },
  {
    id: 'es-lead-magnet-3',
    name: 'Lead Magnet — No Es Horóscopo',
    archetype: 'lead_magnet',
    copy_template:
      'No es horóscopo. Es tu carta natal real, mapeada al cielo verdadero — no al promedio del calendario.',
    visual_mood:
      'Comparación de pantalla dividida: lado izquierdo un recorte de horóscopo de periódico genérico atenuado; lado derecho una rueda sideral precisa en líneas oro pálido sobre azul marino profundo a negro. Vertical 9:16. SIN texto en la imagen, SIN logos. Parte inferior vacía para overlay del CTA.',
    duration_sec: 18,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'es',
    policy_constraints: [
      'enmarque comparativo es factual — aceptable',
      'no se burla de astrología tropical por nombre (solo contrasta enfoques)',
      'sin afirmaciones personales',
      'forma "tú"',
    ],
  },
  // ---------------------------------------------------------------------------
  // ADICIÓN AL ARQUETIPO: rarity (variante Pasaporte Cósmico)
  // ---------------------------------------------------------------------------
  {
    id: 'es-rarity-7',
    name: 'Rarity — Tu Pasaporte Cósmico',
    archetype: 'rarity',
    copy_template:
      'Tu Pasaporte Cósmico. Sol, Luna y Ascendente en sus signos siderales reales — una tarjeta compartible.',
    visual_mood:
      'Una sola tarjeta luminosa de identidad astrológica centrada, ligeramente inclinada, estética de pase de observatorio antiguo. La cara de la tarjeta muestra una rueda circular de carta sideral en líneas oro pálido con doce sectores, formas simbólicas abstractas (sin escritura legible), pequeños puntos dorados marcando posiciones planetarias. Geometría sutil de nodos del Árbol de la Vida como marca de agua en esquina — NO imágenes del Tarot Thoth de Frieda Harris. Fondo azul marino profundo a negro con estrellas dispersas. SIN bolas de cristal, SIN tarot, SIN clipart místico. SIN texto en la imagen. Composición vertical 9:16.',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'descripción de producto — aceptable',
      'geometría del Árbol de la Vida es esquemática simbólica, no Tarot Thoth de Harris (copyright hasta 2064)',
      'sin afirmaciones personales sobre el espectador',
      'sin adivinación',
      'forma "tú"',
      'nombres de signos en forma latina',
    ],
  },
```

- [ ] **Step 7: Run all tests to verify pass**

```sh
npm test
```

Expected: all suites pass including the new Patch 02 groups; no regressions.

Existing test invariants that should still hold (sanity-check failures here mean a copy issue in one of the new templates):
- `hooks-es.test.ts:78-82` "sign names are NOT translated" — checks `FORBIDDEN_SIGN_TRANSLATIONS` not in any copy
- `hooks-es.test.ts:84-88` "uses tú form imperatives" — no `Calcule|Descubra|Comprenda|Conozca`
- `hooks-es.test.ts:99-103` "no predictive or fortune-telling language" — no `serás|te pasará|tu futuro|predice|fortuna`
- `hooks-en.test.ts:23-27` "third-person framing" — no `you are not|you're not`
- `hooks-en.test.ts:63-68` "no predictive or fortune-telling language" — no `you will|you'll|your future|predicts|fortune`

Also check the matrix-generator suite:

```sh
npx vitest run src/modules/advertising/creative-gen/batch/__tests__/generate-launch-set.test.ts
```

Expected: green. If this suite fails on the new `'lead_magnet'` archetype (e.g. because it asserts an exact set of archetypes), update the assertion to include `'lead_magnet'` and re-run. Per the spec, no other code change is needed — the matrix selects from whatever archetypes exist in the templates list.

- [ ] **Step 8: Run typecheck + lint**

```sh
npm run typecheck && npm run lint
```

Expected: 0 errors. The `'lead_magnet'` literal is now a valid `HookArchetype` discriminant.

- [ ] **Step 9: Commit and push**

```sh
git add src/shared/types/advertising/creative.ts \
        src/modules/advertising/creative-gen/templates/hooks-en.ts \
        src/modules/advertising/creative-gen/templates/hooks-es.ts \
        src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts \
        src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts
git commit -m "$(cat <<'EOF'
feat(advertising/templates): add lead_magnet archetype + 6 hook templates (EN/ES)

Patch 02 — extends HookArchetype union with 'lead_magnet'; adds 8 new
templates (en-rarity-7, en-lead-magnet-1/2/3, es-rarity-7,
es-lead-magnet-1/2/3) derived from Cowork Canva creative concepts
(sidereal accuracy, Cosmic Passport, free-chart lead magnet).

ES templates audited against forbidden patterns: no usted form, no
translated sign names that diverge from Latin canonical (Tauro/Géminis/
Escorpio/Sagitario/Capricornio/Acuario/Piscis).

Refs: docs/superpowers/specs/2026-05-10-cowork-audit-roadmap-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

If executed in a worktree, follow the worktree exit/merge flow per `superpowers:using-git-worktrees`.

---

## Task 4 — Step 2 / Track C: Patch 03 Canva anchor creatives

**Coordination:** This task MUST start AFTER Task 3 (Track B) has landed in `main`. If executing in a worktree:

```sh
cd <worktree-path> && git pull origin main
```

This brings in Track B's commit so the `creative.ts` edit (adding `'canva'` to the `GeneratedAsset.generator` union) lands cleanly alongside Track B's `HookArchetype` change without a merge conflict.

**Files:**
- Modify: `src/shared/types/advertising/creative.ts` — `GeneratedAsset.generator` @ lines 19-20
- Create: `scripts/advertising/seed-canva-anchor-creatives.ts`
- Create: `scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts`
- Modify: `package.json` — append npm script under `scripts` block @ lines 6-23

**External integrations used (read-only listing for context):**
- Canva MCP: `mcp__claude_ai_Canva__list-brand-kits`, `mcp__claude_ai_Canva__search-designs`, `mcp__claude_ai_Canva__export-design`
- Vercel Blob: `@vercel/blob` `put()` (already in `dependencies`)
- Neon Postgres via Drizzle (existing `getDb()`)

- [ ] **Step 1: Verify Canva MCP access to Brand Kit `kAGT_ANQrn8`**

Call `mcp__claude_ai_Canva__list-brand-kits`. Expected: response includes a kit with id `kAGT_ANQrn8`. If access is denied or the kit is missing, HALT and surface to founder for credential fix — do not proceed.

- [ ] **Step 2: Discover the 12 Cowork anchor designs**

Call `mcp__claude_ai_Canva__search-designs` with brand-kit context and identifying terms (e.g. `estrevia`, `sidereal`, `passport`). Expected: 12 designs — 6 feed-format `1080x1350` + 6 stories-format `1080x1920`, split EN / ES across 3 concepts (sidereal accuracy, Cosmic Passport, free chart).

Record the 12 design IDs in this scratch table:

| # | Design ID | Locale | Concept | Format |
|---|---|---|---|---|
| 01 | `<id>` | es | accuracy | feed |
| 02 | `<id>` | es | passport | feed |
| 03 | `<id>` | es | freechart | feed |
| 04 | `<id>` | en | accuracy | feed |
| 05 | `<id>` | en | passport | feed |
| 06 | `<id>` | en | freechart | feed |
| 07 | `<id>` | es | accuracy | stories |
| 08 | `<id>` | es | passport | stories |
| 09 | `<id>` | es | freechart | stories |
| 10 | `<id>` | en | accuracy | stories |
| 11 | `<id>` | en | passport | stories |
| 12 | `<id>` | en | freechart | stories |

If fewer than 12 are found, HALT and surface to founder.

- [ ] **Step 3: Export each design as PNG via Canva MCP**

For each of the 12 design IDs, call `mcp__claude_ai_Canva__export-design` requesting PNG at the highest available resolution. Capture the 12 returned signed URLs (Canva URLs valid ~24h). Do NOT use these as the final `assetUrl` — they expire.

- [ ] **Step 4: Upload PNGs to Vercel Blob via a temporary helper script**

Create the temporary helper at `scripts/advertising/_upload-canva-anchors-to-blob.mts` (underscore prefix marks it as one-shot — not committed). Paste the 12 signed URLs from Step 3 in:

```ts
import 'dotenv/config';
import { put } from '@vercel/blob';

const SIGNED_URLS = {
  feed_es_accuracy:   'https://export.canva.com/<...>',
  feed_es_passport:   'https://export.canva.com/<...>',
  feed_es_freechart:  'https://export.canva.com/<...>',
  feed_en_accuracy:   'https://export.canva.com/<...>',
  feed_en_passport:   'https://export.canva.com/<...>',
  feed_en_freechart:  'https://export.canva.com/<...>',
  story_es_accuracy:  'https://export.canva.com/<...>',
  story_es_passport:  'https://export.canva.com/<...>',
  story_es_freechart: 'https://export.canva.com/<...>',
  story_en_accuracy:  'https://export.canva.com/<...>',
  story_en_passport:  'https://export.canva.com/<...>',
  story_en_freechart: 'https://export.canva.com/<...>',
};

async function main(): Promise<void> {
  for (const [key, url] of Object.entries(SIGNED_URLS)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${key}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const blob = await put(`advertising/canva-anchors/${key}.png`, buf, {
      access: 'public',
      contentType: 'image/png',
    });
    console.log(`${key}: ${blob.url}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run:

```sh
BLOB_READ_WRITE_TOKEN='<from-vercel-env>' npx tsx scripts/advertising/_upload-canva-anchors-to-blob.mts
```

Capture the 12 permanent Vercel Blob URLs printed to stdout. Then DELETE the helper script:

```sh
rm scripts/advertising/_upload-canva-anchors-to-blob.mts
```

It contains expired signed URLs and is single-use; not for commit.

- [ ] **Step 5: Add `'canva'` to `GeneratedAsset.generator` union**

In `src/shared/types/advertising/creative.ts`, replace @ lines 16-28:

```ts
export interface GeneratedAsset {
  id: string;
  kind: 'image' | 'video';
  generator: 'imagen-4-fast' | 'imagen-4-ultra' | 'nano-banana-2'
    | 'ideogram-3' | 'veo-3-1-lite' | 'runway-gen-4' | 'satori'
    | 'canva';
  prompt_used: string;
  url: string;
  width: number;
  height: number;
  duration_sec?: number;
  cost_usd: number;
  created_at: Date;
}
```

- [ ] **Step 6: Write the failing seed-script test**

Create `scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const valuesSpy = vi.fn().mockReturnValue({
  onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
});
const insertSpy = vi.fn().mockReturnValue({ values: valuesSpy });

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ insert: insertSpy }),
}));

vi.mock('@/shared/lib/schema', () => ({
  advertisingCreatives: { __tableName: 'advertising_creatives' },
}));

beforeEach(() => {
  valuesSpy.mockClear();
  insertSpy.mockClear();
  process.env.FOUNDER_EMAIL = 'founder@estrevia.app';
});

describe('seed-canva-anchor-creatives', () => {
  it('exports 12 anchor records', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    expect(ANCHORS).toHaveLength(12);
  });

  it('inserts 12 records when seed() runs', async () => {
    const { seed } = await import('../seed-canva-anchor-creatives');
    await seed();
    expect(insertSpy).toHaveBeenCalledTimes(12);
  });

  it('every anchor has status=approved, generator=canva, costUsd=0', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    for (const a of ANCHORS) {
      expect(a.status).toBe('approved');
      expect(a.generator).toBe('canva');
      expect(a.costUsd).toBe(0);
    }
  });

  it('every anchor has all five safety checks pre-passed with severity=info', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    for (const a of ANCHORS) {
      expect(a.safetyChecks).toHaveLength(5);
      const names = a.safetyChecks.map((c: { check_name: string }) => c.check_name);
      expect(names).toEqual(expect.arrayContaining([
        'personal_claim',
        'meta_ad_policy',
        'ocr_text_accuracy',
        'brand_consistency',
        'controversial_symbol',
      ]));
      for (const c of a.safetyChecks) {
        expect(c.passed).toBe(true);
        expect(c.severity).toBe('info');
      }
    }
  });

  it('6 anchors have locale=en and 6 have locale=es', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    expect(ANCHORS.filter((a) => a.locale === 'en')).toHaveLength(6);
    expect(ANCHORS.filter((a) => a.locale === 'es')).toHaveLength(6);
  });

  it('anchor IDs are unique', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    const ids = ANCHORS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every assetUrl is a Vercel Blob URL', async () => {
    const { ANCHORS } = await import('../seed-canva-anchor-creatives');
    for (const a of ANCHORS) {
      expect(a.assetUrl).toMatch(/blob\.vercel-storage\.com/);
    }
  });
});
```

- [ ] **Step 7: Run failing tests**

```sh
npx vitest run scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts
```

Expected: tests fail because `seed-canva-anchor-creatives.ts` does not yet exist — module-not-found import error.

- [ ] **Step 8: Create the seed script with Blob URLs from Step 4 hard-coded**

Create `scripts/advertising/seed-canva-anchor-creatives.ts`. Replace each `<BLOB_URL_NN>` placeholder with the corresponding URL captured in Step 4:

```ts
/**
 * One-off seed: insert the 12 Canva-generated brand-anchor creatives into
 * advertising_creatives table as pre-approved evergreen records.
 *
 * Idempotent — uses fixed IDs so re-running is a no-op.
 *
 * Usage:
 *   npm run advertising:seed-canva-anchors
 *
 * Prerequisites:
 *   - Canva PNGs uploaded to Vercel Blob (URLs hard-coded in ANCHOR_BLOBS)
 *   - Patch 02 applied: 'lead_magnet' archetype + es/en-rarity-7 templates
 */

import 'dotenv/config';
import { getDb } from '@/shared/lib/db';
import { advertisingCreatives } from '@/shared/lib/schema';
import type { SafetyCheckResult } from '@/shared/types/advertising';

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL ?? 'founder@estrevia.app';
const APPROVED_AT = new Date('2026-05-10T00:00:00Z');

const PRE_APPROVED_CHECKS: SafetyCheckResult[] = [
  { check_name: 'personal_claim',       passed: true, severity: 'info', reason: 'Manual founder review — Brand Guidelines compliant' },
  { check_name: 'meta_ad_policy',       passed: true, severity: 'info', reason: 'Manual founder review' },
  { check_name: 'ocr_text_accuracy',    passed: true, severity: 'info', reason: 'Visually verified' },
  { check_name: 'brand_consistency',    passed: true, severity: 'info', reason: 'Generated against Canva Brand Kit kAGT_ANQrn8' },
  { check_name: 'controversial_symbol', passed: true, severity: 'info', reason: 'Manual founder review' },
];

const ANCHOR_BLOBS = {
  feed_es_accuracy:   '<BLOB_URL_01>',
  feed_es_passport:   '<BLOB_URL_02>',
  feed_es_freechart:  '<BLOB_URL_03>',
  feed_en_accuracy:   '<BLOB_URL_04>',
  feed_en_passport:   '<BLOB_URL_05>',
  feed_en_freechart:  '<BLOB_URL_06>',
  story_es_accuracy:  '<BLOB_URL_07>',
  story_es_passport:  '<BLOB_URL_08>',
  story_es_freechart: '<BLOB_URL_09>',
  story_en_accuracy:  '<BLOB_URL_10>',
  story_en_passport:  '<BLOB_URL_11>',
  story_en_freechart: '<BLOB_URL_12>',
} as const;

interface AnchorRecord {
  id: string;
  hookTemplateId: string;
  assetUrl: string;
  assetKind: 'image';
  generator: 'canva';
  costUsd: 0;
  copy: string;
  cta: string;
  locale: 'en' | 'es';
  status: 'approved';
  safetyChecks: SafetyCheckResult[];
  approvedBy: string;
  approvedAt: Date;
}

export const ANCHORS: AnchorRecord[] = [
  // ---- Feed (1080x1350) ----
  {
    id: 'anchor-2026-05-10-es-accuracy-feed',
    hookTemplateId: 'es-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.feed_es_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'No es horóscopo. Es tu carta natal real. Astrología sideral con precisión védica. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Descubre tu carta — gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-passport-feed',
    hookTemplateId: 'es-rarity-7',
    assetUrl: ANCHOR_BLOBS.feed_es_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Tu identidad sideral en una sola tarjeta. El Pasaporte Cósmico de Estrevia reúne tu Sol, Luna y Ascendente en signos reales — calculados con precisión védica. Compartible, precisa, tuya.',
    cta: 'Genera el tuyo gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-freechart-feed',
    hookTemplateId: 'es-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.feed_es_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calcula tu carta natal sideral sin costo. Precisión védica al ±0.01° contra Swiss Ephemeris. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Crear mi carta',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-accuracy-feed',
    hookTemplateId: 'en-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.feed_en_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: "Your real birth chart, calibrated to the actual sky — not the calendar's average. Sidereal astrology with Vedic precision (Lahiri ayanamsa, accurate to ±0.01° against the Swiss Ephemeris). No generic horoscopes, no predictions. A tool for reflection, not fortune-telling.",
    cta: 'See your chart — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-passport-feed',
    hookTemplateId: 'en-rarity-7',
    assetUrl: ANCHOR_BLOBS.feed_en_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Your sidereal identity, on a single card. The Estrevia Cosmic Passport gathers your Sun, Moon, and Ascendant in real signs — calculated with Vedic precision. Shareable, precise, yours.',
    cta: 'Generate yours — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-freechart-feed',
    hookTemplateId: 'en-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.feed_en_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calculate your sidereal birth chart, free. Vedic precision to ±0.01° against the Swiss Ephemeris. No sun-sign generalizations, no predictions — an honest look at your real sky.',
    cta: 'Create my chart',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  // ---- Stories (1080x1920) ----
  {
    id: 'anchor-2026-05-10-es-accuracy-stories',
    hookTemplateId: 'es-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.story_es_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'No es horóscopo. Es tu carta natal real. Astrología sideral con precisión védica. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Descubre tu carta — gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-passport-stories',
    hookTemplateId: 'es-rarity-7',
    assetUrl: ANCHOR_BLOBS.story_es_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Tu identidad sideral en una sola tarjeta. El Pasaporte Cósmico de Estrevia reúne tu Sol, Luna y Ascendente en signos reales — calculados con precisión védica. Compartible, precisa, tuya.',
    cta: 'Genera el tuyo gratis',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-es-freechart-stories',
    hookTemplateId: 'es-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.story_es_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calcula tu carta natal sideral sin costo. Precisión védica al ±0.01° contra Swiss Ephemeris. Sin generalizaciones de signo solar, sin predicciones — una mirada honesta a tu cielo real.',
    cta: 'Crear mi carta',
    locale: 'es',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-accuracy-stories',
    hookTemplateId: 'en-identity-reveal-7-anchor',
    assetUrl: ANCHOR_BLOBS.story_en_accuracy,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: "Your real birth chart, calibrated to the actual sky — not the calendar's average. Sidereal astrology with Vedic precision (Lahiri ayanamsa, accurate to ±0.01° against the Swiss Ephemeris). No generic horoscopes, no predictions. A tool for reflection, not fortune-telling.",
    cta: 'See your chart — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-passport-stories',
    hookTemplateId: 'en-rarity-7',
    assetUrl: ANCHOR_BLOBS.story_en_passport,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Your sidereal identity, on a single card. The Estrevia Cosmic Passport gathers your Sun, Moon, and Ascendant in real signs — calculated with Vedic precision. Shareable, precise, yours.',
    cta: 'Generate yours — free',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
  {
    id: 'anchor-2026-05-10-en-freechart-stories',
    hookTemplateId: 'en-lead-magnet-1',
    assetUrl: ANCHOR_BLOBS.story_en_freechart,
    assetKind: 'image',
    generator: 'canva',
    costUsd: 0,
    copy: 'Calculate your sidereal birth chart, free. Vedic precision to ±0.01° against the Swiss Ephemeris. No sun-sign generalizations, no predictions — an honest look at your real sky.',
    cta: 'Create my chart',
    locale: 'en',
    status: 'approved',
    safetyChecks: PRE_APPROVED_CHECKS,
    approvedBy: FOUNDER_EMAIL,
    approvedAt: APPROVED_AT,
  },
];

export async function seed(): Promise<void> {
  const db = getDb();
  console.log(`Seeding ${ANCHORS.length} anchor creatives…`);
  for (const anchor of ANCHORS) {
    await db
      .insert(advertisingCreatives)
      .values(anchor)
      .onConflictDoNothing();
    console.log(`  ✓ ${anchor.id}`);
  }
  console.log('Done.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 9: Add npm script to `package.json`**

In `package.json`, append a new entry to the `scripts` block. Replace the closing of the `scripts` block @ lines 22-23:

Before:
```json
    "advertising:migrate-frequency-caps": "tsx scripts/advertising/migrate-frequency-caps.ts"
  },
```

After:
```json
    "advertising:migrate-frequency-caps": "tsx scripts/advertising/migrate-frequency-caps.ts",
    "advertising:seed-canva-anchors": "tsx scripts/advertising/seed-canva-anchor-creatives.ts"
  },
```

- [ ] **Step 10: Run seed-script tests to verify pass**

```sh
npx vitest run scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 11: Run full typecheck + lint + tests**

```sh
npm run typecheck && npm run lint && npm test
```

Expected: 0 errors, all tests pass.

- [ ] **Step 12: Commit and push**

```sh
git add src/shared/types/advertising/creative.ts \
        scripts/advertising/seed-canva-anchor-creatives.ts \
        scripts/advertising/__tests__/seed-canva-anchor-creatives.test.ts \
        package.json
git commit -m "$(cat <<'EOF'
feat(advertising/anchors): seed 12 Canva brand anchors as pre-approved creatives

Patch 03 — extends GeneratedAsset.generator union with 'canva'; adds
seed-canva-anchor-creatives.ts that inserts 12 manually-reviewed Canva
PNGs (6 feed-format 1080x1350 + 6 stories-format 1080x1920, EN+ES across
3 concepts) into advertising_creatives as pre-approved evergreen anchors.

PNGs hosted on Vercel Blob; uploaded via temporary helper from Canva
exports of designs in Brand Kit kAGT_ANQrn8. All five safety checks
pre-passed via founder review. AI Content Label set automatically by the
upload pipeline (Task 1) since generator='canva' !== 'satori'.

Refs: docs/superpowers/specs/2026-05-10-cowork-audit-roadmap-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 13: Run the seed script against the production DB**

```sh
DATABASE_URL='<prod-neon-url-from-vercel-env>' npm run advertising:seed-canva-anchors
```

Expected: 12 lines `✓ anchor-2026-05-10-...` followed by `Done.`. Idempotent — safe to re-run; `.onConflictDoNothing()` makes a re-run a no-op at the DB level (the script still prints the ✓ lines).

- [ ] **Step 14: Verify count via psql**

```sh
psql "$DATABASE_URL" -c "SELECT COUNT(*), generator, status FROM advertising_creatives WHERE generator='canva' GROUP BY generator, status;"
```

Expected:

```
 count | generator | status
-------+-----------+----------
    12 | canva     | approved
```

If the count is wrong or status differs, investigate before any of the 12 anchors propagate to Meta upload (the next `publish-batch` cron tick will pick them up automatically since `status='approved'` and `meta_ad_id IS NULL`).

---

## Definition of Done

- [ ] AI Content Label badge visible in Meta Ads Manager UI on the Step-1 smoke-test creative
- [ ] `BRAND_PALETTE` in `checks.ts` equals `['#0A0A0F', '#12121A', '#F0F0F5', '#FFD700']`
- [ ] `BRAND_PROMPT` text mentions deep space / dark navy / ivory / gold paired with the correct hex codes
- [ ] `PERSONAL_CLAIM_PATTERNS` rejects every positive case in the new `it.each(...)` and accepts `Cáncer es emocional` and `Virgo placement`
- [ ] `META_POLICY_PROMPT` mentions cosmic dance, some believe, Title Case, Book of Thoth, Eshelman, mocking tropical astrology
- [ ] `HookArchetype` includes `'lead_magnet'`
- [ ] 8 new hook templates in repo: `en-rarity-7`, `en-lead-magnet-1/2/3`, `es-rarity-7`, `es-lead-magnet-1/2/3`
- [ ] `GeneratedAsset.generator` includes `'canva'`
- [ ] `advertising_creatives` has exactly 12 rows where `generator='canva'`, `status='approved'`
- [ ] All 4 commits in `main`; `npm run typecheck`, `npm run lint`, `npm test` all green
- [ ] Backlog items recorded in spec (already present): AI Content Label backfill, Patch 1.3 brandVoiceScore client, Patch 04 visibility layer
