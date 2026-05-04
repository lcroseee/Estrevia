# Founder Meta Setup Checklist — From Empty Vercel Env to Autonomous Agent

This is the **only** sequence that takes the v3b autonomous advertising agent from "all code shipped, no Meta resources exist" to "agent making real Meta-ads decisions." Every step is gated by the previous one — do them in order.

**Last updated:** 2026-05-04 (after T1-T5 autonomy fixes shipped)
**Audience:** Estrevia founder (only person with Meta Business + Vercel admin)
**Estimated wall-clock:** ~2-4h founder + ~3-7d shadow run + ~14-30d maturity period

---

## Stage 0 — Confirm code state (no founder action; verification only)

```
git log --oneline origin/main | head -10
```

Should show these 5 commits at the top:

- `6dd8b03` `feat(advertising/triage-daily): auto-bootstrap state row for new ad sets (Phase A)`
- `a86322f` `feat(checkout): forward estrevia_utm cookie to /api/v1/stripe/checkout body`
- `7588485` `feat(advertising/scripts): seed-ad-set-state for launch ad sets (one-shot)`
- `b5ae8d8` `feat(shared/utm): client cookie capture for first-touch attribution`
- `cb61a88` `fix(stripe/checkout): forward utm_* + utm_click_timestamp to session metadata`

Vercel auto-deploys main → check **all green**:

```
vercel ls --prod | head -5
```

---

## Stage 1 — Create Meta Pixel + CAPI token (Meta UI, ~10 min)

Meta Business Suite → Events Manager → **Connect Data Sources** → Web → **Continue with Pixel**.

1. Name it `Estrevia Pixel` (or whatever; doesn't matter).
2. Enter `https://estrevia.app` as the website.
3. Pick "Install code manually" (the agent's `layout.tsx` already has the snippet — Stage 3 just plugs in the ID).
4. Copy the **Pixel ID** (15-digit number).

Then in same Pixel page → **Settings** → **Conversions API** → **Set up manually** → **Generate Access Token** → copy the long token.

Verify ownership:
- **Domain Verification** (Meta Business Suite → Brand Safety → Domains) — add `estrevia.app`. Use DNS TXT method (avoids requiring meta tag deploy).

---

## Stage 2 — Set Vercel env vars (CLI, ~3 min)

```
vercel env add META_PIXEL_ID production         # paste 15-digit pixel id
vercel env add NEXT_PUBLIC_META_PIXEL_ID production  # SAME 15-digit pixel id (browser mirror)
vercel env add META_CAPI_TOKEN production       # paste long access token
```

Optional but recommended for staging:
```
vercel env add META_PIXEL_ID preview
vercel env add NEXT_PUBLIC_META_PIXEL_ID preview
vercel env add META_CAPI_TOKEN preview
```

Trigger a redeploy so the new env reaches the live site:
```
git commit --allow-empty -m "chore: trigger redeploy for Meta env vars"
git push origin main
```

(Or use the Vercel dashboard "Redeploy" button on the latest production deployment.)

---

## Stage 3 — Browser sanity-check Pixel + UTM (~5 min)

After redeploy completes:

1. Open `https://estrevia.app/?utm_source=test&utm_campaign=verify` in an incognito window.
2. DevTools → **Application** → **Cookies** → `estrevia.app` → confirm `estrevia_utm` cookie exists with JSON containing `utm_source: 'test'` + `utm_campaign: 'verify'` + `utm_click_timestamp: <ISO string>`.
3. DevTools → **Network** → filter `facebook` → reload → confirm a request to `https://www.facebook.com/tr/?id=<pixel_id>&ev=PageView` fires.
4. Click any "Subscribe" / "Upgrade" button → DevTools Network → POST to `/api/v1/stripe/checkout` → request body should include `utm_source: 'test'`, `utm_campaign: 'verify'`, `utm_click_timestamp`.
5. Meta Business Suite → Events Manager → your Pixel → **Test Events** tab → enter your IP or use Test Event Code (`META_CAPI_TEST_EVENT_CODE` env optional) → confirm `PageView` fires within ~30s.

**If any step fails, stop here and debug before proceeding.** Common failure modes:
- Cookie not written → `NEXT_PUBLIC_META_PIXEL_ID` not set in Vercel, or build hasn't redeployed.
- Pixel request not firing → adblock interference (test in fresh incognito).
- Test Events not arriving → CAPI token wrong or domain not verified.

---

## Stage 4 — Create launch campaign + ad sets via script (~5 min, $0 spend)

```
npx tsx scripts/advertising/setup-meta-campaign.ts
```

This creates 1 campaign + 2 ad sets (EN $14/day, ES $6/day, both **PAUSED**) and **prints the IDs to stdout**. Important: nothing starts spending — `status: 'PAUSED'` everywhere.

Copy the printed IDs and write to Vercel:

```
vercel env add META_LAUNCH_CAMPAIGN_ID production    # paste campaign_id
vercel env add META_LAUNCH_ADSET_ID_EN production    # paste adset_id_en
vercel env add META_LAUNCH_ADSET_ID_ES production    # paste adset_id_es
```

(Optional script flags: `--reuse-campaign-id <id>` if a partial prior run left a campaign behind.)

Open Meta Ads Manager → confirm the campaign exists, both ad sets PAUSED, targeting/budgets correct. Adjust if needed BEFORE proceeding.

---

## Stage 5 — Seed advertising_ad_set_state DB rows (~30s)

Once `META_LAUNCH_ADSET_ID_EN/ES` are populated in Vercel, pull the prod env locally and run the seed:

```
vercel env pull --yes --environment=production /tmp/.vercel.prod.env
set -a && source /tmp/.vercel.prod.env && set +a
npx tsx scripts/advertising/seed-ad-set-state.ts
rm /tmp/.vercel.prod.env  # IMPORTANT — file contains all prod secrets
```

Expected output:
```
Seeding advertising_ad_set_state for launch ad sets…
  ▶ EN — ad set <id>
  • looking up campaign_id via Meta Graph API…
    campaign_id=<id>
  ✅ inserted (current_phase=B, data_maturity_mode=COLD_START)
  ▶ ES — ad set <id>
  ...
=== Seed summary ===
  inserted: 2
  already present: 0
  failures: 0
```

Idempotent — safe to re-run.

---

## Stage 6 — Add creatives + un-pause ad sets (Meta UI, ~30 min per ad)

Use existing Estrevia creative-gen:
```
npx tsx scripts/advertising/generate-launch-batch.ts
```

Or upload manually via Meta Ads Manager. Either way: each ad needs an image + body copy + headline + UTM-tagged URL pointing to `https://estrevia.app/?utm_source=meta&utm_campaign=estrevia_launch_<locale>&utm_content=<ad_id>`.

When ready: in Ads Manager, switch ad sets from PAUSED → ACTIVE. Spend begins immediately.

---

## Stage 7 — Flip seniorBuyerMode to 'on' (admin UI, ~1 min)

`https://estrevia.app/admin/advertising/gates` (Clerk login as admin).

Toggle `seniorBuyerMode: off → on`.

`ADVERTISING_AGENT_DRY_RUN` stays `true` for now — agent will *log* decisions but not call Meta API.

---

## Stage 8 — Shadow run for 7 days (passive monitoring)

Watch:
- `/admin/advertising/decisions` — confirm decisions are being logged (Phase B "do nothing yet" is normal until ≥50 conversions).
- `/admin/advertising/ad-set-state` — should show 2 rows (EN + ES) in Phase B, COLD_START.
- `/admin/advertising/spend` — actual Meta spend (independent of agent).
- Sentry → tag `subsystem: senior-buyer | meta-capi` — should show **zero alerts** in 48h.
- Telegram → no `❌ HIGH_RISK approval needed` messages (agent's first scale won't fire until ≥50 conversions accumulated).

If any of these deviate from expected, **do not proceed to Stage 9** — diagnose.

---

## Stage 9 — Flip ADVERTISING_AGENT_DRY_RUN to false (Vercel, ~2 min)

Only after Stage 8 has run cleanly for ≥7 days AND ≥1 ad set has graduated to CALIBRATING (visible in /admin/advertising/ad-set-state):

```
vercel env add ADVERTISING_AGENT_DRY_RUN production   # value: false
git commit --allow-empty -m "chore: trigger redeploy DRY_RUN=false"
git push origin main
```

Real Meta mutations begin immediately on next cron tick (`triage-hourly` runs every hour).

**Watch the first 24h closely.** If anything looks wrong, flip `seniorBuyerMode` back to `off` via admin UI (instant) — that bypasses the agent entirely and falls back to Tier-1 hard-rules path (the legacy code).

---

## Stage 10+ — Ongoing operations

See `docs/advertising/launch-runbook.md` for steady-state monitoring + escalation paths.

---

## Why this exists

The autonomous advertising agent (v3b, shipped 2026-05-04) requires real Meta resources (Pixel, campaign, ad sets) and real env vars before it can produce meaningful decisions. The 5 code blockers from v3b → autonomy (Stripe UTM forwarding, client UTM cookie capture, button wiring, state seed, defensive auto-bootstrap) are all in `main`, but every one of them needs founder-side Meta UI work to actually exercise.

This checklist exists because the v3b shipped memo described _what_ ships, not _what's blocked_. As of 2026-05-04, all listed Vercel `META_*` env vars are present-but-empty — the founder hasn't yet completed Stage 1-2.
