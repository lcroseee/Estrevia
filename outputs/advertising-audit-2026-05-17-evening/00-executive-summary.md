# Advertising audit — 2026-05-17 (evening, post-fix)

**Window:** ~6h after morning fix (OUTCOME_LEADS activation + lead-nurture deploy).
**Verdict:** GREEN с одним Sev1 code-bug в email pipeline. Кампания работает.

## TL;DR

| Channel | Status | Today (2026-05-17) |
|---|---|---|
| Meta Lead campaign | ✅ ACTIVE | $18.26 spend, 22 Lead actions, CPL $0.60 (ES) / $1.44 (EN) |
| Meta LPV campaign | ✅ PAUSED | 0 spend |
| Pixel + CSP + CAPI | ✅ wired | 22 fb_pixel_lead today |
| Lead DB capture | ✅ working | 33 leads today (20 today + 13 backlog) |
| Lead nurture T+0 | ⚠ **Sev1** | 33 `sent_lead_emails` rows, but **32/33 без resend_message_id** |
| Lead nurture cron | ✅ working | Recovered all stuck leads, advanced to step=1 |
| Lead→User conversion | – | 2/34 = 5.9% (30d, pre-nurture baseline) |
| Advertising agent | OFF | `ENABLED=false` + `DRY_RUN=true` per v3b plan |

## Что произошло за день (хронология)

1. ~12:00 — выявлено: live кампания — OUTCOME_TRAFFIC/LPV ($6/день, 0 leads / $128 за 30д).
2. ~13:00 — переключение: paused LPV, activated OUTCOME_LEADS (EN+ES по $25/день = $50 total).
3. ~13:00 — также пофикшен ES Lead ad creative с неверной page_id (593... → Estrevia 1087...).
4. ~17:00 — десантировано 10 агентами: lead-nurture drip (T+0/T+24h/T+72h), миграция 0011, cron.
5. ~17:42 — первые лиды через новый OUTCOME_LEADS funnel приходят в БД.
6. ~18:26 — первый T+0 email "запущен" в waitUntil (но Resend send result `data.id` = NULL).
7. ~19:00 — hourly cron подхватывает 17 stuck leads (`step=0, nextAt=NULL, age>15min`), advance'ит state.
8. ~19:44 — последний (и пока единственный) T+0 email с populated `resend_message_id` — `l.crosedontknow@gmail.com`.

## Sev1 (blocking next sweep): код врёт об успехе Resend send

**Файл:** `src/shared/lib/email.ts:343-359` (паттерн повторяется в `sendLeadMoonAscEmail` ~370+, `sendLeadPaywallTeaserEmail` ~420+).

**Что не так:**
```ts
const result = await getResend().emails.send({...}, { idempotencyKey: ... });
await recordSentLead(params.leadId, 'lead_chart', result.data?.id ?? null);
return { sent: true };          // ← LIES if result.error is set
```

`result.error` не проверяется. Если Resend вернул `{data: null, error: {...}}` (rate limit, suppressed recipient, invalid html, etc.), функция:

1. Вызывает `recordSentLead(.., null)` — early-return из-за `if (!resendMessageId) return`, обновления БД нет.
2. Возвращает `{ sent: true }` — caller advance'ит `nurture_step` и `nurture_next_at`.
3. Лид никогда не получит письмо, но в системе будет помечен как "T+0 done, T+24h scheduled".

**Доказательство:** 32 из 33 рядов `sent_lead_emails` имеют `resend_message_id = NULL`. Все они идентично имеют sent_at в момент `tryInsertOneShotLead` (insert dedup row), что подтверждает: либо Resend вернул error result, либо `.send()` бросил исключение **после** dedup-insert но **до** `recordSentLead`.

**Фикс:**
```ts
const result = await getResend().emails.send(...);
if (result.error) {
  // НЕ записывать sent: true; пусть cron retry на следующем часе
  throw new Error(`Resend rejected: ${result.error.message ?? 'unknown'}`);
}
await recordSentLead(params.leadId, 'lead_chart', result.data?.id ?? null);
return { sent: true };
```

Дополнительно: cron `already_sent` branch (lead-nurture/route.ts:166-174) **не различает** "идемпотентность" vs "первый send упал". На fallback ветке `tryInsertOneShotLead` вернёт false, и cron advance'ит state **без повторной попытки** — это закрепит баг навсегда.

**Recommend:** в `tryInsertOneShotLead` отделить "row exists без resend_message_id" (= retry) vs "row exists с resend_message_id" (= true dedup).

## Sev2 — observability gap

- **Sentry tags по `lead-nurture-t0`** должны были поймать падения, но мы их не видели в этой сессии. Проверь Sentry за окно 18:00-19:30 UTC по тагу `component:lead-nurture-t0` — там должны быть 32 события если throw'ило, или 0 если Resend вернул `data:null,error:...` (тогда код не throw'ал).

- **Resend dashboard** — единственный источник правды о реальной доставке. API ключ в `.env` "send-only" → нельзя проверить программно. Нужен **read-only** sub-key для аудит-скриптов, ИЛИ founder вручную сверяет.

## Sev3 — нюансы

- Pixel `last_fired_time` показывает 2026-05-16T23:59:58 (1200 мин назад), но Meta insights показывают 22 Lead actions сегодня — поле обновляется лениво, не индикатор.
- `meta` UTM source split: 22 leads через Meta (Lead campaign) + 7 organic + 3 chatgpt.com — органика от ChatGPT (видимо, кто-то рекомендует) — стоит понять как разросся.
- `ad_lead_es_swiss_2026-05-17`: 14 LPV → 2 Lead = 14% (vs остальные ES 30-40%). Креатив про Swiss Ephemeris не резонирует — кандидат на pause после 7д.
- `ad_lead_en_passport_2026-05-17`, `ad_lead_en_lahiri_2026-05-17`, `ad_lead_en_swiss_2026-05-17`, `ad_en_lead_v1`: 0 leads at small spend. EN портал недокручен — нужно больше impr для статистики, но angle "combinations" уже выигрывает.

## Что НЕ изменилось с утра (всё ещё owned by founder)

| Owner | Action | Memory |
|---|---|---|
| founder | Apply migrations 0007/0008/0010 to prod — **ALREADY DEPLOYED** ✓ (verified: chart_readings exists) | – |
| founder | Apply 0011 — **ALREADY DEPLOYED** ✓ (sent_lead_emails exists) | – |
| founder | Verify Vercel `META_PIXEL_ID=1945750759636135` (only `.env` confirmed locally) | sev2 |
| founder | Resend dashboard manual check за окно 18:26-19:44 UTC — посчитать сколько Real Sent vs Real Bounce | new Sev1 |

## Метрики, к которым возвращаться 2026-05-18+

- `email_leads.converted_to_user_id` count (сейчас 2/34) → должен расти по мере T+24h/T+72h drip
- `chart_readings` count (сейчас 0) → пойдёт при первом Pro upgrade
- Meta Lead actions / Pixel reported leads vs `email_leads` count (сегодня 22 Meta vs 33 DB — 11 разница — органика + UTM-stripping)
- CPL trend EN vs ES (сейчас $1.44 vs $0.60 — ES 2.4× дешевле, но и trafficstoch)

## Запуск Resend API key с read permission

Скрипт-аудитор не может проверить delivery rate из-за `restricted_api_key`. Запросить read scope:

```bash
# Resend → Settings → API Keys → New key → Permission: Sending + Reading
# Save as RESEND_AUDIT_API_KEY in .env (separate from production RESEND_API_KEY)
```

Затем добавить в `_audit_resend_verify.mjs` запрос с read-ключом — увидим bounce/delivery rates по leads.
