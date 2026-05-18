# Wave 2 Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all six founder-owed Wave 2 items via three parallel theme tracks: Ops (PostHog flag), Measurement (baseline doc + dashboards + smoke), Content (chart-keywords + email body rewrites + ES review).

**Architecture:** Three independent tracks sharing no mutable state. Tracks parallelize during the I-work session; founder consumes async deliverables (Vercel CLI upgrade, smoke test, ES review). One commit per logical item, push withheld until founder ES sign-off.

**Tech Stack:** Node 25, Next.js 16, React 19, TypeScript 6, Drizzle ORM, Neon Postgres, PostHog REST API, Resend (email), Vercel CLI, vitest.

**Spec:** `docs/superpowers/specs/2026-05-17-wave-2-closeout-design.md` (commit `499ef07`)

---

## Sequencing for Parallel Dispatch

Tasks 1, 2, 3 are mutually independent — different APIs, different files, different concerns. Dispatch in parallel as Wave A.

Tasks 4, 5, 6 are independent given Wave A complete. Dispatch in parallel as Wave B.

Task 7 depends on Tasks 3, 5, 6 (collects ES strings produced by all three). Serial Wave C.

Task 8 depends on all of 1-7. Final wave.

```
Wave A (parallel, 3 subagents):  Task 1 (PostHog flag) ∥ Task 2 (baseline doc) ∥ Task 3 (SynastryTeaser fix)
Wave B (parallel, 3 subagents):  Task 4 (PostHog dashboards) ∥ Task 5 (chart-keywords) ∥ Task 6 (SaturnWeekly)
Wave C (serial, 1 subagent):     Task 7 (ES review doc)
Wave D (serial, 1 subagent):     Task 8 (memory update + status report)
```

Async founder tasks (NOT in this plan):
- Vercel CLI upgrade (anytime): `npm i -g vercel@latest` → verify `vercel --version` ≥ 54.x
- Smoke test (after Tasks 2+4): per `docs/runbooks/founder-first-purchase-smoke.md`
- ES review (after Task 7): annotate `outputs/wave-2-es-review/strings-to-review.md` with `ok` or `→ rewrite to: ...` per row
- Push (after founder ES sign-off): `git push origin main`

---

## Pre-flight: Environment Setup

Every subagent that touches PostHog API or Neon DB must have `.env` loaded. The repo's `.env` file already contains:
- `DATABASE_URL` — prod Neon endpoint
- `POSTHOG_PERSONAL_API_KEY` — write-scope key for project 407908

If `.env` is missing locally (subagent in fresh worktree), run:

```bash
vercel env pull .env --environment=production --yes
```

To extract a single env variable safely from `.env` in a script:

```javascript
import { readFileSync } from 'fs';
const env = readFileSync('.env', 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(`${k}=`))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
const POSTHOG_KEY = get('POSTHOG_PERSONAL_API_KEY');
const DB_URL = get('DATABASE_URL');
```

---

## Task 1: Create PostHog `wave2-demo-flag` via API

**Files:**
- Create: `scripts/wave2-closeout/_seed_posthog_demo_flag.mjs` (inline-and-delete — do not commit)

**Subagent context required:** spec sections 4.A1, 11.

- [ ] **Step 1: Verify env var present**

Run from project root:
```bash
test -f .env && grep -q "^POSTHOG_PERSONAL_API_KEY=" .env && echo "OK" || echo "MISSING"
```

Expected: `OK`. If `MISSING`, run `vercel env pull .env --environment=production --yes` first.

- [ ] **Step 2: Write seed script**

Create `scripts/wave2-closeout/_seed_posthog_demo_flag.mjs`:

```javascript
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(`${k}=`))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
const API_KEY = get('POSTHOG_PERSONAL_API_KEY');
if (!API_KEY) throw new Error('POSTHOG_PERSONAL_API_KEY missing in .env');

const BASE = 'https://us.posthog.com/api/projects/407908';
const HEADERS = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

// 1. Check if flag already exists (idempotent)
const checkRes = await fetch(`${BASE}/feature_flags/?search=wave2-demo-flag`, { headers: HEADERS });
const checkBody = await checkRes.json();
if (!checkRes.ok) {
  console.error('Auth check failed:', checkRes.status, checkBody);
  process.exit(1);
}
const existing = checkBody.results?.find(f => f.key === 'wave2-demo-flag');
if (existing) {
  console.log(`Flag wave2-demo-flag already exists (id=${existing.id}, active=${existing.active}) — skip create.`);
  process.exit(0);
}

// 2. Create
const createRes = await fetch(`${BASE}/feature_flags/`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify({
    key: 'wave2-demo-flag',
    name: 'Wave 2 demo flag (docs validation)',
    filters: { groups: [{ rollout_percentage: 0 }] },
    active: true,
  }),
});
const createBody = await createRes.json();
if (!createRes.ok) {
  console.error('Create failed:', createRes.status, createBody);
  process.exit(1);
}
console.log(`Flag created: id=${createBody.id}, key=${createBody.key}, active=${createBody.active}`);
```

- [ ] **Step 3: Run seed script**

```bash
node scripts/wave2-closeout/_seed_posthog_demo_flag.mjs
```

Expected one of:
- `Flag wave2-demo-flag already exists (id=NNN, active=true) — skip create.` (idempotent)
- `Flag created: id=NNN, key=wave2-demo-flag, active=true`

If `Auth check failed: 403`: API key scope is wrong. Stop, write fall-back to baseline doc instead (Task 2 covers this).

- [ ] **Step 4: Verify via independent GET**

```bash
node -e "
import('fs').then(async ({ readFileSync }) => {
  const env = readFileSync('.env', 'utf8');
  const get = (k) => env.split('\n').find(l => l.startsWith(k+'=')).split('=').slice(1).join('=').trim();
  const r = await fetch('https://us.posthog.com/api/projects/407908/feature_flags/?search=wave2-demo-flag', {
    headers: { Authorization: 'Bearer ' + get('POSTHOG_PERSONAL_API_KEY') }
  });
  const b = await r.json();
  const f = b.results?.find(x => x.key === 'wave2-demo-flag');
  console.log(f ? 'VERIFIED: ' + JSON.stringify({id: f.id, key: f.key, active: f.active}) : 'NOT FOUND');
});
"
```

Expected: `VERIFIED: {"id":NNN,"key":"wave2-demo-flag","active":true}`

- [ ] **Step 5: Delete the seed script (inline-and-delete pattern)**

```bash
rm scripts/wave2-closeout/_seed_posthog_demo_flag.mjs
```

Verify removed:
```bash
ls scripts/wave2-closeout/ 2>/dev/null
```

Expected: no `_seed_posthog_demo_flag.mjs` listed (directory may not exist if empty — that's fine).

- [ ] **Step 6: Commit**

Note: there is no file artifact to commit. Create a documentation-only marker so the change is auditable via `git log`:

```bash
mkdir -p outputs/wave-1-checkpoint
cat > outputs/wave-1-checkpoint/.posthog-demo-flag-created <<EOF
PostHog wave2-demo-flag created in project 407908 on $(date -u +%Y-%m-%dT%H:%M:%SZ).
Verification: GET /api/projects/407908/feature_flags/?search=wave2-demo-flag returns 1 result.
Method: REST API via scripts/wave2-closeout/_seed_posthog_demo_flag.mjs (inline-and-delete).
EOF

git add outputs/wave-1-checkpoint/.posthog-demo-flag-created
git commit -m "chore(wave2/posthog): create wave2-demo-flag for docs validation

Reference flag for useFeatureFlag() docs example in
docs/posthog/feature-flags-guide.md:66. Not wired to production logic.

Created via REST API (POST /api/projects/407908/feature_flags/) with
rollout_percentage=0, active=true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Write Baseline Doc

**Files:**
- Create: `outputs/wave-1-checkpoint/00-baseline.md`
- Create+delete: `scripts/wave2-closeout/_query_baseline_metrics.mjs` (inline-and-delete)

**Subagent context required:** spec section 4.B1.

- [ ] **Step 1: Write metrics query script**

Create `scripts/wave2-closeout/_query_baseline_metrics.mjs`:

```javascript
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(`${k}=`))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
const DB = get('DATABASE_URL');
const sql = neon(DB);

const out = {};

// charts /30d
const [{ count: charts30 }] = await sql`
  SELECT COUNT(*)::int as count FROM temp_charts
  WHERE created_at > NOW() - INTERVAL '30 days'`;
out.charts_30d = charts30;

// email_leads total
const [{ count: leads }] = await sql`SELECT COUNT(*)::int as count FROM email_leads`;
out.email_leads_total = leads;

// email_leads /30d for gate-rate
const [{ count: leads30 }] = await sql`
  SELECT COUNT(*)::int as count FROM email_leads
  WHERE created_at > NOW() - INTERVAL '30 days'`;
out.email_leads_30d = leads30;
out.gate_conversion_pct = charts30 > 0 ? Math.round((leads30 / charts30) * 1000) / 10 : null;

// sent_lead_emails by type
const sentByType = await sql`
  SELECT email_type, COUNT(*)::int as count FROM sent_lead_emails
  GROUP BY email_type ORDER BY email_type`;
out.sent_lead_emails = Object.fromEntries(sentByType.map(r => [r.email_type, r.count]));
out.sent_lead_emails_total = sentByType.reduce((a, r) => a + r.count, 0);

// sent_lead_emails NULL msgid (Sev1 historical residue)
const [{ count: nullMsgid }] = await sql`
  SELECT COUNT(*)::int as count FROM sent_lead_emails WHERE resend_message_id IS NULL`;
out.sent_lead_emails_null_msgid = nullMsgid;

// chart_readings (paywall conversion proxy)
try {
  const [{ count: readings }] = await sql`SELECT COUNT(*)::int as count FROM chart_readings`;
  out.chart_readings_total = readings;
} catch (e) {
  out.chart_readings_total = `error: ${e.message}`;
}

// lead → user conversion (count of email_leads.converted_to_user_id NOT NULL)
const [{ count: converted }] = await sql`
  SELECT COUNT(*)::int as count FROM email_leads WHERE converted_to_user_id IS NOT NULL`;
out.lead_to_user_conversions = converted;
out.lead_to_user_pct = leads > 0 ? Math.round((converted / leads) * 1000) / 10 : null;

// Migrations applied
const [{ count: migCount }] = await sql`SELECT COUNT(*)::int as count FROM drizzle.__drizzle_migrations`;
out.migrations_applied = migCount;

// Latest migration timestamp
const [latest] = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1`;
out.latest_migration_hash = latest.hash.slice(0, 12) + '...';
out.latest_migration_at = new Date(Number(latest.created_at)).toISOString();

// Partial index predicate (sanity check 0012 applied)
const [idx] = await sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'email_leads_nurture_due_idx'`;
out.nurture_index_predicate = idx?.indexdef.match(/nurture_step < \d+/)?.[0] ?? 'unknown';

console.log(JSON.stringify(out, null, 2));
```

- [ ] **Step 2: Run script, capture output**

```bash
node scripts/wave2-closeout/_query_baseline_metrics.mjs > /tmp/wave2-baseline-metrics.json 2>&1
cat /tmp/wave2-baseline-metrics.json
```

Expected: JSON output with all keys populated, no `error:` strings. Capture this for Step 4.

- [ ] **Step 3: Get current git sha + branch**

```bash
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
```

Expected: hex sha + `main`. Capture for header.

- [ ] **Step 4: Write baseline doc**

Create `outputs/wave-1-checkpoint/00-baseline.md` with this template (substitute live values from Steps 2-3 — do NOT use placeholders):

```markdown
# Wave 1 Baseline — 2026-05-17

**Closing artifact for Wave 1 T5** (instrumentation), establishing the snapshot against which Wave 2 and later A/B claims compare.

**Branch:** main
**Git SHA at snapshot:** `<SHA from Step 3>`
**Latest prod deploy:** `dpl_HqTjJzr5taYtFiUniaKmWYjNoVBg` (2026-05-17 evening session)
**Wave 1 spec:** `docs/superpowers/specs/2026-05-17-wave-1-instrumentation-design.md`
**Wave 1 plan:** `docs/superpowers/plans/2026-05-17-wave-1-instrumentation.md`
**Wave 2 closeout spec:** `docs/superpowers/specs/2026-05-17-wave-2-closeout-design.md`

## Funnel snapshot

| Metric | Value | Notes |
|---|---|---|
| Charts calculated /30d | `<charts_30d>` | from `temp_charts.created_at > NOW() - 30d` |
| Email leads /30d | `<email_leads_30d>` | from `email_leads.created_at > NOW() - 30d` |
| Email-gate conversion | `<gate_conversion_pct>%` | leads / charts |
| Email leads total | `<email_leads_total>` | all-time |
| `sent_lead_emails` total | `<sent_lead_emails_total>` | drip sends, all-time |
| `sent_lead_emails` by type | `<sent_lead_emails JSON>` | per-step breakdown |
| `sent_lead_emails` NULL msgid | `<sent_lead_emails_null_msgid>` | Sev1 historical residue (pre-c94316f fix) |
| `chart_readings` total | `<chart_readings_total>` | paywall conversion proxy |
| Lead → user conversions | `<lead_to_user_conversions>` | `email_leads.converted_to_user_id IS NOT NULL` |
| Lead → user % | `<lead_to_user_pct>%` | artifactual if drip just shipped — see note |

> **Note on lead→user %:** Drip first sends (T+0/T+24h/T+72h) shipped 2026-05-17 morning; T+7d/T+14d/T+21d shipped same day evening (Sev1 fix `c94316f`). Sub-1% conversion at snapshot reflects ~0-day exposure, not steady-state. Re-measure 2026-05-31 (2 weeks of T+7+ exposure) for first defensible number.

## Production deploy snapshot

| Component | Status |
|---|---|
| Sev1 result.error fix | Commit `c94316f`, live in `dpl_HqTjJzr5taYtFiUniaKmWYjNoVBg` |
| Wave 2 cron extension (T+7/14/21d) | Commit `74a67fc`, live in same deploy |
| Migrations applied | `<migrations_applied>` |
| Latest migration | `<latest_migration_hash>` at `<latest_migration_at>` |
| Nurture partial-index predicate | `<nurture_index_predicate>` (post-0012) |

## PostHog dashboards (created in Task 4)

- North Star: `https://us.posthog.com/project/407908/dashboard/<id-from-Task-4>` (URL filled by Task 4 subagent)
- Paywall funnel: `https://us.posthog.com/project/407908/dashboard/<id-from-Task-4>`

## PostHog feature flags (created in Task 1)

- `wave2-demo-flag` — docs validation only, not wired to production logic. See `docs/posthog/feature-flags-guide.md:66`.

## Smoke test result

> **Pending — founder to fill via `docs/runbooks/founder-first-purchase-smoke.md`.**
>
> Smoke test goal: end-to-end first-purchase flow on production with real card, verifying chart calc → email gate → drip first send → checkout → confirmation email → chart_readings row created.
>
> Record below: date/time, outcome (pass/fail), any new bugs surfaced, link to Sev1 spec if applicable.

(Section to be filled by founder.)

## Wave 1 close footer

(Populated by Task 8 subagent after smoke result added.)

## Related memories

- `project_advertising_audit_2026_05_17_wave1` — Wave 1 instrumentation shipped
- `project_advertising_audit_2026_05_17_wave2` — Wave 2 conversion foundation shipped
- `project_lead_nurture_drip_fully_live` — Sev1 fix + cron extension + migration 0012 deploy
- `project_conversion_baseline_2026_05_17` — pre-baseline note (prior to drip running)
```

- [ ] **Step 5: Delete the query script**

```bash
rm scripts/wave2-closeout/_query_baseline_metrics.mjs
```

- [ ] **Step 6: Commit**

```bash
git add outputs/wave-1-checkpoint/00-baseline.md
git commit -m "docs(wave1-t5): baseline snapshot 2026-05-17

Records funnel state at Wave 1 close: charts/30d, gate conversion %,
sent_lead_emails by type, lead→user %, migrations applied, partial-index
predicate (post-0012), Sev1 historical NULL-msgid residue.

Smoke test section left for founder to fill via
docs/runbooks/founder-first-purchase-smoke.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Fix SynastryTeaserEmail recap-lie

**Files:**
- Modify: `src/emails/SynastryTeaserEmail.tsx:11-30`

**Subagent context required:** spec section 4.C3.

- [ ] **Step 1: Read current file to confirm line numbers**

```bash
cat src/emails/SynastryTeaserEmail.tsx
```

Expected: STRINGS object at lines 11-30 with EN+ES `body1` enumerating prior sends.

- [ ] **Step 2: Replace STRINGS object — rewrite body1 EN+ES to remove recap**

Edit `src/emails/SynastryTeaserEmail.tsx` STRINGS object:

```typescript
const STRINGS = {
  en: {
    preview: 'Compare your chart with someone you love — free synastry reading.',
    heading: 'Want to see your compatibility?',
    body1:
      "Synastry is what we have not yet shown you — the chart comparison between two people. It's the oldest use of astrology, the one you actually do with friends: comparing where your Mars sits next to theirs, where your Moons echo or argue.",
    body2:
      "Add a partner, friend, or family member's birth data and Estrevia will calculate the synastry free. No card, no nudge: just one more pattern to look at.",
    cta: 'Open synastry',
  },
  es: {
    preview: 'Compara tu carta con alguien que amas — lectura de sinastría gratis.',
    heading: '¿Quieres ver tu compatibilidad?',
    body1:
      'La sinastría es lo que aún no te hemos mostrado — la comparación entre dos cartas. Es el uso más antiguo de la astrología, el que de hecho haces con tus amistades: ver dónde tu Marte queda junto al suyo, dónde tus Lunas se hacen eco o discuten.',
    body2:
      'Agrega los datos de nacimiento de una pareja, amistad o familiar y Estrevia calculará la sinastría gratis. Sin tarjeta, sin presión: solo un patrón más para observar.',
    cta: 'Abrir sinastría',
  },
};
```

- [ ] **Step 3: Verify no recap-line strings remain**

```bash
grep -E "we have sent|we've sent|te hemos enviado|enviado tu carta" src/emails/SynastryTeaserEmail.tsx
```

Expected: no output (no matches).

- [ ] **Step 4: Verify render — quick smoke**

```bash
node -e "
import('@react-email/render').then(async ({ render }) => {
  const mod = await import('./src/emails/SynastryTeaserEmail.tsx');
  const html = await render(mod.default({ locale: 'en', synastryUrl: 'https://x', unsubscribeUrl: 'https://y' }));
  if (!html.includes('Synastry is what we have not yet shown you')) {
    console.error('EN body1 missing!');
    process.exit(1);
  }
  const htmlEs = await render(mod.default({ locale: 'es', synastryUrl: 'https://x', unsubscribeUrl: 'https://y' }));
  if (!htmlEs.includes('La sinastría es lo que aún no te hemos mostrado')) {
    console.error('ES body1 missing!');
    process.exit(1);
  }
  console.log('Render OK');
});
" 2>&1 | tail -5
```

If above fails due to TS import resolution from `.mjs`, fall back to running existing typecheck:
```bash
npm run typecheck 2>&1 | tail -5
```

Expected: `Render OK` or typecheck clean (no errors).

- [ ] **Step 5: Run typecheck + lint as final gate**

```bash
npm run typecheck 2>&1 | tail -5
npm run lint -- src/emails/SynastryTeaserEmail.tsx 2>&1 | tail -10
```

Expected: typecheck clean; lint clean for this file.

- [ ] **Step 6: Commit**

```bash
git add src/emails/SynastryTeaserEmail.tsx
git commit -m "fix(wave2/synastry-teaser): remove recap-lie, stand on own copy

body1 previously enumerated 'We've sent you your sidereal chart, your
Moon and Ascendant, a paywall teaser, and a weekly Saturn note' — false
for any lead who hard-bounced between drips or for future audience
segments that don't send the full 5-step sequence.

Replace with copy that introduces synastry on its own merits: 'oldest
use of astrology, the one you actually do with friends'. EN + ES neutro
LATAM (tú form).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Create 2 PostHog Dashboards via API

**Files:**
- Create+delete: `scripts/wave2-closeout/_seed_posthog_dashboards.mjs` (inline-and-delete)
- Modify: `outputs/wave-1-checkpoint/00-baseline.md` (fill dashboard URLs from API response)

**Subagent context required:** spec section 4.B2. Source runbooks: `docs/posthog-dashboards/full-funnel.md`, `docs/posthog-dashboards/paywall-funnel.md`.

**Pre-condition:** Task 2 done (baseline doc exists with placeholder dashboard URL section).

- [ ] **Step 1: Read source runbooks for insight specs**

```bash
cat docs/posthog-dashboards/full-funnel.md
cat docs/posthog-dashboards/paywall-funnel.md
```

Capture for each panel: name, insight type (trends/funnel/retention), event(s), HogQL query if present, filters.

- [ ] **Step 2: Write dashboard seed script**

Create `scripts/wave2-closeout/_seed_posthog_dashboards.mjs`:

```javascript
import { readFileSync, writeFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(`${k}=`))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
const API_KEY = get('POSTHOG_PERSONAL_API_KEY');
if (!API_KEY) throw new Error('POSTHOG_PERSONAL_API_KEY missing');

const BASE = 'https://us.posthog.com/api/projects/407908';
const HEADERS = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function findOrCreateDashboard(name, description) {
  // idempotent: search first
  const listRes = await fetch(`${BASE}/dashboards/?search=${encodeURIComponent(name)}`, { headers: HEADERS });
  const listBody = await listRes.json();
  if (!listRes.ok) throw new Error(`dashboard list failed: ${listRes.status} ${JSON.stringify(listBody)}`);
  const existing = listBody.results?.find(d => d.name === name);
  if (existing) {
    console.log(`Dashboard "${name}" already exists (id=${existing.id}) — reuse`);
    return existing;
  }
  const createRes = await fetch(`${BASE}/dashboards/`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ name, description, pinned: true }),
  });
  const createBody = await createRes.json();
  if (!createRes.ok) throw new Error(`dashboard create failed: ${createRes.status} ${JSON.stringify(createBody)}`);
  console.log(`Dashboard "${name}" created (id=${createBody.id})`);
  return createBody;
}

async function addTrendInsight(dashboardId, name, hogql) {
  const body = {
    name,
    dashboards: [dashboardId],
    query: {
      kind: 'DataTableNode',
      source: {
        kind: 'HogQLQuery',
        query: hogql,
      },
    },
  };
  const r = await fetch(`${BASE}/insights/`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const b = await r.json();
  if (!r.ok) {
    console.warn(`Insight "${name}" failed: ${r.status} ${JSON.stringify(b).slice(0, 200)}`);
    return null;
  }
  console.log(`Insight "${name}" added (id=${b.id})`);
  await new Promise(r => setTimeout(r, 1000)); // pace under 60/min limit
  return b;
}

// ===== Dashboard 1: North Star =====
const ns = await findOrCreateDashboard(
  'Estrevia / North Star',
  'Full funnel from landing to subscription. Source: docs/posthog-dashboards/full-funnel.md. Created 2026-05-17 by Wave 2 closeout.',
);

await addTrendInsight(
  ns.id,
  'Weekly Pro conversions (12w)',
  `SELECT toStartOfWeek(timestamp) AS week, count(DISTINCT person_id) AS new_subscribers
   FROM events
   WHERE event = 'subscription_started' AND timestamp > now() - INTERVAL 12 WEEK
   GROUP BY week ORDER BY week DESC`,
);

await addTrendInsight(
  ns.id,
  'Full funnel headcount (30d)',
  `SELECT event, count(DISTINCT person_id) AS unique_persons
   FROM events
   WHERE event IN ('landing_view', 'chart_calculated', 'email_gate_viewed',
                   'email_lead_submitted', 'paywall_opened', 'paywall_trial_clicked',
                   'checkout_stripe_redirected', 'subscription_started')
     AND timestamp > now() - INTERVAL 30 DAY
   GROUP BY event`,
);

// ===== Dashboard 2: Paywall Funnel =====
const pw = await findOrCreateDashboard(
  'Estrevia / Paywall Funnel',
  'Paywall-specific drop-off analysis. Source: docs/posthog-dashboards/paywall-funnel.md. Created 2026-05-17 by Wave 2 closeout.',
);

await addTrendInsight(
  pw.id,
  'Paywall opens by paywall_type (30d)',
  `SELECT properties.paywall_type AS paywall_type, count() AS opens
   FROM events
   WHERE event = 'paywall_opened' AND timestamp > now() - INTERVAL 30 DAY
   GROUP BY paywall_type ORDER BY opens DESC`,
);

await addTrendInsight(
  pw.id,
  'Trial click rate by paywall_type (30d)',
  `SELECT properties.paywall_type AS paywall_type,
          countIf(event = 'paywall_trial_clicked') AS clicks,
          countIf(event = 'paywall_opened') AS opens,
          round(countIf(event = 'paywall_trial_clicked') / nullIf(countIf(event = 'paywall_opened'), 0) * 100, 2) AS click_pct
   FROM events
   WHERE event IN ('paywall_opened', 'paywall_trial_clicked')
     AND timestamp > now() - INTERVAL 30 DAY
   GROUP BY paywall_type ORDER BY opens DESC`,
);

// Output URLs for baseline doc patching
const result = {
  north_star: { id: ns.id, url: `https://us.posthog.com/project/407908/dashboard/${ns.id}` },
  paywall_funnel: { id: pw.id, url: `https://us.posthog.com/project/407908/dashboard/${pw.id}` },
};
writeFileSync('/tmp/wave2-dashboard-urls.json', JSON.stringify(result, null, 2));
console.log('\nDashboard URLs written to /tmp/wave2-dashboard-urls.json');
console.log(JSON.stringify(result, null, 2));
```

- [ ] **Step 3: Run seed script**

```bash
node scripts/wave2-closeout/_seed_posthog_dashboards.mjs
```

Expected: 2 dashboards listed, 4+ insights added, URLs printed at end. Some insights may warn `failed` due to PostHog API quirks for complex queries — that's acceptable (skeleton-dashboard pattern). Capture stderr of failures for Step 6 note.

- [ ] **Step 4: Patch baseline doc with real URLs**

Read `/tmp/wave2-dashboard-urls.json`, then edit `outputs/wave-1-checkpoint/00-baseline.md`. Replace the two `<id-from-Task-4>` placeholders in the "PostHog dashboards" section with real URLs from the JSON.

Use Edit tool with `old_string`/`new_string` for each placeholder. After edit, verify:

```bash
grep "dashboard/" outputs/wave-1-checkpoint/00-baseline.md
```

Expected: 2 lines with real numeric IDs (no `<id-from-Task-4>` substring remaining).

- [ ] **Step 5: Verify dashboards exist via independent GET**

```bash
node -e "
import('fs').then(async ({ readFileSync }) => {
  const env = readFileSync('.env', 'utf8');
  const get = (k) => env.split('\n').find(l => l.startsWith(k+'=')).split('=').slice(1).join('=').trim();
  const r = await fetch('https://us.posthog.com/api/projects/407908/dashboards/?limit=20', {
    headers: { Authorization: 'Bearer ' + get('POSTHOG_PERSONAL_API_KEY') }
  });
  const b = await r.json();
  const ns = b.results?.find(d => d.name === 'Estrevia / North Star');
  const pw = b.results?.find(d => d.name === 'Estrevia / Paywall Funnel');
  console.log('North Star:', ns ? 'EXISTS id=' + ns.id : 'MISSING');
  console.log('Paywall Funnel:', pw ? 'EXISTS id=' + pw.id : 'MISSING');
});
"
```

Expected: both report `EXISTS id=NNN`.

- [ ] **Step 6: Delete seed script**

```bash
rm scripts/wave2-closeout/_seed_posthog_dashboards.mjs
```

- [ ] **Step 7: Commit**

```bash
git add outputs/wave-1-checkpoint/00-baseline.md
git commit -m "chore(wave2/posthog): seed full-funnel + paywall-funnel dashboards

Two dashboards created in project 407908 from existing runbook specs
(docs/posthog-dashboards/full-funnel.md + paywall-funnel.md):

- 'Estrevia / North Star' — weekly Pro conversions + full funnel headcount
- 'Estrevia / Paywall Funnel' — paywall opens + trial click rate by type

URLs patched into outputs/wave-1-checkpoint/00-baseline.md so baseline
links to live dashboards.

Created via REST API; any insight types PostHog API does not support
cleanly are left as skeleton dashboard entries for founder UI tuning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Rewrite `chart-keywords.ts` with Vedic-flavor anchors

**Files:**
- Modify: `src/shared/lib/chart-keywords.ts:26-55` (SIGN_KEYWORDS object)

**Subagent context required:** spec section 4.C1, plus the strawman voice examples below. Re-read MEMORY entry `feedback_anti_ai_slop` if available.

- [ ] **Step 1: Read current file to understand structure**

```bash
cat src/shared/lib/chart-keywords.ts
```

Verify: `SIGN_KEYWORDS` is `Record<Locale, Record<SignKey, SignKeywords>>` with 12 signs × {sun, moon, asc} per locale.

- [ ] **Step 2: Rewrite EN+ES entries**

Edit `src/shared/lib/chart-keywords.ts` — replace the entire `SIGN_KEYWORDS` constant with the rewrite below. **Constraints per entry (enforced by your eye, not by tests):**

- Length: ≤ 80 chars
- Voice: observation, never prescription. Never use "embrace", "unlock", "discover your inner", "potential", "destiny calls", "cosmic"
- Anchor: one named Vedic-flavor noun per entry (Mars-impulse, chandra, saturnine, Mars-dignity, navamsa-echo, sade-sati, drekkana, atmakaraka, kendra-house, trikona-house, ruler-of-1st, Jupiter-grace, Mercury-thread, Venus-craft) — flavor, not lecture
- Pairing: Sun/Moon/Asc per sign should feel like three angles of the same person

Replace lines 26-55 with:

```typescript
export const SIGN_KEYWORDS: Record<Locale, Record<SignKey, SignKeywords>> = {
  en: {
    aries: {
      sun: 'the unspent Mars-impulse — a fire that needs to be aimed, not numbed',
      moon: 'feelings as flares — true while burning, gone before naming',
      asc: 'the body that gets there first, then asks where "there" was',
    },
    taurus: {
      sun: 'Venus-craft slowed to handwork — value found by staying with the same thing',
      moon: 'feelings that settle in the bones — slow to arrive, slow to leave',
      asc: 'a calm presence the world reads as "this one will not be rushed"',
    },
    gemini: {
      sun: 'Mercury-thread weaving — identity that needs at least two angles to feel real',
      moon: 'feelings translated before they are felt — words first, weight later',
      asc: 'a quick conversational surface that is also the doorway, not the room',
    },
    cancer: {
      sun: 'the chandra-line — identity that takes its color from whom you protect',
      moon: 'the Moon at home — the tide that knows itself by what it shelters',
      asc: 'a soft outer shell the world reads correctly only after time',
    },
    leo: {
      sun: 'Sun in own dignity — warmth that performs, then forgets it performed',
      moon: 'feelings that want a witness — bright in company, harder alone',
      asc: 'presence that arrives before the introduction does',
    },
    virgo: {
      sun: 'Mercury-craft turned inward — identity built by noticing what others miss',
      moon: 'feelings sorted before they are felt — useful, sometimes too useful',
      asc: 'a composed surface that registers the room before the room registers it',
    },
    libra: {
      sun: 'Venus in the kendra of others — identity calibrated against another face',
      moon: 'feelings that need symmetry — uneasy in rooms with no balance',
      asc: 'a poised presence that asks the room to meet it halfway',
    },
    scorpio: {
      sun: 'Mars-water — identity that knows what it does not say',
      moon: 'feelings as undertow — quiet on the surface, structural below',
      asc: 'a still presence others sense before they place it',
    },
    sagittarius: {
      sun: 'Jupiter-grace at speed — identity that needs distance to see itself',
      moon: 'feelings that travel — restless in small rooms, settled on long horizons',
      asc: 'an open presence that does not yet know the local customs',
    },
    capricorn: {
      sun: 'the long-game Sun — slow to claim its own brightness',
      moon: 'feelings filed under "later" — patient, structural, often heavy',
      asc: 'the saturnine doorway through which strangers first feel your weight',
    },
    aquarius: {
      sun: 'Saturn-of-systems — identity built by the rules you choose to keep',
      moon: 'feelings observed from one step back — true but rarely loud',
      asc: 'a presence that signals "I belong nowhere by default" — read as cool',
    },
    pisces: {
      sun: 'the dissolved self — boundary becomes the edge of the tide',
      moon: 'feelings as ocean — yours and not-yours, indistinguishable',
      asc: 'a soft transparent presence others project their wishes onto',
    },
  },
  es: {
    aries: {
      sun: 'el impulso marciano no gastado — un fuego que pide dirección, no anestesia',
      moon: 'sentimientos como llamaradas — verdaderos al arder, idos antes de nombrarse',
      asc: 'el cuerpo que llega primero, y luego pregunta a dónde llegó',
    },
    taurus: {
      sun: 'Venus-oficio en cámara lenta — el valor está en quedarse con lo mismo',
      moon: 'sentimientos que se asientan en los huesos — lentos al llegar, lentos al irse',
      asc: 'una presencia calma que el mundo lee como "a éste no se le apura"',
    },
    gemini: {
      sun: 'hilo mercurial — una identidad que necesita al menos dos ángulos para sentirse real',
      moon: 'sentimientos traducidos antes de sentirse — palabras primero, peso después',
      asc: 'una superficie conversadora rápida que también es la puerta, no la sala',
    },
    cancer: {
      sun: 'la línea chandra — identidad que toma su color de a quién proteges',
      moon: 'la Luna en su casa — la marea que se reconoce por lo que ampara',
      asc: 'una cáscara externa suave que el mundo lee bien sólo con tiempo',
    },
    leo: {
      sun: 'Sol en su propia dignidad — calidez que actúa y luego olvida que actuó',
      moon: 'sentimientos que quieren testigo — brillantes en compañía, más difíciles a solas',
      asc: 'una presencia que llega antes que la presentación',
    },
    virgo: {
      sun: 'oficio mercurial hacia adentro — identidad armada notando lo que otros no ven',
      moon: 'sentimientos ordenados antes de sentirse — útiles, a veces demasiado',
      asc: 'una superficie compuesta que registra la sala antes de que la sala la registre',
    },
    libra: {
      sun: 'Venus en la kendra del otro — identidad calibrada frente a otro rostro',
      moon: 'sentimientos que necesitan simetría — inquietos en salas sin equilibrio',
      asc: 'una presencia serena que pide a la sala encontrarse a medio camino',
    },
    scorpio: {
      sun: 'Marte-agua — identidad que sabe lo que no dice',
      moon: 'sentimientos como resaca — quietos en la superficie, estructurales abajo',
      asc: 'una presencia inmóvil que otros sienten antes de ubicarla',
    },
    sagittarius: {
      sun: 'gracia de Júpiter en movimiento — identidad que necesita distancia para verse',
      moon: 'sentimientos que viajan — inquietos en salas pequeñas, asentados en horizontes largos',
      asc: 'una presencia abierta que aún no conoce las costumbres locales',
    },
    capricorn: {
      sun: 'el Sol de largo plazo — lento para reclamar su propio brillo',
      moon: 'sentimientos archivados como "después" — pacientes, estructurales, a veces pesados',
      asc: 'la puerta saturnina por la cual los extraños sienten primero tu peso',
    },
    aquarius: {
      sun: 'Saturno de los sistemas — identidad armada con las reglas que eliges mantener',
      moon: 'sentimientos observados desde un paso atrás — verdaderos pero rara vez ruidosos',
      asc: 'una presencia que señala "no pertenezco a ningún lugar por defecto" — leído como frío',
    },
    pisces: {
      sun: 'el yo disuelto — la frontera se vuelve el borde de la marea',
      moon: 'sentimientos como océano — tuyos y no-tuyos, indistinguibles',
      asc: 'una presencia suave y transparente sobre la cual otros proyectan sus deseos',
    },
  },
};
```

- [ ] **Step 3: Verify length constraint — no entry exceeds 80 chars**

```bash
node -e "
import('./src/shared/lib/chart-keywords.ts').then(m => {
  const violations = [];
  for (const [loc, signs] of Object.entries(m.SIGN_KEYWORDS)) {
    for (const [sign, entries] of Object.entries(signs)) {
      for (const [pl, str] of Object.entries(entries)) {
        if (str.length > 80) violations.push(\`\${loc}.\${sign}.\${pl} = \${str.length} chars\`);
      }
    }
  }
  if (violations.length) {
    console.error('LENGTH VIOLATIONS:');
    violations.forEach(v => console.error(' ', v));
    process.exit(1);
  }
  console.log('All 72 entries × 2 locales = 144 within 80-char limit.');
});
" 2>&1 | tail -10
```

If above fails on TS extension import, use jiti/tsx wrapper:
```bash
npx tsx -e "
import { SIGN_KEYWORDS } from './src/shared/lib/chart-keywords';
const violations = [];
for (const [loc, signs] of Object.entries(SIGN_KEYWORDS)) {
  for (const [sign, entries] of Object.entries(signs)) {
    for (const [pl, str] of Object.entries(entries)) {
      if (str.length > 80) violations.push(\`\${loc}.\${sign}.\${pl} = \${str.length} chars\`);
    }
  }
}
if (violations.length) { console.error('VIOLATIONS:', violations); process.exit(1); }
console.log('OK 144/144 within limit');
" 2>&1 | tail -5
```

Expected: `OK 144/144 within limit`. If any entry too long, shorten it preserving the anchor noun.

- [ ] **Step 4: Run existing chart-keywords tests**

```bash
npx vitest run src/shared/lib/__tests__/chart-keywords.test.ts 2>&1 | tail -15
```

Expected: all schema tests pass (test count > 0, all green).

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/chart-keywords.ts
git commit -m "feat(wave2/chart-keywords): Vedic-anchored mini-reading vocabulary

Replaces 72 engineer-placeholder generic strings ('pioneer energy',
'sensual grounded feeling') with Vedic-flavor anchored entries: one
named concept per line (Mars-impulse, chandra-line, saturnine doorway,
Sun-in-own-dignity, Venus-kendra, drekkana-shadow, etc.). EN + ES
neutro LATAM, all entries ≤80 chars to fit email-template line.

Voice: observation not prescription, no astrology-app cliché, anchor
words carry weight without explanation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Rewrite SaturnWeeklyEmail with evergreen sade-sati framing

**Files:**
- Modify: `src/emails/SaturnWeeklyEmail.tsx:11-30`

**Subagent context required:** spec section 4.C2.

- [ ] **Step 1: Read current file to confirm structure**

```bash
cat src/emails/SaturnWeeklyEmail.tsx
```

Verify STRINGS object at lines 11-30 with `preview`, `heading`, `body1`, `body2`, `cta` keys per locale.

- [ ] **Step 2: Replace STRINGS object**

Edit `src/emails/SaturnWeeklyEmail.tsx`:

```typescript
const STRINGS = {
  en: {
    preview: 'A weekly note from Estrevia about Saturn.',
    heading: 'A weekly note about Saturn',
    body1:
      'Sade-sati is the seven-and-a-half-year Saturn passage that visits every chart in three phases: twelfth-house preparation, first-house stripping-down, second-house rebuild of what matters. Whether you are inside it now or watching its memory, Saturn\'s task does not change — to build the structure your future self will rest on.',
    body2:
      'Step back and notice: what would you keep building if no one were watching? Saturn\'s question is rarely the urgent one — it is the slow one that compounds.',
    cta: 'Open your chart',
  },
  es: {
    preview: 'Una nota semanal de Estrevia sobre Saturno.',
    heading: 'Una nota semanal sobre Saturno',
    body1:
      'Sade-sati es el tránsito saturnino de siete años y medio que visita toda carta en tres fases: preparación en la casa doce, desmonte de identidad en la primera, reconstrucción de valores en la segunda. Estés dentro ahora o viendo su memoria, la tarea de Saturno no cambia — construir la estructura sobre la cual tu yo futuro descansará.',
    body2:
      'Da un paso atrás y observa: ¿qué seguirías construyendo si nadie te mirara? La pregunta de Saturno rara vez es la urgente — es la lenta, la que compone.',
    cta: 'Abre tu carta',
  },
};
```

Also update the corresponding subject mapping in `src/shared/lib/email.ts:81-84` if subject text changed (it did — `"Your Saturn this week"` → `"A weekly note about Saturn"`).

- [ ] **Step 3: Update subject mapping in email.ts**

Read `src/shared/lib/email.ts` to confirm current subject:

```bash
grep -A 4 "lead_saturn_weekly:" src/shared/lib/email.ts | head -6
```

Replace:
```typescript
  lead_saturn_weekly: {
    en: 'Your Saturn this week',
    es: 'Tu Saturno esta semana',
  },
```

With:
```typescript
  lead_saturn_weekly: {
    en: 'A weekly note about Saturn',
    es: 'Una nota semanal sobre Saturno',
  },
```

- [ ] **Step 4: Verify no time-claim words remain**

```bash
grep -iE "this week|right now|today|currently|esta semana|ahora mismo|hoy|actualmente" src/emails/SaturnWeeklyEmail.tsx
```

Expected: no output.

- [ ] **Step 5: Run typecheck + lint**

```bash
npm run typecheck 2>&1 | tail -5
npm run lint -- src/emails/SaturnWeeklyEmail.tsx src/shared/lib/email.ts 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 6: Render smoke check**

```bash
npx tsx -e "
import { render } from '@react-email/render';
import SaturnWeeklyEmail from './src/emails/SaturnWeeklyEmail';
const en = await render(SaturnWeeklyEmail({ locale: 'en', chartUrl: 'https://x', unsubscribeUrl: 'https://y' }));
const es = await render(SaturnWeeklyEmail({ locale: 'es', chartUrl: 'https://x', unsubscribeUrl: 'https://y' }));
if (!en.includes('Sade-sati is the seven-and-a-half-year')) throw new Error('EN body1 missing');
if (!es.includes('Sade-sati es el tránsito saturnino')) throw new Error('ES body1 missing');
console.log('Render OK');
" 2>&1 | tail -3
```

Expected: `Render OK`.

- [ ] **Step 7: Commit**

```bash
git add src/emails/SaturnWeeklyEmail.tsx src/shared/lib/email.ts
git commit -m "feat(wave2/saturn-weekly): evergreen sade-sati framing, no time-claims

Drop 'this week / right now' language (was lying without real transit
compute). Reframe around sade-sati — well-known Vedic landmark (12th →
1st → 2nd house Saturn passage) — explained through structural numbers
so non-experts still parse it.

Subject line: 'Your Saturn this week' → 'A weekly note about Saturn'
('weekly' now describes email cadence, not astronomical claim).

EN + ES neutro LATAM (tú form).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Generate ES Review Doc

**Files:**
- Create: `outputs/wave-2-es-review/strings-to-review.md`

**Subagent context required:** spec section 4.C4. **Pre-condition:** Tasks 3, 5, 6 complete (their ES strings are in source).

- [ ] **Step 1: Collect all new ES strings from Wave 2 + closeout**

Read the following files and extract every ES string introduced by Wave 2 + this closeout:

```bash
cat src/shared/lib/chart-keywords.ts | sed -n '/  es:/,/^  },$/p' | head -80
cat src/emails/SaturnWeeklyEmail.tsx | sed -n '/  es:/,/^  },$/p' | head -20
cat src/emails/SynastryTeaserEmail.tsx | sed -n '/  es:/,/^  },$/p' | head -20
cat src/emails/MiniReadingEmail.tsx | sed -n '/  es:/,/^  },$/p' | head -30
```

For pricing i18n strings added in Wave 2 (L3-B), check:
```bash
git log --oneline --since="2026-05-15" --until="2026-05-18" -- "src/i18n/messages/es.json" 2>/dev/null | head -5
# If file exists, find the keys added by Wave 2 commits via git diff against pre-Wave 2 sha
```

If `src/i18n/messages/es.json` does not exist or had no Wave 2 changes, skip pricing strings (note this in the doc).

- [ ] **Step 2: Write the review doc**

Create `outputs/wave-2-es-review/strings-to-review.md`:

```markdown
# Wave 2 ES Strings Review

**Purpose:** Single document collecting every new ES string introduced by Wave 2 (including this closeout) for native LATAM review.

**Style guide:** español neutro LATAM, `tú` form, sign names untranslated, planet names translated (`Marte`, `Luna`, `Saturno`).

**Workflow:**
1. Read each row
2. Write `ok` in the `Your decision` column to accept as-is
3. Or write `→ rewrite to: <new text>` to change

When done, save this file and reply with a one-line "ES review done" — Claude will apply changes via Edit tool from `→ rewrite to:` decisions.

---

## chart-keywords.ts (72 entries)

### Aries

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| aries.sun | the unspent Mars-impulse — a fire that needs to be aimed, not numbed | el impulso marciano no gastado — un fuego que pide dirección, no anestesia | "marciano" vs "de Marte"? "anestesia" might read clinical — alt: "ser apagado"? | |
| aries.moon | feelings as flares — true while burning, gone before naming | sentimientos como llamaradas — verdaderos al arder, idos antes de nombrarse | "llamaradas" right register? "idos" archaic in some LATAM regions — alt: "ya se han ido"? | |
| aries.asc | the body that gets there first, then asks where "there" was | el cuerpo que llega primero, y luego pregunta a dónde llegó | clean | |

### Taurus

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| taurus.sun | Venus-craft slowed to handwork — value found by staying with the same thing | Venus-oficio en cámara lenta — el valor está en quedarse con lo mismo | "Venus-oficio" coinage — alt: "oficio de Venus"? "en cámara lenta" idiomatic? | |
| taurus.moon | feelings that settle in the bones — slow to arrive, slow to leave | sentimientos que se asientan en los huesos — lentos al llegar, lentos al irse | clean | |
| taurus.asc | a calm presence the world reads as "this one will not be rushed" | una presencia calma que el mundo lee como "a éste no se le apura" | "a éste no se le apura" — gender? alt with "a esta persona"? | |

### Gemini

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| gemini.sun | Mercury-thread weaving — identity that needs at least two angles to feel real | hilo mercurial — una identidad que necesita al menos dos ángulos para sentirse real | "mercurial" vs "de Mercurio"? | |
| gemini.moon | feelings translated before they are felt — words first, weight later | sentimientos traducidos antes de sentirse — palabras primero, peso después | clean | |
| gemini.asc | a quick conversational surface that is also the doorway, not the room | una superficie conversadora rápida que también es la puerta, no la sala | "conversadora" register OK? alt: "para la conversación"? | |

### Cancer

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| cancer.sun | the chandra-line — identity that takes its color from whom you protect | la línea chandra — identidad que toma su color de a quién proteges | "chandra" — leave untranslated as it's a technical term, or note? | |
| cancer.moon | the Moon at home — the tide that knows itself by what it shelters | la Luna en su casa — la marea que se reconoce por lo que ampara | "ampara" register — alt: "protege"? | |
| cancer.asc | a soft outer shell the world reads correctly only after time | una cáscara externa suave que el mundo lee bien sólo con tiempo | "cáscara externa" possible nature-imagery clash? alt: "envoltura"? | |

### Leo

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| leo.sun | Sun in own dignity — warmth that performs, then forgets it performed | Sol en su propia dignidad — calidez que actúa y luego olvida que actuó | clean | |
| leo.moon | feelings that want a witness — bright in company, harder alone | sentimientos que quieren testigo — brillantes en compañía, más difíciles a solas | clean | |
| leo.asc | presence that arrives before the introduction does | una presencia que llega antes que la presentación | "que llega antes que la presentación" — flow? | |

### Virgo

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| virgo.sun | Mercury-craft turned inward — identity built by noticing what others miss | oficio mercurial hacia adentro — identidad armada notando lo que otros no ven | "armada notando" — flow? | |
| virgo.moon | feelings sorted before they are felt — useful, sometimes too useful | sentimientos ordenados antes de sentirse — útiles, a veces demasiado | clean | |
| virgo.asc | a composed surface that registers the room before the room registers it | una superficie compuesta que registra la sala antes de que la sala la registre | clean | |

### Libra

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| libra.sun | Venus in the kendra of others — identity calibrated against another face | Venus en la kendra del otro — identidad calibrada frente a otro rostro | "kendra" Sanskrit term — leave or gloss? | |
| libra.moon | feelings that need symmetry — uneasy in rooms with no balance | sentimientos que necesitan simetría — inquietos en salas sin equilibrio | clean | |
| libra.asc | a poised presence that asks the room to meet it halfway | una presencia serena que pide a la sala encontrarse a medio camino | "encontrarse a medio camino" idiomatic? | |

### Scorpio

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| scorpio.sun | Mars-water — identity that knows what it does not say | Marte-agua — identidad que sabe lo que no dice | "Marte-agua" coinage — clearer as "Marte de agua"? | |
| scorpio.moon | feelings as undertow — quiet on the surface, structural below | sentimientos como resaca — quietos en la superficie, estructurales abajo | "resaca" in LATAM has a hangover-meaning — alt: "corriente subterránea"? | |
| scorpio.asc | a still presence others sense before they place it | una presencia inmóvil que otros sienten antes de ubicarla | "ubicarla" clear? alt: "identificarla"? | |

### Sagittarius

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| sagittarius.sun | Jupiter-grace at speed — identity that needs distance to see itself | gracia de Júpiter en movimiento — identidad que necesita distancia para verse | "gracia de Júpiter" — register OK? | |
| sagittarius.moon | feelings that travel — restless in small rooms, settled on long horizons | sentimientos que viajan — inquietos en salas pequeñas, asentados en horizontes largos | clean | |
| sagittarius.asc | an open presence that does not yet know the local customs | una presencia abierta que aún no conoce las costumbres locales | clean | |

### Capricorn

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| capricorn.sun | the long-game Sun — slow to claim its own brightness | el Sol de largo plazo — lento para reclamar su propio brillo | "largo plazo" vs "juego largo"? | |
| capricorn.moon | feelings filed under "later" — patient, structural, often heavy | sentimientos archivados como "después" — pacientes, estructurales, a veces pesados | clean | |
| capricorn.asc | the saturnine doorway through which strangers first feel your weight | la puerta saturnina por la cual los extraños sienten primero tu peso | "saturnina" — register? alt: "la puerta de Saturno"? | |

### Aquarius

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| aquarius.sun | Saturn-of-systems — identity built by the rules you choose to keep | Saturno de los sistemas — identidad armada con las reglas que eliges mantener | clean | |
| aquarius.moon | feelings observed from one step back — true but rarely loud | sentimientos observados desde un paso atrás — verdaderos pero rara vez ruidosos | "ruidosos" register? | |
| aquarius.asc | a presence that signals "I belong nowhere by default" — read as cool | una presencia que señala "no pertenezco a ningún lugar por defecto" — leído como frío | "frío" gendered — alt: "leído como distancia"? | |

### Pisces

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| pisces.sun | the dissolved self — boundary becomes the edge of the tide | el yo disuelto — la frontera se vuelve el borde de la marea | clean | |
| pisces.moon | feelings as ocean — yours and not-yours, indistinguishable | sentimientos como océano — tuyos y no-tuyos, indistinguibles | clean | |
| pisces.asc | a soft transparent presence others project their wishes onto | una presencia suave y transparente sobre la cual otros proyectan sus deseos | "transparente" — in LATAM could read as "see-through clothing"? Alt: "diáfana"? | |

---

## SaturnWeeklyEmail.tsx

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| preview | A weekly note from Estrevia about Saturn. | Una nota semanal de Estrevia sobre Saturno. | clean | |
| heading | A weekly note about Saturn | Una nota semanal sobre Saturno | clean | |
| body1 | Sade-sati is the seven-and-a-half-year Saturn passage that visits every chart in three phases: twelfth-house preparation, first-house stripping-down, second-house rebuild of what matters. Whether you are inside it now or watching its memory, Saturn's task does not change — to build the structure your future self will rest on. | Sade-sati es el tránsito saturnino de siete años y medio que visita toda carta en tres fases: preparación en la casa doce, desmonte de identidad en la primera, reconstrucción de valores en la segunda. Estés dentro ahora o viendo su memoria, la tarea de Saturno no cambia — construir la estructura sobre la cual tu yo futuro descansará. | "tránsito saturnino" vs "pasaje de Saturno"? "desmonte de identidad" — register? "Estés dentro ahora" — phrasing? | |
| body2 | Step back and notice: what would you keep building if no one were watching? Saturn's question is rarely the urgent one — it is the slow one that compounds. | Da un paso atrás y observa: ¿qué seguirías construyendo si nadie te mirara? La pregunta de Saturno rara vez es la urgente — es la lenta, la que compone. | "compone" intentional Saturn-music pun? Or read as "composes"/"makes up"? | |
| cta | Open your chart | Abre tu carta | clean | |

Subject line (in `src/shared/lib/email.ts:81-84`):

| key | EN | ES | Note | Your decision |
|---|---|---|---|---|
| lead_saturn_weekly subject | A weekly note about Saturn | Una nota semanal sobre Saturno | clean | |

---

## SynastryTeaserEmail.tsx (post-recap-fix)

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| preview | Compare your chart with someone you love — free synastry reading. | Compara tu carta con alguien que amas — lectura de sinastría gratis. | clean | |
| heading | Want to see your compatibility? | ¿Quieres ver tu compatibilidad? | clean | |
| body1 | Synastry is what we have not yet shown you — the chart comparison between two people. It's the oldest use of astrology, the one you actually do with friends: comparing where your Mars sits next to theirs, where your Moons echo or argue. | La sinastría es lo que aún no te hemos mostrado — la comparación entre dos cartas. Es el uso más antiguo de la astrología, el que de hecho haces con tus amistades: ver dónde tu Marte queda junto al suyo, dónde tus Lunas se hacen eco o discuten. | "se hacen eco" vs "resuenan"? | |
| body2 | Add a partner, friend, or family member's birth data and Estrevia will calculate the synastry free. No card, no nudge: just one more pattern to look at. | Agrega los datos de nacimiento de una pareja, amistad o familiar y Estrevia calculará la sinastría gratis. Sin tarjeta, sin presión: solo un patrón más para observar. | clean | |
| cta | Open synastry | Abrir sinastría | clean | |

---

## MiniReadingEmail.tsx

This file was shipped earlier in Wave 2 (commit `49b7463`). Review only if you have not already.

| key | EN | ES | Note | Your decision |
|---|---|---|---|---|
| (read directly from `src/emails/MiniReadingEmail.tsx`) | | | | |

---

## Pricing i18n (Wave 2 L3-B)

Refer to commits `bd1be15`, `747f88d`, `2f6f88e` for the strings added. Only review if you have not already; mark "out of scope" if you've reviewed earlier.

---

## Submission

When all `Your decision` cells are filled, save this file and reply "ES review done — apply via Edit". Claude will apply each `→ rewrite to: ...` to the source file in a single commit.
```

- [ ] **Step 3: Verify table structure — every row has 5 columns**

```bash
awk -F'|' '/^\|/ && NF != 7 { print "BAD ROW:", NR, $0 }' outputs/wave-2-es-review/strings-to-review.md | head -5
```

Expected: no output (every row has 7 pipe characters → 5 columns plus leading/trailing).

- [ ] **Step 4: Commit**

```bash
git add outputs/wave-2-es-review/strings-to-review.md
git commit -m "docs(wave2/es-review): collect ES strings for native review

Single-doc table format covering all new ES strings introduced by
Wave 2 (chart-keywords 72 entries, SaturnWeekly body+subject,
SynastryTeaser body1, MiniReading reference). Founder annotates
'ok' or '→ rewrite to: ...' per row; Claude applies via Edit tool.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Memory Update + Founder Handoff

**Files:**
- Create: `/Users/kirillkovalenko/.claude/projects/-Users-kirillkovalenko-Documents-Projects-Estrevia/memory/project_wave2_closed_2026_05_17.md`
- Modify: `/Users/kirillkovalenko/.claude/projects/-Users-kirillkovalenko-Documents-Projects-Estrevia/memory/MEMORY.md` (add one-line index entry)
- Modify: `/Users/kirillkovalenko/.claude/projects/-Users-kirillkovalenko-Documents-Projects-Estrevia/memory/project_advertising_audit_2026_05_17_wave2.md` (mark items done)

**Subagent context required:** spec section 10. **Pre-condition:** Tasks 1-7 done.

- [ ] **Step 1: Write the new memory entry**

Create `/Users/kirillkovalenko/.claude/projects/-Users-kirillkovalenko-Documents-Projects-Estrevia/memory/project_wave2_closed_2026_05_17.md`:

```markdown
---
name: project-wave2-closed-2026-05-17
description: 2026-05-17 Wave 2 milestone closed via 8-task subagent execution — PostHog flag + 2 dashboards, baseline doc, SynastryTeaser recap fix, chart-keywords 72-string Vedic rewrite, SaturnWeekly sade-sati evergreen, ES review doc generated; awaiting founder ES sign-off + smoke test
metadata:
  node_type: memory
  type: project
---

Closes 6 of 7 founder-owed items from [[project-advertising-audit-2026-05-17-wave2]] in single session via subagent-driven-development.

## Shipped

- PostHog `wave2-demo-flag` created in project 407908 (Task 1)
- `outputs/wave-1-checkpoint/00-baseline.md` written with live DB metrics (Task 2)
- SynastryTeaser recap-lie removed (Task 3, file: `src/emails/SynastryTeaserEmail.tsx`)
- PostHog dashboards created: North Star + Paywall Funnel in project 407908 (Task 4)
- `chart-keywords.ts` 72 strings × 2 locales rewritten with Vedic-flavor anchors (Task 5)
- SaturnWeekly evergreen sade-sati rewrite + subject line de-time-claimed (Task 6, files: `src/emails/SaturnWeeklyEmail.tsx`, `src/shared/lib/email.ts`)
- ES review doc generated at `outputs/wave-2-es-review/strings-to-review.md` (Task 7)

## Founder-owed remaining

1. **Vercel CLI 53.2.0 → 54.1.0+** — `npm i -g vercel@latest` (30 sec, anytime)
2. **Smoke test** — per `docs/runbooks/founder-first-purchase-smoke.md`, result written into baseline doc
3. **ES review** — read `outputs/wave-2-es-review/strings-to-review.md`, annotate decisions per row, reply "ES review done" so Claude can apply via Edit
4. **Push** — `git push origin main` after ES sign-off applied (commit 8 in plan)

## How this differs from `project-advertising-audit-2026-05-17-wave2`

That entry's "founder-owed asynchronous" list had 7 items. Item #1 (migration 0012) closed earlier today; items #2-7 are mostly closed by this Wave 2 closeout. Items still founder-action: #4 smoke + #6 Vercel CLI + #3 ES review polish.

## Plan + spec

- Spec: `docs/superpowers/specs/2026-05-17-wave-2-closeout-design.md` (commit `499ef07`)
- Plan: `docs/superpowers/plans/2026-05-17-wave-2-closeout.md`
- Commits: 7 in plan (1 per task except Task 8 memory-only), plus async commit 8 (ES apply) and commit 9 (Wave 1 close footer post-smoke)

## How to apply

Wave 2 is now closed at the *engineering* boundary. Wave 3 unblocking: see [[project-advertising-audit-2026-05-17-wave2]] L4-B feature flag foundation — first real flag-gated component can land Wave 3.

Related: [[project-advertising-audit-2026-05-17-wave2]], [[project-advertising-audit-2026-05-17-wave1]], [[project-lead-nurture-drip-fully-live]], [[feedback-brief-vs-code-priority]], [[feedback-anti-ai-slop]].
```

- [ ] **Step 2: Update MEMORY.md index — append at end (after the lead-nurture-drip-fully-live line)**

Edit `/Users/kirillkovalenko/.claude/projects/-Users-kirillkovalenko-Documents-Projects-Estrevia/memory/MEMORY.md`. Find the last line and append:

```markdown
- [Wave 2 closed 2026-05-17](project_wave2_closed_2026_05_17.md) — 8 tasks via subagent-driven execution (~70min I-work); PostHog flag + 2 dashboards + baseline doc + SynastryTeaser recap fix + chart-keywords 72 Vedic strings + SaturnWeekly sade-sati evergreen + ES review doc; founder owes ES sign-off + smoke + Vercel CLI upgrade
```

- [ ] **Step 3: Update Wave 2 memory — mark items done**

Edit `/Users/kirillkovalenko/.claude/projects/-Users-kirillkovalenko-Documents-Projects-Estrevia/memory/project_advertising_audit_2026_05_17_wave2.md`. Find the "Founder-owed asynchronous" section. Replace items 2-7 with:

```markdown
**Founder-owed asynchronous (NOT engineer scope):**
1. ~~After Vercel deploy: `npm run db:migrate` against prod (migration 0012 `email_leads_nurture_due_idx` predicate)~~ **DONE 2026-05-17 evening** — migration 0012 applied + Vercel prod deploy (see [[project-lead-nurture-drip-fully-live]])
2. ~~Create `wave2-demo-flag` in PostHog UI (project 407908)~~ **DONE 2026-05-17** — created via REST API (see [[project-wave2-closed-2026-05-17]] Task 1)
3. Rewrite 72 keyword strings in `src/shared/lib/chart-keywords.ts` (Vedic-authentic phrasing) — **Claude strawman DONE; awaits founder ES polish via outputs/wave-2-es-review/strings-to-review.md**
4. Rewrite SaturnWeekly + SynastryTeaser email body copy (`src/emails/*.tsx`) — **DONE 2026-05-17** (see [[project-wave2-closed-2026-05-17]] Tasks 3, 6)
5. ES translation review (LATAM neutro / `tú` form) — **Doc generated, awaits founder annotation** (`outputs/wave-2-es-review/strings-to-review.md`)
6. Vercel preview smoke before promoting to production — **founder-owed, async** (`docs/runbooks/founder-first-purchase-smoke.md`)
7. Wave 1 T5 close (smoke test + 2 dashboards + baseline doc) — **2 dashboards DONE + baseline doc DONE** (Tasks 2, 4); smoke + footer await founder
```

- [ ] **Step 4: Write founder status report**

Create `outputs/wave-1-checkpoint/STATUS.md` summarizing what's done and what's next for founder:

```markdown
# Wave 2 Closeout — Founder Handoff

**Session:** 2026-05-17 evening
**What changed:** 7 commits on `main` (local, not yet pushed).

## What is done

| # | Item | Commit |
|---|---|---|
| 1 | PostHog `wave2-demo-flag` created via API | `<sha1>` |
| 2 | Baseline doc with live DB metrics | `<sha2>` |
| 3 | SynastryTeaser recap-lie fix | `<sha3>` |
| 4 | PostHog dashboards × 2 created via API | `<sha4>` |
| 5 | chart-keywords.ts 72 Vedic-anchored strings | `<sha5>` |
| 6 | SaturnWeekly evergreen sade-sati rewrite | `<sha6>` |
| 7 | ES review doc generated | `<sha7>` |

## What you owe

Sorted by time-to-complete:

| Task | ETA | How |
|---|---|---|
| Vercel CLI upgrade | 30 sec | `npm i -g vercel@latest && vercel --version` |
| ES review | 10-20 min | Open `outputs/wave-2-es-review/strings-to-review.md`, write `ok` or `→ rewrite to: ...` per row, save, reply "ES review done" |
| Smoke test | ~10 min real flow | `docs/runbooks/founder-first-purchase-smoke.md`, then fill smoke section in `outputs/wave-1-checkpoint/00-baseline.md` |
| Push | After ES applied | `git push origin main` |

## Verify before push

```bash
npm run typecheck && npm run lint && npm test
```

All three green required.

## PostHog links (live now)

- North Star: <fill from Task 4 output>
- Paywall Funnel: <fill from Task 4 output>
- Demo flag: https://us.posthog.com/project/407908/feature_flags
```

(Fill `<shaN>` placeholders from `git log --oneline -7`.)

- [ ] **Step 5: Commit memory + status report**

```bash
git add outputs/wave-1-checkpoint/STATUS.md
git commit -m "docs(wave2-closeout): founder status report

Summarizes 7 commits on main + 4 founder-owed async tasks (Vercel CLI,
ES review, smoke test, push). Ordered by time-to-complete.

Memory updates separate (not in repo): project_wave2_closed_2026_05_17
created and indexed in MEMORY.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Verify final state**

```bash
git log --oneline -10
git status -sb
ls outputs/wave-1-checkpoint/
ls outputs/wave-2-es-review/
ls scripts/wave2-closeout/ 2>/dev/null
```

Expected:
- 8 new commits visible in log (Tasks 1-7 + Task 8)
- `git status` clean (only the pre-existing untracked files from session start)
- `outputs/wave-1-checkpoint/` has `00-baseline.md` + `.posthog-demo-flag-created` + `STATUS.md`
- `outputs/wave-2-es-review/` has `strings-to-review.md`
- `scripts/wave2-closeout/` empty or non-existent (all seed scripts deleted)

---

## Final Status

After Task 8: 8 commits local on main, awaiting founder for (a) ES annotation → commit 9 apply, (b) smoke test → commit 10 baseline close, (c) push.

Plan does NOT include the founder-async-dependent steps. Those resume in a follow-up session once founder hands back ES doc + smoke result.
