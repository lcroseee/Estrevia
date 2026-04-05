# API Design: все endpoints

> Все серверные endpoints MVP. Расчёт натальной карты выполняется **на сервере** через Swiss Ephemeris (`sweph` Node.js native bindings).

---

## Версионирование API

Все публичные endpoints используют версионирование: `/api/v1/...`. Это позволяет вводить breaking changes в будущем без поломки существующих клиентов.

Webhooks и OG-image endpoints не версионируются (внешние сервисы привязаны к конкретным URL).

## Обзор

```
/api/v1/
├── chart/
│   ├── POST   /calculate     Рассчитать натальную карту (Swiss Ephemeris)
│   ├── POST   /save          Сохранить карту
│   ├── GET    /list          Список карт пользователя
│   ├── GET    /:id           Получить карту по ID
│   └── DELETE /:id           Удалить карту
│
├── cities/
│   └── GET    /?q=moscow&limit=10  Серверный поиск городов (autocomplete)
│
├── passport/
│   └── POST   /              Создать Cosmic Passport (share card)
│
├── feed/
│   └── GET    /              Лента NASA + USGS (Фаза 2)
│
├── og/
│   └── GET    /passport/:id  OG-картинка Cosmic Passport (без версии)
│
├── waitlist/
│   └── POST   /              Добавить email в waitlist
│
├── webhooks/                  (без версии — внешние сервисы)
│   ├── POST   /clerk         Clerk auth events
│   └── POST   /stripe        Stripe payment events
│
└── stripe/
    ├── POST   /checkout      Создать сессию оплаты
    └── POST   /portal        Открыть портал управления подпиской
```

---

## Детально

### POST /api/chart/calculate

Рассчитать натальную карту через Swiss Ephemeris (серверный). Основной вычислительный endpoint.

```
Auth: Not required (гости могут считать карту)
Rate limit: 10 req/мин (guest), 60 req/мин (auth)

Request:
{
  "birthDate": "1990-03-15",
  "birthTime": "14:30",              // опционально
  "birthTimeKnown": true,
  "city": "Moscow, Russia",
  "lat": 55.7558,
  "lon": 37.6173,
  "timezone": "Europe/Moscow",
  "system": "sidereal",
  "ayanamsa": "lahiri",
  "houseSystem": "placidus"
}

Response 200:
{
  "planets": [
    {"planet": "sun", "sign": "pisces", "degree": 0, "minute": 31,
     "second": 19.2, "absoluteDegree": 330.522, "isRetrograde": false,
     "house": 5, "speed": 1.0194},
    ...
  ],
  "aspects": [
    {"planet1": "sun", "planet2": "mars", "type": "square",
     "orb": 1.8, "isApplying": true},
    ...
  ],
  "houses": [
    {"number": 1, "sign": "libra", "degree": 2.5},
    ...
  ],
  "meta": {
    "ephemerisVersion": "swisseph_2.10",
    "ayanamsaValue": 23.732,
    "calculatedAt": "2026-04-04T15:30:00Z"
  }
}

Errors:
  422 — невалидные данные (дата, координаты)
  429 — rate limit
  500 — ошибка Swiss Ephemeris
```

---

### POST /api/chart/save

Сохранить рассчитанную карту для авторизованного пользователя.

```
Auth: Required (Clerk)
Rate limit: 10 req/мин

Request:
{
  "label": "Моя карта",
  "birthDate": "1990-03-15",           // шифруется
  "birthTime": "14:30",                // шифруется, опционально
  "birthTimeKnown": true,
  "birthLocation": "Moscow, Russia",   // шифруется
  "birthLat": 55.7558,                 // шифруется
  "birthLon": 37.6173,                 // шифруется
  "timezoneAtBirth": "Europe/Moscow",
  "system": "sidereal",
  "ayanamsa": "lahiri",
  "houseSystem": "placidus",
  "planets": [
    {"planet": "sun", "sign": "pisces", "degree": 0, "minute": 31,
     "absoluteDegree": 330.522, "isRetrograde": false, "house": 5,
     "speed": 1.0194},
    ...
  ],
  "aspects": [
    {"planet1": "sun", "planet2": "mars", "type": "square",
     "orb": 1.8, "isApplying": true},
    ...
  ],
  "houses": [
    {"number": 1, "sign": "libra", "degree": 2.5},
    ...
  ]
}

Response 201:
{
  "id": "chart_abc123",
  "createdAt": "2026-04-04T15:30:00Z"
}

Errors:
  401 — не авторизован
  403 — лимит карт (Free: 1, Star: ∞)
  422 — невалидные данные
  429 — rate limit
```

### GET /api/chart/list

```
Auth: Required
Rate limit: 30 req/мин

Response 200:
{
  "charts": [
    {
      "id": "chart_abc123",
      "label": "Моя карта",
      "isPrimary": true,
      "system": "sidereal",
      "sunSign": "pisces",
      "moonSign": "cancer",
      "ascSign": "libra",       // null если время неизвестно
      "createdAt": "2026-04-04T15:30:00Z"
    }
  ]
}

Примечание: НЕ возвращает birth_data (PII).
  Birth data — только при GET /api/chart/:id
  (нужен для пересчёта с другими настройками).
```

### GET /api/chart/:id

```
Auth: Required (owner only)
Rate limit: 30 req/мин

Response 200:
{
  "id": "chart_abc123",
  "label": "Моя карта",
  "birthDate": "1990-03-15",        // дешифровано для владельца
  "birthTime": "14:30",
  "birthTimeKnown": true,
  "birthLocation": "Moscow, Russia",
  "birthLat": 55.7558,
  "birthLon": 37.6173,
  "system": "sidereal",
  "ayanamsa": "lahiri",
  "planets": [...],
  "aspects": [...],
  "houses": [...],
  "meta": {
    "ephemerisVersion": "swisseph_2.10",
    "ayanamsaValue": 23.732
  }
}
```

### DELETE /api/chart/:id

```
Auth: Required (owner only)

Response 204: (no content)

Примечание: hard delete. Удаляет NatalChart + ChartPlanets
  + ChartAspects + ChartHouses каскадно.
```

### GET /api/v1/cities

Серверный поиск городов для autocomplete. Заменяет загрузку 50K JSON на клиент.

```
Auth: Not required
Rate limit: 30 req/мин
Cache: in-memory (cities dataset загружается один раз при старте функции)

Query params:
  ?q=moscow          Поисковый запрос (минимум 2 символа)
  ?limit=10          Количество результатов (default: 10, max: 20)

Response 200:
{
  "cities": [
    {
      "name": "Moscow",
      "country": "Russia",
      "lat": 55.7558,
      "lon": 37.6173,
      "timezone": "Europe/Moscow",
      "population": 12506468
    },
    {
      "name": "Moscow",
      "country": "United States",
      "lat": 46.7324,
      "lon": -117.0002,
      "timezone": "America/Los_Angeles",
      "population": 25435
    }
  ]
}

Errors:
  400 — q слишком короткий (< 2 символов)
  429 — rate limit
```

**Реализация:** Dataset городов (~50K записей) загружается в память Vercel Function при первом запросе. Поиск по prefix + fuzzy matching. Результаты сортируются по population (крупные города первыми).

---

### GET /api/feed (Фаза 2)

```
Auth: Not required
Rate limit: 30 req/мин
Cache: Redis (5 мин TTL)

Query params:
  ?type=solar|earthquake|all    (default: all)
  ?limit=20                     (default: 20, max: 50)
  ?offset=0

Response 200:
{
  "items": [
    {
      "id": "feed_xyz",
      "source": "nasa_donki",
      "type": "solar_flare",
      "title": "M2.5 Solar Flare",
      "severity": "M",
      "eventTime": "2026-04-04T12:30:00Z",
      "description": "An M2.5 class flare erupted from AR3847..."
    },
    {
      "id": "feed_abc",
      "source": "usgs_earthquake",
      "type": "earthquake",
      "title": "M5.2 Earthquake - Japan",
      "magnitude": 5.2,
      "lat": 35.6762,
      "lon": 139.6503,
      "eventTime": "2026-04-04T08:15:00Z"
    }
  ],
  "lastUpdated": "2026-04-04T15:25:00Z",
  "nextUpdate": "2026-04-04T15:30:00Z"
}
```

### GET /api/og/passport/:id

```
Auth: Not required (public — для social sharing)
Cache: CDN (immutable, кэш навсегда — ID уникален)

Response: PNG image 1200x630
  Content-Type: image/png

Генерация через @vercel/og (Satori: JSX → SVG → PNG).
Тёмный фон (#0A0A0F), планетарные глифы, ESTREVIA branding.

Содержит: тропический → сидерический знак, Солнце/Луна/ASC,
  управляющая планета, элемент, rarity %.
```

### POST /api/waitlist

```
Auth: Not required
Rate limit: 5 req/мин

Request:
{
  "email": "user@example.com",
  "source": "landing"            // utm_source или referrer
}

Response 201:
{ "status": "added" }

Response 409:
{ "status": "already_exists" }

Действие на сервере:
  1. Сохранить в Postgres (WaitlistEntry)
  2. Отправить welcome email через Resend
  3. PostHog: track('waitlist_signup')
```

### POST /api/stripe/checkout

```
Auth: Required

Request:
{
  "tier": "star",               // "star" | "cosmos"
  "period": "monthly"           // "monthly" | "annual"
}

Response 200:
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay_xxx..."
}

Клиент делает: window.location.href = checkoutUrl
```

### POST /api/stripe/portal

```
Auth: Required (Premium users)

Response 200:
{
  "portalUrl": "https://billing.stripe.com/p/session_xxx..."
}

Stripe Customer Portal: управление подпиской, смена карты, отмена.
```

### POST /api/webhooks/clerk

```
Auth: Clerk webhook signature verification
(svix-id, svix-timestamp, svix-signature headers)

Events handled:
  user.created    → db.insert(users)
  user.updated    → db.update(users).set(...)
  user.deleted    → db.update(users).set({deletedAt: new Date()})
```

### POST /api/webhooks/stripe

```
Auth: Stripe webhook signature verification
(stripe-signature header)

Events handled:
  checkout.session.completed  → user.is_premium = true
  invoice.paid                → update premium_expires_at
  invoice.payment_failed      → send email warning
  customer.subscription.deleted → user.is_premium = false
```

---

## Cron Jobs (Vercel Cron)

> **Data Feed (NASA/USGS) перенесён в Фазу 2.** Cron jobs ниже будут реализованы после валидации MVP.

```json
// vercel.json (или vercel.ts) — Фаза 2
{
  "crons": [
    {
      "path": "/api/cron/nasa",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/usgs",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### GET /api/cron/nasa (Фаза 2)

```
Auth: Vercel Cron secret (CRON_SECRET header)

Действия:
  1. Fetch NASA DONKI API (solar flares, CMEs)
  2. Parse + transform
  3. Upsert в Redis (TTL 5 мин)
  4. Insert new items в Postgres (для истории)
```

### GET /api/cron/usgs (Фаза 2)

```
Auth: Vercel Cron secret

Действия:
  1. Fetch USGS Earthquake GeoJSON
  2. Filter: magnitude > 3.0
  3. Parse + transform
  4. Upsert в Redis (TTL 5 мин)
  5. Insert new items в Postgres
```

---

## Валидация (Zod)

Каждый endpoint валидирует вход через Zod:

```typescript
const ChartCalculateSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  birthTimeKnown: z.boolean(),
  city: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().min(1),
  system: z.enum(['sidereal', 'tropical']),
  ayanamsa: z.enum(['lahiri']),  // MVP: только Lahiri
  houseSystem: z.enum(['placidus']),  // MVP: только Placidus
})

const ChartSaveSchema = z.object({
  label: z.string().min(1).max(100),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  birthTimeKnown: z.boolean(),
  birthLocation: z.string().min(1).max(200),
  birthLat: z.number().min(-90).max(90),
  birthLon: z.number().min(-180).max(180),
  system: z.enum(['sidereal', 'tropical']),
  ayanamsa: z.enum(['lahiri', 'fagan_bradley', 'krishnamurti']),
  houseSystem: z.enum(['placidus', 'whole_sign', 'equal']),
  planets: z.array(PlanetSchema).length(12),
  aspects: z.array(AspectSchema),
  houses: z.array(HouseSchema).length(12).nullable(),
})
```
