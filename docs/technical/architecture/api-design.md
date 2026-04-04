# API Design: все endpoints

> Все серверные endpoints MVP. Расчёт карты — на клиенте (WASM), здесь только то, что требует сервер.

---

## Обзор

```
/api/
├── chart/
│   ├── POST   /save          Сохранить карту
│   ├── GET    /list          Список карт пользователя
│   ├── GET    /:id           Получить карту по ID
│   └── DELETE /:id           Удалить карту
│
├── feed/
│   └── GET    /              Лента NASA + USGS
│
├── og/
│   └── GET    /chart         OG-картинка для шаринга
│
├── waitlist/
│   └── POST   /              Добавить email в waitlist
│
├── webhooks/
│   ├── POST   /clerk         Clerk auth events
│   └── POST   /stripe        Stripe payment events
│
└── stripe/
    ├── POST   /checkout      Создать сессию оплаты
    └── POST   /portal        Открыть портал управления подпиской
```

---

## Детально

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

### GET /api/feed

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

### GET /api/og/chart

```
Auth: Not required (public — для social sharing)
Cache: CDN (24 часа)

Query params:
  ?sun=pisces&moon=cancer&asc=libra&system=sidereal

Response: PNG image 1200x630
  Content-Type: image/png

Генерация через next/og (ImageResponse).
Тёмный фон, планетарные глифы, ESTREVIA branding.
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
  user.created    → prisma.user.create()
  user.updated    → prisma.user.update()
  user.deleted    → prisma.user.update({deletedAt: now()})
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

```json
// vercel.json (или vercel.ts)
{
  "crons": [
    {
      "path": "/api/cron/nasa",
      "schedule": "*/5 * * * *"     // каждые 5 минут
    },
    {
      "path": "/api/cron/usgs",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### GET /api/cron/nasa

```
Auth: Vercel Cron secret (CRON_SECRET header)

Действия:
  1. Fetch NASA DONKI API (solar flares, CMEs)
  2. Parse + transform
  3. Upsert в Redis (TTL 5 мин)
  4. Insert new items в Postgres (для истории)
```

### GET /api/cron/usgs

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
