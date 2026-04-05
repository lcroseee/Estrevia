# Аналитика и Event Tracking

> Без аналитики Kill Criteria невозможно измерить. PostHog — основной инструмент.

## Инструменты

| Инструмент | Роль | Стоимость |
|-----------|------|-----------|
| **PostHog** | Основная аналитика, A/B тесты, фичефлаги | $0 (до 1M events/мес) |
| **Meta Pixel** | Ретаргетинг, конверсии рекламы (клиентская сторона) | $0 |
| **Meta Conversions API (CAPI)** | Серверные события в Meta (страховка пикселя) | $0 |
| **Google Search Console** | SEO мониторинг | $0 |
| **Sentry** | Error tracking | $0 (free tier) |

---

## Meta Conversions API (CAPI)

> **Без CAPI Meta Pixel теряет 30-40% данных.** Браузерные блокировщики (AdBlock, iOS Safari, Brave, Firefox) блокируют клиентский пиксель. CAPI отправляет события с сервера напрямую в Meta — браузер не может заблокировать.

### Почему обязательно

| Без CAPI | С CAPI |
|----------|--------|
| Браузер → [AdBlock блокирует] → Meta не узнал | Сервер → напрямую Meta → данные получены |
| Meta видит 60% конверсий | Meta видит ~95% конверсий |
| Алгоритм оптимизирует неточно | Алгоритм оптимизирует на полных данных |
| Деньги тратятся в слепую | Каждый доллар работает |

### Какие события отправлять через CAPI

| Событие Meta | Триггер | API route |
|-------------|---------|-----------|
| `PageView` | Загрузка лендинга рекламы | Дублирует клиентский Pixel (дедупликация через `event_id`) |
| `ChartCalculated` (custom) | Расчёт натальной карты | `POST /api/chart/calculate` |
| `Lead` | Регистрация (signup) | `POST /api/auth/webhook` (Clerk webhook) |
| `Subscribe` | Оформление подписки | `POST /api/stripe/webhook` |

### Реализация (Next.js API Route)

```typescript
// lib/meta-capi.ts
const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN;

export async function sendMetaEvent({
  eventName,
  eventId,
  sourceUrl,
  clientIp,
  userAgent,
  userData = {},
}: {
  eventName: string;
  eventId: string;
  sourceUrl: string;
  clientIp: string;
  userAgent: string;
  userData?: Record<string, string>;
}) {
  await fetch(
    `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          event_name: eventName,
          event_id: eventId,        // Для дедупликации с клиентским Pixel
          event_time: Math.floor(Date.now() / 1000),
          event_source_url: sourceUrl,
          action_source: 'website',
          user_data: {
            client_ip_address: clientIp,
            client_user_agent: userAgent,
            ...userData,
          },
        }],
      }),
    }
  );
}
```

```typescript
// app/api/chart/calculate/route.ts (пример использования)
import { sendMetaEvent } from '@/lib/meta-capi';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  // ... расчёт карты через Swiss Ephemeris ...

  // Отправляем событие в Meta CAPI
  const eventId = randomUUID();
  await sendMetaEvent({
    eventName: 'ChartCalculated',
    eventId,
    sourceUrl: request.headers.get('referer') || 'https://estrevia.app/chart',
    clientIp: request.headers.get('x-forwarded-for') || '',
    userAgent: request.headers.get('user-agent') || '',
  });

  // Возвращаем eventId клиенту для дедупликации с Pixel
  return Response.json({ chart: result, metaEventId: eventId });
}
```

### Дедупликация Pixel + CAPI

Meta получает одно и то же событие дважды (из браузера через Pixel и с сервера через CAPI). Чтобы не считать дважды, оба события должны иметь одинаковый `event_id`:

```typescript
// Клиентская сторона: после получения ответа от /api/chart/calculate
fbq('track', 'ChartCalculated', {}, { eventID: response.metaEventId });
```

Meta автоматически дедуплицирует по `event_id`. Если браузер заблокировал Pixel — остаётся серверное событие. Если оба прошли — считается один раз.

### Env vars

```env
META_PIXEL_ID=123456789          # ID пикселя из Meta Business Manager
META_CAPI_TOKEN=EAAxxxxxxx...    # Access token из Events Manager → Settings
```

Оба хранятся в Vercel Environment Variables. Не в коде, не в `.env` файле в репозитории.

---

## Ключевые события (Events)

### Core

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `page_view` | path, referrer, utm_* | Каждая загрузка страницы |
| `chart_calculated` | system (sidereal/tropical), has_time, ayanamsa | Расчёт натальной карты |
| `signup_completed` | method (email/oauth), source, referrer | Регистрация |
| `chart_saved` | system, has_time | Сохранение карты в аккаунт |

### Контент

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `essay_read` | planet, sign, read_time_sec | Открытие эссе по позиции |
| `essay_scrolled` | planet, sign, scroll_percent | Прокрутка (25%, 50%, 75%, 100%) |
| `moon_calendar_viewed` | current_phase, date_range | Просмотр лунного календаря |
| `sidereal_explainer_viewed` | source, read_time_sec | Просмотр страницы «Почему сидерическая» |
| `data_feed_viewed` | feed_type (solar/earthquake/weather) | Просмотр ленты NASA/USGS (Фаза 2) |

### Конверсия

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `premium_clicked` | tier (star/cosmos), source | Клик на подписку |
| `premium_subscribed` | tier, price, currency, period (month/year) | Оплата подписки |
| `premium_cancelled` | tier, reason (если указана), months_active | Отмена подписки |
| `premium_trial_started` | tier | Начало trial (если будет) |

### Viral Loop (Cosmic Passport) — КРИТИЧЕСКАЯ ВОРОНКА

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `passport_created` | sun_sign, moon_sign, asc_sign, element, rarity_pct | Пользователь нажал «Поделиться» и создал passport |
| `passport_share_clicked` | method (web_share/copy_link/twitter/telegram/download_png) | Клик на конкретный метод шаринга |
| `passport_viewed` | share_id, referrer, is_new_visitor | Кто-то открыл `/s/[id]` |
| `passport_cta_clicked` | share_id | Посетитель `/s/[id]` кликнул «Узнай свой знак» |
| `passport_converted` | share_id, new_sun_sign | Посетитель `/s/[id]` рассчитал свою карту |
| `passport_reshared` | share_id, original_share_id | Посетитель `/s/[id]` создал свой passport |

> **Viral coefficient** = `passport_converted` / `passport_viewed` × (`passport_reshared` / `passport_converted`). Цель: > 1.0. Отслеживать еженедельно.

### Full Funnel (от входа до оплаты)

```
page_view (landing)
  → chart_input_started     — пользователь начал вводить данные
  → chart_calculated         — расчёт завершён
  → essay_read               — открыл эссе
  → passport_created         — создал share card
  → passport_share_clicked   — поделился
  → signup_started           — начал регистрацию
  → signup_completed         — завершил
  → premium_paywall_shown    — увидел paywall
  → premium_clicked          — кликнул «подписаться»
  → premium_subscribed       — оплатил
```

> Каждый шаг должен быть инструментирован с первого дня. Без `chart_input_started` невозможно понять, почему посетители уходят до расчёта (проблема в форме ввода? в геокодинге?).

### Engagement

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `chart_input_started` | source (landing/share_page/app/ad_landing) | Фокус на поле ввода даты |
| `city_search_failed` | query, lat?, lon? | Город не найден в 50K базе (мониторить для расширения!) |
| `system_toggled` | from, to (sidereal/tropical) | Переключение системы |
| `premium_paywall_shown` | trigger (essay/save/feature), essay_slug? | Показ soft paywall |
| `premium_paywall_dismissed` | trigger, essay_slug? | Закрытие paywall без действия |
| `premium_paywall_essay_preview` | essay_slug, preview_read_time_sec | Чтение превью заблокированного эссе |
| `pwa_installed` | platform (ios/android/desktop) | Установка PWA |
| `pwa_prompt_shown` | — | Показ промпта установки |
| `pwa_prompt_dismissed` | — | Отклонение промпта |

### Ошибки

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `calculation_error` | error_type, birth_data_hash | Ошибка расчёта карты |
| `api_error` | endpoint, status_code, error_message | Ошибка внешнего API |

---

## Дашборды

### Ежедневный (операционный)

- DAU
- Новые регистрации
- Карт рассчитано (sidereal vs tropical)
- PWA установок
- Ошибки (Sentry alert count)

### Еженедельный (продуктовый)

- Retention cohorts: D1 / D7 / D30
- Funnel: visit → chart → signup → premium
- Top эссе по read time
- Sidereal vs tropical usage ratio
- Share rate (charts shared / charts calculated)

### Рекламный (Meta Ads)

- CPC, CTR, CPM по адсетам
- Стоимость `chart_calculated` (custom conversion)
- Стоимость регистрации (Lead)
- Стоимость подписки (Subscribe)
- ROAS (Return on Ad Spend)
- Ретаргетинг: конверсия «рассчитал → зарегистрировался»
- Winning креатив: CTR, CPC, конверсия

### Ежемесячный (бизнес)

- MRR + MRR growth
- Churn rate
- CAC по каналам (organic vs Meta Ads vs referral vs influencer vs MCP)
- LTV/CAC ratio
- Conversion rate по тиерам
- Revenue по подпискам (Star vs Cosmos)
- Viral coefficient (passport_converted / passport_viewed × reshare rate)

---

## A/B тесты (PostHog Feature Flags)

### Запланированные

| Тест | Варианты | Метрика | Когда |
|------|---------|---------|-------|
| Цена Star | $5.99 vs $9.99 | Conversion rate, MRR | Месяц 1 |
| Paywall position | После 3 vs 5 эссе | Free → Paid conversion | Месяц 1 |
| CTA текст | «Попробовать» vs «Раскрыть карту» vs «Подписаться» | Click rate | Месяц 1 |
| Onboarding flow | С tutorial vs без | D7 retention | Месяц 2 |
| Landing hero | Карта vs космос-визуал vs текст | Signup rate | Месяц 2 |

---

## Privacy-First подход

- PostHog Cloud (EU hosting option) или self-hosted
- **Cookie consent banner** обязателен. PostHog tracking = opt-in
- Meta Pixel = opt-in (отдельный consent)
- Никаких third-party advertising cookies
- Данные аналитики не содержат PII (birth data = hashed)
- Retention: 90 дней для event data, 12 месяцев для aggregates
