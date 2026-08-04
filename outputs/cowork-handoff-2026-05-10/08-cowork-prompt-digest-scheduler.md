# Cowork Task: Daily Advertising Digest Scheduler

**Purpose of this file:** self-contained prompt that the founder pastes into Cowork to set up the daily digest fetch. Standalone — does NOT require Cowork to read other Estrevia docs.

---

## Prompt (paste this into Cowork)

> **Task:** Set up a daily scheduled HTTP fetch against the Estrevia advertising digest endpoint and post the response to my monitoring channel. Behave like a small ops cron with retry + alerting, not like a one-shot script.
>
> **Environment variable required in Cowork env:**
> - `ADVERTISING_STATUS_BEARER` — 64-char hex bearer token. Founder pastes the value during setup; do not log or echo it back.
>
> **Schedule:** Daily Mon–Sun at **09:00 founder local time** (Asia/Tbilisi or whichever you have configured for me — confirm before scheduling). Timezone-stable, not 09:00 UTC.
>
> **HTTP request:**
> - Method: `GET`
> - URL: `https://estrevia.app/api/admin/advertising/digest?type=daily`
> - Headers:
>   - `Authorization: Bearer ${ADVERTISING_STATUS_BEARER}`
>   - `Accept: application/json`
> - Timeout: 30 seconds
>
> **Retry policy:** On 5xx or network error — retry up to 3 times with exponential backoff (30s, 60s, 120s). On 4xx — no retry, alert founder immediately.
>
> **Response handling:**
> 1. Parse JSON body. Expect shape `{ generatedAt: ISO8601 string, sections: Array<{ title: string, items: string[] }> }`. If body is not valid JSON, treat as failure.
> 2. If `sections` array is **empty** — post a brief one-liner: `"📅 Daily advertising digest 09:00 <date>: nothing to report (no tier-2 alerts accumulated)."`
> 3. If `sections` is **non-empty** — post a formatted message: each section as a header, each `items[]` entry as a bullet. Include `generatedAt` timestamp at the top.
>
> **Failure handling — alert founder via my own channel (NOT the Estrevia Telegram bot):**
> - `401 Unauthorized` — "Bearer rejected — check `ADVERTISING_STATUS_BEARER` matches Vercel prod value. May need rotation."
> - `403 Forbidden` — "Bearer accepted but admin allowlist rejected — check `ADMIN_ALLOWED_EMAILS` and any IP allowlist on the endpoint."
> - `404 Not Found` — "Endpoint moved or deploy reverted — verify the route exists at `src/app/api/admin/advertising/digest/route.ts` on main."
> - Any 5xx after 3 retries — quote status code + first 500 chars of response body.
> - Timeout — "Endpoint took >30s; likely cold-start or DB stall. Will retry next tick."
>
> **Acceptance criteria for the setup:**
> 1. Schedule fires at 09:00 founder TZ tomorrow.
> 2. First fire returns HTTP 200 (probably with `sections: []` since no tier-2 alerts have accumulated yet) and posts the "nothing to report" message.
> 3. Confirm the bearer value is stored encrypted in Cowork env, not in plaintext logs.
> 4. After 7 days of clean runs, founder can rely on this as the canonical daily ops touchpoint.
>
> **Context (so you understand WHY):** Estrevia's advertising agent has tier-1 alerts (immediate Telegram push — kill switch, account suspension, etc.) and tier-2 alerts (digest-batched — drop-off anomalies, weekly health summaries). Tier-2 used to push every event; as of 2026-05-10 (commit `1088d8a` + env flag `ADVERTISING_TIER2_VIA_DIGEST=true`) they accumulate in DB. The digest endpoint flushes them. Without this scheduled task, tier-2 alerts queue silently forever.
>
> **DO NOT do beyond this task scope:** Do not call `/status`. Do not modify Estrevia code or env vars. Do not contact founder for anything except scheduling-clarification (TZ confirm) or alert conditions above.
>
> When the schedule is live and first run succeeded, report back: `✅ Digest scheduler armed. First fetch at <ISO8601 local time>.`

---

## Founder side-notes (NOT part of the Cowork prompt above)

- Bearer value was reported in main Claude Code session on 2026-05-10. If you lost it, regenerate via `openssl rand -hex 32`, `printf '<new>' | vercel env add ADVERTISING_STATUS_BEARER production --force`, then paste new value into Cowork env. Old value invalidates on next Vercel deploy.
- If `/digest` returns 401 even with correct bearer: check `src/app/api/admin/advertising/digest/route.ts` for any additional auth gates beyond bearer comparison (e.g. ADMIN_ALLOWED_EMAILS, IP allowlist). The route was created in commit `586005b`.
- Daily 09:00 is a sensible default but Cowork can be set to weekdays-only if weekend digests turn out to be empty 90%+ of the time.
- After this scheduler runs cleanly for 1-2 weeks, the loop is fully closed: tier-2 sendAlert → DB queue → daily digest fetch → Cowork post → founder sees daily ops summary.
