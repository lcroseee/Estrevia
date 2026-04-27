# Estrevia Advertising Agent — Launch Runbook

Operational playbook for the autonomous Meta Ads management agent. Read this before activating, and reference during ongoing operation.

---

## Pre-launch checklist (before first paid spend)

### 1. Resolve outstanding manual steps

See `docs/advertising/dry-run-smoke-test.md` for current state. As of last verification (2026-04-26), 3 manual founder actions block production launch:

- [ ] **META_CAPI_TOKEN** — Events Manager → Pixel → Conversions API → Generate Access Token → add to `.env`
- [ ] **System User Ad Account permissions** — Business Settings → Users → System Users → click Estrevia agent → Add Assets → Ad Accounts → Manage Ads
- [ ] **POSTHOG_KEY** (if not already configured) — needed for funnel data + drop-off monitoring

### 2. Re-run pre-launch verification

```bash
npm run advertising:pre-launch-check
```

Must show **0 errors** before proceeding. Warnings (Ideogram/Runway optional fallbacks) are OK.

### 3. Pre-warming (data seeding) — 7 days before first paid spend

Per `docs/marketing.md` cold-start strategy: 50 known users complete the full funnel before Meta sees any cold traffic.

- [ ] Send beta-access link to 50 known users (friends, family, astro-network)
- [ ] Confirm ≥30 conversion events in Meta Events Manager (CAPI events visible)
- [ ] Confirm Event Match Quality (EMQ) > 6.0 in Events Manager
- [ ] Confirm PostHog funnel populated with realistic conversion rates
- [ ] Reconciler delta < 25% between Meta and PostHog

### 4. Initial creative batch generation

```bash
npm run advertising:generate-launch-batch
```

Generates ~22 creatives (11 EN + 11 ES) into DB with status `pending_review`. Cost: ~$2-5 in Gemini API.

Output: open admin URL → review each creative → approve 8-12 best ones.

### 5. Founder review of creatives

Open `/admin/advertising/creatives/review` (requires Clerk allowlist email — must be in `ADMIN_ALLOWED_EMAILS`).

For each creative:
- Check brand voice score (≥7.5/10)
- Check policy pre-check (no `block` severity)
- Verify hook is third-person, no personal claims, no predictive language
- Approve / Reject / Regenerate

Bulk: "Approve top N by score" if confident.

After approval: agent uploads to Meta as **paused** ads (NOT live yet).

---

## Launch sequence

### Phase 0 — Vercel production env vars

```bash
vercel env add META_ACCESS_TOKEN production
vercel env add META_AD_ACCOUNT_ID production
vercel env add META_PIXEL_ID production
vercel env add META_CAPI_TOKEN production
vercel env add META_BUSINESS_ID production
vercel env add ANTHROPIC_API_KEY production
vercel env add GEMINI_API_KEY production
vercel env add TELEGRAM_BOT_TOKEN production
vercel env add TELEGRAM_FOUNDER_CHAT_ID production
vercel env add ADMIN_ALLOWED_EMAILS production
vercel env add CRON_SECRET production
vercel env add ADVERTISING_DAILY_SPEND_CAP_USD production  # value: 80 (or your cap)
vercel env add ADVERTISING_AGENT_ENABLED production  # value: false (initially)
vercel env add ADVERTISING_AGENT_DRY_RUN production  # value: true (initially)
```

### Phase 1 — Production deploy with agent disabled

```bash
git push  # or vercel --prod
```

Vercel will deploy. Agent crons run on schedule but immediately return `{success:false, reason:"kill_switch"}` because `ADVERTISING_AGENT_ENABLED=false`.

### Phase 2 — Enable in dry-run mode

```bash
vercel env rm ADVERTISING_AGENT_ENABLED production
vercel env add ADVERTISING_AGENT_ENABLED production  # value: true
# DRY_RUN remains true — agent observes but does NOT act on Meta
```

Redeploy. Wait 1 hour (next hourly cron) — verify Telegram receives `[DRY RUN]` daily digest with stub data.

### Phase 3 — Live activation

After 24-48h of dry-run with healthy logs:

```bash
vercel env rm ADVERTISING_AGENT_DRY_RUN production
vercel env add ADVERTISING_AGENT_DRY_RUN production  # value: false
```

Redeploy. **From this moment, agent acts on Meta** (within hard caps).

### Phase 4 — Un-pause campaigns in Meta

Approved creatives are uploaded but paused. Final step: Meta Ads Manager UI → un-pause campaigns. Agent will observe and start managing.

---

## Daily operations

### Morning (5 minutes)

1. Check Telegram for **daily digest** (~09:30 UTC)
   - Spend, impressions, clicks, conversions
   - Actions taken (paused/scaled)
   - Shadow log (what shadow components observed)
   - Any anomalies or alerts
2. If `Founder action: NONE` → no action needed
3. If approval requested → respond via Telegram buttons within 4h (LOW_RISK auto-approves after timeout)

### Weekly (Monday, 30 minutes)

1. Read **weekly retro** in Telegram
2. Review top 5 highest-spend creatives — manual brand voice check
3. Manually open `business.facebook.com` → Account Quality → confirm no warnings
4. If brand drift detected → update `creative-gen/templates/` system prompt
5. If feature gate ready to activate → confirm in admin UI

### Monthly (1 hour)

1. Review pre-launch-results.md vs current — anything degraded?
2. Cumulative burn vs MRR (see `docs/business.md` checkpoints)
3. CAC by source (EN vs ES — adjust 70/30 split if needed)
4. Approve any new system prompt changes for creative generation
5. Run `npm run advertising:pre-launch-check` to catch infrastructure drift

---

## Kill switch (emergency stop)

If anything looks wrong (overspend, bad creatives shipped, Meta warnings):

```bash
vercel env rm ADVERTISING_AGENT_ENABLED production
vercel env add ADVERTISING_AGENT_ENABLED production  # value: false
```

Redeploy. Agent stops within seconds (next cron tick). Active campaigns continue running in Meta until you manually pause them in Meta UI.

For faster stop: manually pause campaigns in Meta Ads Manager directly.

---

## Troubleshooting

### Telegram digest not arriving

1. Check Vercel cron logs: `vercel logs --filter='/api/cron/advertising/triage-daily'`
2. Verify CRON_SECRET matches between Vercel env and Vercel cron config
3. Test manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://estrevia.app/api/cron/advertising/triage-daily`
4. Check `ADVERTISING_AGENT_ENABLED=true` in Vercel env

### Meta API 403 errors

System User permissions revoked or expired. Re-grant in Business Settings → Users → System Users → Add Assets → Ad Accounts → Manage Ads.

### Spend cap triggered

Agent paused all activity at daily cap. Telegram alert received. Either increase `ADVERTISING_DAILY_SPEND_CAP_USD` or wait for next day reset (UTC midnight). Check `/admin/advertising/spend` for breakdown.

### Creative disapproval rate climbing

Meta rejecting too many auto-generated creatives → account warning risk. Review last 10 disapprovals at `/admin/advertising/decisions` → tighten safety pre-check thresholds in `creative-gen/safety/checks.ts`.

### Bayesian decisions still in shadow mode after weeks

Sample size insufficient (need 5K impressions per creative). Either: (a) wait longer, (b) increase budget per creative, (c) reduce variant count to concentrate spend. Check current state at `/admin/advertising/gates`.

---

## Phase progression triggers

The agent activates new capabilities automatically when data thresholds are met. Monitor at `/admin/advertising/gates`.

| Component | Activation criterion | Effect when active |
|---|---|---|
| Bayesian decisions (Tier 2) | ≥5K impressions/creative AND ≥14 days running AND shadow agreement ≥70% | Statistical scale/pause decisions instead of fixed thresholds |
| Anomaly detection (Tier 3) | ≥30 days baseline | LLM-augmented anomaly explanation for unusual CPC/CTR spikes |
| Retargeting campaigns | Audience ≥200 members | Always-on retargeting for "calculated chart but didn't register" |
| Exclusion campaigns | Audience ≥100 members | Don't show ads to existing paying customers |

When a gate becomes ready, agent moves to `active_proposal` mode → asks founder via Telegram for first 5 decisions → after 5 approvals, `active_auto`.

---

## Decision points

### Month 3 review (per docs/risks.md)

| Metric | Red flag | Norm | Excellent |
|---|---|---|---|
| Registrations | < 500 | 1000-3000 | > 5000 |
| D30 retention | < 10% | 15% | > 20% |
| Free → Paid | < 1% | 2-3% | > 5% |
| Passport share rate | < 5% | 15% | > 25% |
| MRR | < $100 | $300-500 | > $2500 |

**Red flag in any:** change product, not advertising.
**Norm:** continue $500-1500/mo, scale.
**Excellent:** seek investment, scale aggressively.

### Month 6 — second decision point

If MRR < $500 and runway < 4 months → emergency mode (pause Meta, focus organic, evaluate pivot).
If MRR ≥ $1500 → consider Phase 2 of marketing (TikTok Ads, influencer scale, etc.).

---

## Reference docs

- **Marketing strategy:** `docs/marketing.md` (GTM, paid-first validation, principles)
- **Cold start:** `docs/marketing.md` § "Cold Start: первые 48 часов без данных"
- **Spanish strategy:** `docs/marketing.md` § "Параллельная Spanish-кампания"
- **Brand voice rules:** `docs/marketing.md` § "Brand Voice Drift Detection"
- **Risks + bandwidth:** `docs/risks.md`
- **Business numbers:** `docs/business.md` § "Месячный Burn Rate по фазам"
- **Implementation plan:** `docs/superpowers/plans/2026-04-26-advertising-agent.md`
- **Pre-launch results:** `docs/advertising/dry-run-smoke-test.md`
