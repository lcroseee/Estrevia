# Marketing-psychology Archetypes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 new hook archetypes (`reciprocity`, `peer_discovery`, `accuracy_gap`) with 12 templates (6 EN + 6 ES) to the creative-gen pipeline, plus an env-gated eligibility helper for `peer_discovery`.

**Architecture:** Pure additive change. Extend `HookArchetype` union, append templates to `hooksEn`/`hooksEs` arrays, add `getEligibleHooks` helper that filters `peer_discovery` unless `PEER_DISCOVERY_ENABLED=true`, migrate the one Meta-facing callsite (`scripts/advertising/generate-launch-batch.ts`).

**Tech Stack:** TypeScript 6 strict, vitest, Next.js 16 App Router. No new dependencies. No schema changes.

**Spec:** `docs/superpowers/specs/2026-05-11-marketing-psychology-archetypes-design.md`

**Notes on spec accuracy (discovered during planning):**
- Spec referenced `src/shared/types/advertising.ts` — actual type lives in `src/shared/types/advertising/creative.ts`.
- Spec said current archetype union has 3 values — actual has 6 (`identity_reveal | authority | rarity | identity_continuation | paywall_nudge | lead_magnet`). Plan extends to 9.
- Spec said callsites need migrating in `creative-gen/batch/*` and `creative-gen/generators/*` — actual: only `scripts/advertising/generate-launch-batch.ts` imports `allHooks` from templates externally.

---

## Task 1: Extend `HookArchetype` union

**Files:**
- Modify: `src/shared/types/advertising/creative.ts:1-2`

- [ ] **Step 1: Read current type definition**

Run: `Read src/shared/types/advertising/creative.ts` to confirm line 1-2 still match expected union.
Expected (lines 1-2):
```typescript
export type HookArchetype = 'identity_reveal' | 'authority' | 'rarity'
  | 'identity_continuation' | 'paywall_nudge' | 'lead_magnet';
```

- [ ] **Step 2: Extend the union**

Replace lines 1-2 with:

```typescript
export type HookArchetype = 'identity_reveal' | 'authority' | 'rarity'
  | 'identity_continuation' | 'paywall_nudge' | 'lead_magnet'
  | 'reciprocity' | 'peer_discovery' | 'accuracy_gap';
```

- [ ] **Step 3: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: no new errors. Existing hooks files compile because they only use the original 6 values.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/advertising/creative.ts
git commit -m "feat(advertising/creative-gen): extend HookArchetype with 3 marketing-psychology values

Adds reciprocity / peer_discovery / accuracy_gap to the union.
Templates land in subsequent commits."
```

---

## Task 2: Add `reciprocity` templates (EN + ES) + tests

**Files:**
- Modify: `src/modules/advertising/creative-gen/templates/hooks-en.ts` (append)
- Modify: `src/modules/advertising/creative-gen/templates/hooks-es.ts` (append)
- Modify: `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts` (extend coverage)
- Modify: `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts` (extend coverage)

- [ ] **Step 1: Write failing tests for EN**

Append to `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts` inside the existing `describe('hooks-en', ...)` block (before the closing `});`):

```typescript
  it('contains the reciprocity archetype with at least 2 templates', () => {
    const reciprocityHooks = hooksEn.filter(h => h.archetype === 'reciprocity');
    expect(reciprocityHooks.length).toBeGreaterThanOrEqual(2);
  });

  it('reciprocity templates have non-empty policy_constraints', () => {
    const reciprocityHooks = hooksEn.filter(h => h.archetype === 'reciprocity');
    for (const h of reciprocityHooks) {
      expect(h.policy_constraints.length).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 2: Run EN test, verify FAIL**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts -t reciprocity`
Expected: 2 failures — `reciprocityHooks.length` is 0.

- [ ] **Step 3: Append 2 EN reciprocity templates**

Append to `src/modules/advertising/creative-gen/templates/hooks-en.ts` inside the `hooksEn` array, after the last existing entry (before the closing `];`):

```typescript
  // ---------------------------------------------------------------------------
  // ARCHETYPE: reciprocity
  // Frames Estrevia as offering reciprocal value (free chart, no signup).
  // Third-person / impersonal per Meta policy. No fortune-telling.
  // ---------------------------------------------------------------------------
  {
    id: 'en-reciprocity-1',
    name: 'Reciprocity — Free Chart, No Signup',
    archetype: 'reciprocity',
    copy_template:
      'A sidereal natal chart, calculated from where the planets actually appear in the sky. Free, no signup.',
    visual_mood: 'inviting cosmic gradient with gentle star field, no human figures',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'factual offer — no fortune-telling, no predictive language',
      'landing page must actually deliver free chart (no post-click signup wall)',
      'no second-person personal claims about viewer',
    ],
  },
  {
    id: 'en-reciprocity-2',
    name: 'Reciprocity — Open-source Ephemeris',
    archetype: 'reciprocity',
    copy_template:
      'The same Swiss Ephemeris algorithm professional astronomers use — opened up as a free chart calculator.',
    visual_mood: 'cosmic gradient with subtle astronomical instruments, no faces',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'Swiss Ephemeris is a real open-source library — accurate claim, cite at landing page',
      'no fortune-telling',
      'no second-person personal claims',
    ],
  },
```

- [ ] **Step 4: Run EN test, verify PASS**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts -t reciprocity`
Expected: both reciprocity tests pass. Also re-run full file to confirm no regression: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts`.

- [ ] **Step 5: Write failing tests for ES**

Append to `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts` inside the existing top-level `describe('hooks-es', ...)` block:

```typescript
  it('contains the reciprocity archetype with at least 2 templates', () => {
    const reciprocityHooks = hooksEs.filter(h => h.archetype === 'reciprocity');
    expect(reciprocityHooks.length).toBeGreaterThanOrEqual(2);
  });

  it('reciprocity ES templates have non-empty policy_constraints', () => {
    const reciprocityHooks = hooksEs.filter(h => h.archetype === 'reciprocity');
    for (const h of reciprocityHooks) {
      expect(h.policy_constraints.length).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 6: Run ES test, verify FAIL**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts -t reciprocity`
Expected: 2 failures.

- [ ] **Step 7: Append 2 ES reciprocity templates**

Append to `src/modules/advertising/creative-gen/templates/hooks-es.ts` inside `hooksEs` array:

```typescript
  // ---------------------------------------------------------------------------
  // ARCHETYPE: reciprocity
  // Carta gratuita sin registro — español neutro LATAM, no "usted".
  // ---------------------------------------------------------------------------
  {
    id: 'es-reciprocity-1',
    name: 'Reciprocidad — Carta Gratuita, Sin Registro',
    archetype: 'reciprocity',
    copy_template:
      'Una carta natal sidérea, calculada desde donde los planetas realmente aparecen en el cielo. Gratis, sin registro.',
    visual_mood: 'inviting cosmic gradient with gentle star field, no human figures',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'español neutro LATAM — no "usted"',
      'factual offer — no fortune-telling',
      'landing page must actually deliver free chart',
    ],
  },
  {
    id: 'es-reciprocity-2',
    name: 'Reciprocidad — Efemérides Abiertas',
    archetype: 'reciprocity',
    copy_template:
      'El mismo algoritmo Swiss Ephemeris que usan los astrónomos profesionales — abierto como calculadora de carta gratuita.',
    visual_mood: 'cosmic gradient with subtle astronomical instruments, no faces',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'español neutro LATAM — no "usted"',
      'Swiss Ephemeris is a real library — accurate claim',
      'no fortune-telling',
    ],
  },
```

- [ ] **Step 8: Run ES test, verify PASS**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts`
Expected: full file passes including new reciprocity tests.

- [ ] **Step 9: Commit**

```bash
git add src/modules/advertising/creative-gen/templates/hooks-en.ts \
        src/modules/advertising/creative-gen/templates/hooks-es.ts \
        src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts \
        src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts
git commit -m "feat(advertising/creative-gen): add reciprocity archetype templates

2 EN + 2 ES templates framing free chart calculator as reciprocal value.
No personal claims, no fortune-telling, español neutro LATAM."
```

---

## Task 3: Add `peer_discovery` templates (EN + ES) + tests

**Files:**
- Modify: `src/modules/advertising/creative-gen/templates/hooks-en.ts` (append)
- Modify: `src/modules/advertising/creative-gen/templates/hooks-es.ts` (append)
- Modify: `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts` (extend coverage)
- Modify: `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts` (extend coverage)

- [ ] **Step 1: Write failing tests for EN**

Append to `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts`:

```typescript
  it('contains the peer_discovery archetype with at least 2 templates', () => {
    const peerHooks = hooksEn.filter(h => h.archetype === 'peer_discovery');
    expect(peerHooks.length).toBeGreaterThanOrEqual(2);
  });

  it('peer_discovery templates declare env-gate in policy_constraints', () => {
    const peerHooks = hooksEn.filter(h => h.archetype === 'peer_discovery');
    for (const h of peerHooks) {
      const hasGateNote = h.policy_constraints.some(c =>
        c.includes('PEER_DISCOVERY_ENABLED'),
      );
      expect(hasGateNote, `${h.id} missing env-gate constraint`).toBe(true);
    }
  });
```

- [ ] **Step 2: Run EN test, verify FAIL**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts -t peer_discovery`
Expected: 2 failures.

- [ ] **Step 3: Append 2 EN peer_discovery templates**

Append to `src/modules/advertising/creative-gen/templates/hooks-en.ts`:

```typescript
  // ---------------------------------------------------------------------------
  // ARCHETYPE: peer_discovery
  // Social proof — qualitative count only ("thousands", "many"). Env-gated:
  // emission blocked until PostHog chart_calculated events ≥ 2000.
  // ---------------------------------------------------------------------------
  {
    id: 'en-peer-discovery-1',
    name: 'Peer Discovery — Thousands of Sidereal Charts',
    archetype: 'peer_discovery',
    copy_template:
      'Thousands have run their sidereal natal chart in the last weeks. Most popular apps still use tropical positions standardised over 2,000 years ago.',
    visual_mood: 'discovery-revelation gradient with subtle star field, no human faces',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'requires PEER_DISCOVERY_ENABLED=true env var',
      'qualitative count only ("thousands") — backed by ≥2000 PostHog chart_calculated events',
      'no manipulative scarcity, no fake urgency',
      'no mocking tropical astrology — historical framing only',
    ],
  },
  {
    id: 'en-peer-discovery-2',
    name: 'Peer Discovery — Sidereal Practitioners Report',
    archetype: 'peer_discovery',
    copy_template:
      'Many sidereal practitioners report their tropical sun sign differs from the position calculated tonight.',
    visual_mood: 'cosmic gradient with subtle constellation outlines',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'requires PEER_DISCOVERY_ENABLED=true env var',
      'qualitative count only ("many") — never a specific number',
      'no personal claims about viewer',
      'factual astronomical claim only',
    ],
  },
```

- [ ] **Step 4: Run EN test, verify PASS**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts`
Expected: all hooks-en tests pass.

- [ ] **Step 5: Write failing tests for ES**

Append to `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts`:

```typescript
  it('contains the peer_discovery archetype with at least 2 templates', () => {
    const peerHooks = hooksEs.filter(h => h.archetype === 'peer_discovery');
    expect(peerHooks.length).toBeGreaterThanOrEqual(2);
  });

  it('peer_discovery ES templates declare env-gate in policy_constraints', () => {
    const peerHooks = hooksEs.filter(h => h.archetype === 'peer_discovery');
    for (const h of peerHooks) {
      const hasGateNote = h.policy_constraints.some(c =>
        c.includes('PEER_DISCOVERY_ENABLED'),
      );
      expect(hasGateNote, `${h.id} missing env-gate constraint`).toBe(true);
    }
  });
```

- [ ] **Step 6: Run ES test, verify FAIL**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts -t peer_discovery`
Expected: 2 failures.

- [ ] **Step 7: Append 2 ES peer_discovery templates**

Append to `src/modules/advertising/creative-gen/templates/hooks-es.ts`:

```typescript
  // ---------------------------------------------------------------------------
  // ARCHETYPE: peer_discovery
  // Social proof — gated por PEER_DISCOVERY_ENABLED, español neutro LATAM.
  // ---------------------------------------------------------------------------
  {
    id: 'es-peer-discovery-1',
    name: 'Descubrimiento — Miles de Cartas Sidéreas',
    archetype: 'peer_discovery',
    copy_template:
      'Miles han calculado su carta natal sidérea en las últimas semanas. La mayoría de apps populares siguen usando posiciones tropicales estandarizadas hace más de 2.000 años.',
    visual_mood: 'discovery-revelation gradient with subtle star field, no human faces',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'requires PEER_DISCOVERY_ENABLED=true env var',
      'español neutro LATAM — no "usted"',
      'cantidad cualitativa solamente ("miles") — respaldada por ≥2000 PostHog events',
      'no manipulative scarcity',
    ],
  },
  {
    id: 'es-peer-discovery-2',
    name: 'Descubrimiento — Practicantes Siderales',
    archetype: 'peer_discovery',
    copy_template:
      'Muchos practicantes siderales descubren que su signo solar tropical difiere de la posición calculada esta noche.',
    visual_mood: 'cosmic gradient with subtle constellation outlines',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'requires PEER_DISCOVERY_ENABLED=true env var',
      'español neutro LATAM — no "usted"',
      'cualitativo ("muchos") — sin número específico',
      'factual astronomical claim only',
    ],
  },
```

- [ ] **Step 8: Run ES test, verify PASS**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts`
Expected: all hooks-es tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/modules/advertising/creative-gen/templates/hooks-en.ts \
        src/modules/advertising/creative-gen/templates/hooks-es.ts \
        src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts \
        src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts
git commit -m "feat(advertising/creative-gen): add peer_discovery archetype templates

2 EN + 2 ES templates with qualitative social proof. Each template's
policy_constraints declares the PEER_DISCOVERY_ENABLED env-gate that
will be wired in Task 5."
```

---

## Task 4: Add `accuracy_gap` templates (EN + ES) + tests

**Files:**
- Modify: `src/modules/advertising/creative-gen/templates/hooks-en.ts` (append)
- Modify: `src/modules/advertising/creative-gen/templates/hooks-es.ts` (append)
- Modify: `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts` (extend coverage)
- Modify: `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts` (extend coverage)

- [ ] **Step 1: Write failing tests for EN**

Append to `src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts`:

```typescript
  it('contains the accuracy_gap archetype with at least 2 templates', () => {
    const gapHooks = hooksEn.filter(h => h.archetype === 'accuracy_gap');
    expect(gapHooks.length).toBeGreaterThanOrEqual(2);
  });

  it('accuracy_gap templates have non-empty policy_constraints', () => {
    const gapHooks = hooksEn.filter(h => h.archetype === 'accuracy_gap');
    for (const h of gapHooks) {
      expect(h.policy_constraints.length).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 2: Run EN test, verify FAIL**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts -t accuracy_gap`
Expected: 2 failures.

- [ ] **Step 3: Append 2 EN accuracy_gap templates**

Append to `src/modules/advertising/creative-gen/templates/hooks-en.ts`:

```typescript
  // ---------------------------------------------------------------------------
  // ARCHETYPE: accuracy_gap
  // Loss aversion — frames stale-tropical as cost. Factual / historical only,
  // no mocking. No env gate.
  // ---------------------------------------------------------------------------
  {
    id: 'en-accuracy-gap-1',
    name: 'Accuracy Gap — Axial Precession',
    archetype: 'accuracy_gap',
    copy_template:
      "The ~24° axial precession between ancient tropical astrology and tonight's sky never made it into most popular sun-sign apps.",
    visual_mood: 'historical-to-modern transition; star precession diagram acceptable',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'factual astronomical figure (24°) — verified',
      'no mocking tropical astrology — historical framing only',
      'no fortune-telling, no predictive language',
    ],
  },
  {
    id: 'en-accuracy-gap-2',
    name: 'Accuracy Gap — Before Galileo',
    archetype: 'accuracy_gap',
    copy_template:
      'Tropical sun-sign apps were standardised before Galileo. Sidereal calculation uses the stars as they are tonight.',
    visual_mood: 'split-screen historical-to-modern transition',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'en',
    policy_constraints: [
      'factual historical anchor (Galileo died 1642)',
      'no mocking tropical astrology — historical framing only',
      'no fortune-telling',
    ],
  },
```

- [ ] **Step 4: Run EN test, verify PASS**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts`
Expected: all hooks-en tests pass.

- [ ] **Step 5: Write failing tests for ES**

Append to `src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts`:

```typescript
  it('contains the accuracy_gap archetype with at least 2 templates', () => {
    const gapHooks = hooksEs.filter(h => h.archetype === 'accuracy_gap');
    expect(gapHooks.length).toBeGreaterThanOrEqual(2);
  });

  it('accuracy_gap ES templates have non-empty policy_constraints', () => {
    const gapHooks = hooksEs.filter(h => h.archetype === 'accuracy_gap');
    for (const h of gapHooks) {
      expect(h.policy_constraints.length).toBeGreaterThan(0);
    }
  });
```

- [ ] **Step 6: Run ES test, verify FAIL**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts -t accuracy_gap`
Expected: 2 failures.

- [ ] **Step 7: Append 2 ES accuracy_gap templates**

Append to `src/modules/advertising/creative-gen/templates/hooks-es.ts`:

```typescript
  // ---------------------------------------------------------------------------
  // ARCHETYPE: accuracy_gap
  // Aversión a la pérdida — deriva tropical como costo, español neutro LATAM.
  // ---------------------------------------------------------------------------
  {
    id: 'es-accuracy-gap-1',
    name: 'Brecha de Precisión — Precesión Axial',
    archetype: 'accuracy_gap',
    copy_template:
      'La precesión axial de ~24° entre la astrología tropical antigua y el cielo de esta noche no ha llegado a la mayoría de apps populares de signo solar.',
    visual_mood: 'historical-to-modern transition; star precession diagram acceptable',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'español neutro LATAM — no "usted"',
      'factual astronomical figure (24°)',
      'no mocking tropical astrology',
    ],
  },
  {
    id: 'es-accuracy-gap-2',
    name: 'Brecha de Precisión — Antes de Galileo',
    archetype: 'accuracy_gap',
    copy_template:
      'Las apps de signo solar tropical fueron estandarizadas antes de Galileo. El cálculo sidéreo usa las estrellas como están esta noche.',
    visual_mood: 'split-screen historical-to-modern transition',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'español neutro LATAM — no "usted"',
      'factual historical anchor (Galileo)',
      'no mocking tropical astrology',
    ],
  },
```

- [ ] **Step 8: Run ES test, verify PASS**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts`
Expected: all hooks-es tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/modules/advertising/creative-gen/templates/hooks-en.ts \
        src/modules/advertising/creative-gen/templates/hooks-es.ts \
        src/modules/advertising/creative-gen/templates/__tests__/hooks-en.test.ts \
        src/modules/advertising/creative-gen/templates/__tests__/hooks-es.test.ts
git commit -m "feat(advertising/creative-gen): add accuracy_gap archetype templates

2 EN + 2 ES templates framing tropical-sidereal drift as loss.
Factual historical anchors (24° precession, before Galileo).
No env gate — accuracy_gap is unconditionally eligible."
```

---

## Task 5: Add `getEligibleHooks` helper

**Files:**
- Modify: `src/modules/advertising/creative-gen/templates/index.ts`
- Create: `src/modules/advertising/creative-gen/templates/__tests__/eligibility.test.ts`

- [ ] **Step 1: Write failing test file**

Create `src/modules/advertising/creative-gen/templates/__tests__/eligibility.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getEligibleHooks } from '../index';

describe('getEligibleHooks — peer_discovery env gate', () => {
  it('excludes peer_discovery when PEER_DISCOVERY_ENABLED=false', () => {
    const eligible = getEligibleHooks('en', { PEER_DISCOVERY_ENABLED: 'false' });
    expect(eligible.some(h => h.archetype === 'peer_discovery')).toBe(false);
  });

  it('excludes peer_discovery when PEER_DISCOVERY_ENABLED is undefined', () => {
    const eligible = getEligibleHooks('en', {});
    expect(eligible.some(h => h.archetype === 'peer_discovery')).toBe(false);
  });

  it('excludes peer_discovery for arbitrary non-true values (fail-safe)', () => {
    const eligible = getEligibleHooks('en', { PEER_DISCOVERY_ENABLED: '1' });
    expect(eligible.some(h => h.archetype === 'peer_discovery')).toBe(false);
  });

  it('includes peer_discovery when PEER_DISCOVERY_ENABLED=true', () => {
    const eligible = getEligibleHooks('en', { PEER_DISCOVERY_ENABLED: 'true' });
    expect(eligible.some(h => h.archetype === 'peer_discovery')).toBe(true);
  });

  it('includes reciprocity regardless of env (no gate)', () => {
    const eligible = getEligibleHooks('en', {});
    expect(eligible.some(h => h.archetype === 'reciprocity')).toBe(true);
  });

  it('includes accuracy_gap regardless of env (no gate)', () => {
    const eligible = getEligibleHooks('en', {});
    expect(eligible.some(h => h.archetype === 'accuracy_gap')).toBe(true);
  });

  it('returns the same locale as requested', () => {
    const esEligible = getEligibleHooks('es', {});
    for (const h of esEligible) {
      expect(h.locale).toBe('es');
    }
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/eligibility.test.ts`
Expected: import error — `getEligibleHooks` not exported.

- [ ] **Step 3: Read current index.ts**

Run: `Read src/modules/advertising/creative-gen/templates/index.ts` (full file — only ~38 lines).

- [ ] **Step 4: Add `getEligibleHooks` export**

Append to `src/modules/advertising/creative-gen/templates/index.ts` (after `getHooksByArchetype` function, before EOF):

```typescript
/**
 * Returns hook templates for a locale, filtering out archetypes that are
 * env-gated until prerequisites are met.
 *
 * Currently the only env-gated archetype is `peer_discovery`, which requires
 * verifiable social-proof backing (≥2000 PostHog `chart_calculated` events).
 * Founder flips `PEER_DISCOVERY_ENABLED=true` in Vercel env after manual
 * confirmation.
 *
 * Fail-safe: any value other than the literal string 'true' keeps the gate
 * closed.
 *
 * @param locale Target locale.
 * @param env    Environment record; defaults to `process.env`. Injectable for tests.
 */
export function getEligibleHooks(
  locale: 'en' | 'es',
  env: { PEER_DISCOVERY_ENABLED?: string } = process.env,
): HookTemplate[] {
  const all = getHooksByLocale(locale);
  const peerDiscoveryEnabled = env.PEER_DISCOVERY_ENABLED === 'true';
  return peerDiscoveryEnabled
    ? all
    : all.filter(h => h.archetype !== 'peer_discovery');
}
```

- [ ] **Step 5: Run test, verify PASS**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/eligibility.test.ts`
Expected: all 7 assertions pass.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/modules/advertising/creative-gen/templates/index.ts \
        src/modules/advertising/creative-gen/templates/__tests__/eligibility.test.ts
git commit -m "feat(advertising/creative-gen): add getEligibleHooks env-gate helper

Filters peer_discovery archetype from template selection unless
PEER_DISCOVERY_ENABLED=true. Default is closed (fail-safe).
Injectable env parameter for unit tests."
```

---

## Task 6: Migrate `scripts/advertising/generate-launch-batch.ts` to `getEligibleHooks`

**Files:**
- Modify: `scripts/advertising/generate-launch-batch.ts:8` (import), `:139` (call)

- [ ] **Step 1: Read current import + usage**

Run: `Read scripts/advertising/generate-launch-batch.ts:1-20` and `Read scripts/advertising/generate-launch-batch.ts:135-180`.
Confirm line 8 imports `allHooks` and line 139 calls `stripDurationFromHooks(allHooks)`.

- [ ] **Step 2: Replace the import**

In `scripts/advertising/generate-launch-batch.ts` line 8:

```diff
- import { allHooks } from '@/modules/advertising/creative-gen/templates';
+ import { getEligibleHooks } from '@/modules/advertising/creative-gen/templates';
```

- [ ] **Step 3: Replace the usage**

In `scripts/advertising/generate-launch-batch.ts` around line 139, change the line that builds the hook list. The exact context (read line 135-145 first):

```diff
- const imageOnlyHooks = stripDurationFromHooks(allHooks);
+ const imageOnlyHooks = stripDurationFromHooks([
+   ...getEligibleHooks('en'),
+   ...getEligibleHooks('es'),
+ ]);
```

The pre-existing function `stripDurationFromHooks` is locale-agnostic, so concatenating EN+ES eligible hooks preserves the prior behaviour exactly — minus any `peer_discovery` templates when the env-gate is off.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: clean. `getEligibleHooks` returns `HookTemplate[]` — same type as `allHooks`.

- [ ] **Step 5: Verify CLI smoke (dry-run, no Meta call)**

Run (with default env, peer_discovery gate closed):
```bash
PEER_DISCOVERY_ENABLED=false npm run advertising:generate-launch-batch -- --dry-run 2>&1 | head -40
```

Expected: command runs, prints summary of templates picked. None of the IDs contain `peer-discovery`.

If `--dry-run` is not a supported flag, instead inspect the script's behavior with a unit-test-style approach: search for `peer-discovery` in the script output. Skip this step entirely if the dry-run requires Meta credentials and they aren't loaded — Task 8's full test suite covers correctness.

- [ ] **Step 6: Commit**

```bash
git add scripts/advertising/generate-launch-batch.ts
git commit -m "feat(advertising/scripts): use getEligibleHooks in launch-batch CLI

Replaces direct allHooks import with the env-gated helper.
peer_discovery templates are excluded until PEER_DISCOVERY_ENABLED=true."
```

---

## Task 7: Add `.env.example` entry

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Find appropriate section in `.env.example`**

Run: `grep -n "ADVERTISING\|META_\|POSTHOG" .env.example | head -10` to locate the advertising env-var section.

- [ ] **Step 2: Append entry**

Add to `.env.example` near the other `ADVERTISING_*` entries (exact location: after the last `ADVERTISING_*` line — use the grep result to locate, append below it):

```bash
# Marketing-psychology archetypes — peer_discovery requires verifiable
# social-proof backing. Flip to "true" only after PostHog chart_calculated
# events reach ≥2000 in production (manual check via PostHog UI).
# Default off — peer_discovery hooks are filtered out of creative-gen pipeline.
PEER_DISCOVERY_ENABLED=false
```

- [ ] **Step 3: Verify the file is still valid bash-comment shape**

Run: `grep -A 4 "PEER_DISCOVERY" .env.example`
Expected: the 4 comment lines + the env var assignment.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs(advertising/env): add PEER_DISCOVERY_ENABLED with rationale

Default off. Founder flips after manual PostHog check ≥2000
chart_calculated events. Production: vercel env add."
```

---

## Task 8: Final verification

**Files:** none modified.

- [ ] **Step 1: Run full advertising templates test suite**

Run: `npx vitest run src/modules/advertising/creative-gen/templates/__tests__/`
Expected: all tests pass — hooks-en, hooks-es, eligibility. Total: existing + 6 reciprocity/peer_discovery/accuracy_gap assertions + 7 eligibility assertions.

- [ ] **Step 2: Run typecheck across whole repo**

Run: `npm run typecheck`
Expected: clean. The `HookArchetype` union extension is non-breaking — all existing consumers narrow to the original 6 values.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Sanity-check the new templates pass safety regex**

Run a quick vitest one-liner that pipes new templates through `personalClaimCheck`:

```bash
npx vitest run -t "all hooks use third-person framing" \
  src/modules/advertising/creative-gen/templates/__tests__/
```

Expected: all hooks pass — the existing "third-person framing" assertions in `hooks-en.test.ts` and `hooks-es.test.ts` already iterate over the full arrays.

- [ ] **Step 5: Verify git log shows the expected commit sequence**

Run: `git log --oneline -10`
Expected to see (most recent first):
```
<sha> docs(advertising/env): add PEER_DISCOVERY_ENABLED with rationale
<sha> feat(advertising/scripts): use getEligibleHooks in launch-batch CLI
<sha> feat(advertising/creative-gen): add getEligibleHooks env-gate helper
<sha> feat(advertising/creative-gen): add accuracy_gap archetype templates
<sha> feat(advertising/creative-gen): add peer_discovery archetype templates
<sha> feat(advertising/creative-gen): add reciprocity archetype templates
<sha> feat(advertising/creative-gen): extend HookArchetype with 3 marketing-psychology values
<sha> docs(advertising): marketing-psychology archetypes design spec
```

- [ ] **Step 6: No final commit needed**

Task 8 is verification only — no code change. If any check failed, return to the relevant task and fix.

---

## Acceptance summary

After Task 8 passes:

- ✅ `HookArchetype` union has 9 values (6 original + 3 new)
- ✅ 12 new templates exist (6 EN + 6 ES across 3 archetypes)
- ✅ `getEligibleHooks` exists and filters `peer_discovery` by default
- ✅ `scripts/advertising/generate-launch-batch.ts` uses `getEligibleHooks`
- ✅ `.env.example` documents `PEER_DISCOVERY_ENABLED`
- ✅ All tests pass, typecheck clean, lint clean
- ✅ 7 commits on `main` matching the conventional-commit scope used in the repo

Post-merge production smoke (per spec, separate from plan):

- Founder verifies `vercel env ls production | grep PEER_DISCOVERY_ENABLED` returns `false` (no accidental flip)
- Next `triage-daily` cron tick runs to completion (no creative-gen errors in Sentry)
- Optional manual: trigger `advertising:generate-launch-batch` dry-run; confirm `reciprocity` and `accuracy_gap` templates appear in output and `peer_discovery` does not

Rollback per spec § Rollback procedures — `git revert` of all 7 commits restores the prior 3-archetype taxonomy in one deploy.
