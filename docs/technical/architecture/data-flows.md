# Потоки данных: как информация перемещается

> Откуда берутся данные, как трансформируются, где хранятся, куда уходят.

---

## Поток 1: Натальная карта (core)

```
ВВОД                    ОБРАБОТКА                   ВЫВОД
─────                   ─────────                   ─────

Пользователь:           ┌─ КЛИЕНТ ──────────┐
                        │                    │
 date: 1990-03-15  ───→ │ 1. Geocode город   │
 time: 14:30       ───→ │    "Moscow"→lat/lon│
 city: "Moscow"    ───→ │                    │
                        │ 2. POST /api/chart/│
                        │    calculate       │
                        │    {date, time,    │
                        │     lat, lon}      │
                        └────────┬───────────┘
                                 │
                        ┌─ СЕРВЕР (Vercel Function) ─┐
                        │                             │
                        │ 3. Timezone lookup           │
                        │    → Europe/Moscow           │
                        │                             │
                        │ 4. Julian Day calc           │
                        │    → 2448264.1042           │
                        │                             │
                        │ 5. Swiss Ephemeris (sweph):  │
                        │    Для каждого из 12 тел:    │
                        │     - ecliptic longitude     │
                        │     - ecliptic latitude      │
                        │     - distance               │
                        │     - speed                  │
                        │                             │
                        │ 6. Ayanamsa offset           │
                        │    (если sidereal):          │
                        │    tropical_pos −             │
                        │    24.18° (Lahiri 2026)      │
                        │                             │
                        │ 7. Знак = floor(pos/30)      │
                        │    Градус = pos mod 30       │
                        │                             │
                        │ 8. Дома (если время          │
                        │    известно): Placidus cusps │
                        │                             │
                        │ 9. Аспекты:                  │
                        │    66 пар, conjunction < 8°   │
                        │    opposition 180±8° и т.д.  │
                        └────────────┬────────────────┘
                                     │ JSON response
                        ┌─ КЛИЕНТ ───┴────────┐   Экран:
                        │                      │
                        │ 10. SVG рендеринг    │ ──→  SVG Колесо
                        │     колеса            │      с планетами
                        │                      │
                        │                      │ ──→  Таблица позиций:
                        │                      │      ☉ Солнце 24°15' ♓
                        │                      │      ☽ Луна 8°42' ♋
                        │                      │
                        │                      │ ──→  "Ваш знак: Рыбы
                        │                      │       (не Овен!)"
                        └──────────────────────┘

              Расчёт на сервере через sweph (Node.js native).
              Клиент получает готовые позиции и рендерит SVG.
              Требуется интернет-соединение.
```

### Данные после расчёта (в памяти)

```typescript
type ChartResult = {
  input: {
    date: string          // "1990-03-15"
    time: string | null   // "14:30" или null
    lat: number           // 55.7558
    lon: number           // 37.6173
    timezone: string      // "Europe/Moscow"
  }
  settings: {
    system: 'sidereal' | 'tropical'
    ayanamsa: 'lahiri' | 'fagan_bradley' | 'krishnamurti'
    houseSystem: 'placidus' | 'whole_sign' | 'equal'
  }
  planets: Array<{
    id: PlanetId           // 'sun' | 'moon' | ...
    longitude: number      // 354.25 (абсолютные градусы)
    latitude: number       // -0.0001
    speed: number          // 1.0194 (градусы/день)
    sign: ZodiacSign       // 'pisces'
    degree: number         // 24
    minute: number         // 15
    second: number         // 3.6
    isRetrograde: boolean  // false
    house: number | null   // 5 (или null если время неизвестно)
  }>
  houses: Array<{          // null если время неизвестно
    number: number         // 1-12
    sign: ZodiacSign
    degree: number
  }> | null
  aspects: Array<{
    planet1: PlanetId
    planet2: PlanetId
    type: AspectType       // 'conjunction' | 'trine' | ...
    orb: number            // 2.34 (градуса)
    isApplying: boolean
  }>
  meta: {
    ephemerisVersion: string  // "swisseph_2.10"
    ayanamsaValue: number     // 24.18 (для sidereal)
    calculatedAt: string      // ISO datetime
  }
}
```

---

## Поток 2: Сохранение карты в БД

```
КЛИЕНТ                          СЕРВЕР                          БД
──────                          ──────                          ──

ChartResult (в памяти)
       │
       │ POST /api/chart/save
       │ {birth_data, positions, settings}
       │
       └──────────────────────→ 1. Auth: Clerk middleware
                                   → userId из JWT
                                
                                2. Валидация: Zod schema
                                   → проверка типов и ranges
                                
                                3. Шифрование birth data:
                                   encrypt(birth_date) → AES blob
                                   encrypt(birth_time) → AES blob
                                   encrypt(birth_location) → AES blob
                                   encrypt(lat) → AES blob
                                   encrypt(lon) → AES blob
                                
                                4. Transaction: ──────────────→ BEGIN
                                
                                   db.insert(natalCharts)        INSERT natal_chart
                                     .values({
                                       userId, encrypted_data,
                                       system, ayanamsa
                                     })
                                                                
                                   db.insert(chartPlanets)        INSERT chart_planet
                                     .values(planets[])           × 12 rows
                                
                                   db.insert(chartAspects)        INSERT chart_aspect
                                     .values(aspects[])           × ~15 rows
                                
                                   db.insert(chartHouses)         INSERT chart_house
                                     .values(houses[])            × 12 rows
                                                                
                                                                COMMIT
                                
                                5. Response:
                                   {id: "chart_xxx",
                          ←──────  status: "saved"}
```

---

## Поток 3: NASA/USGS Real-time данные (Фаза 2)

> **Перенесён из MVP.** Реализуется после валидации product-market fit.

```
NASA/USGS API              VERCEL CRON              REDIS                КЛИЕНТ
─────────────              ───────────              ─────                ──────

                     ┌──→ Каждые 5 минут:
                     │    (vercel.json cron)
                     │
NASA DONKI ──────────┤    GET https://api.nasa.gov/
  Solar Flares       │      DONKI/FLR?api_key=xxx
  CMEs               │    
  Geomagnetic Storms │    → Parse JSON
                     │    → Transform:
                     │      {type, class, time,     SET nasa:flares    GET /api/feed
                     │       peak, source}     ───→ TTL: 300s    ───→ 
                     │                                                 → JSON response
USGS Earthquake ─────┤    GET https://earthquake.      
  GeoJSON feed       │      usgs.gov/earthquakes/    SET usgs:quakes   ← Карточки
  Real-time          │      feed/v1.0/summary/       TTL: 300s           в ленте
                     │      all_day.geojson
                     │
                     │    → Parse GeoJSON
                     │    → Filter: magnitude > 3.0
                     │    → Transform:
                     │      {type, magnitude,
                     │       location, time, depth}
                     │
                     │    → Сохранить в Postgres ──→ INSERT data_feed_item
                     │      (для истории)              (для будущего: графики,
                     └                                  тренды, статистика)


Fallback при недоступности API:
─────────────────────────────
  Redis кэш жив 5 мин → клиент получает последние данные
  Redis пуст → Postgres: SELECT * FROM data_feed_item
                         ORDER BY event_time DESC LIMIT 20
  Postgres пуст → UI: "Данные обновятся при подключении"
```

---

## Поток 4: Контент (эссе)

```
ДО ЗАПУСКА (разовый процесс)
────────────────────────────

Claude API                    Верификация              Репозиторий
──────────                    ────────────              ───────────

System prompt:                
"Ты — сидерический           
 астролог..."                 
                              
Для каждой из 120             
комбинаций:                   
  sun-in-aries                
  sun-in-taurus               
  ...                         
  pluto-in-pisces             
                              
→ 300-500 слов ──────────→    LLM fact-check:         content/essays/en/
                              "Проверь                   sun-in-aries.mdx
                               соответствия 777"         sun-in-taurus.mdx
                                                         ...
                              → PASS / REVIEW_NEEDED
                                                      content/essays/es/
                              Ручная проверка:           (переводы)
                              Астролог-бета-тестер
                              → OK / Правки


В RUNTIME (при запросе страницы)
────────────────────────────────

Пользователь: /essays/sun-in-pisces

  1. Next.js ISR:
     ├── Первый запрос: SSR → HTML → кэш Vercel CDN (24ч)
     └── Следующие: отдаётся из CDN (< 50ms глобально)
  
  2. MDX → React:
     ├── Frontmatter: {planet, sign, correspondences_777}
     └── Body: Markdown → React components
  
```

---

## Поток 5: Аутентификация

```
КЛИЕНТ                 CLERK                  VERCEL               POSTGRES
──────                 ─────                  ──────               ────────

Google OAuth ────→     Clerk Auth             
                       ├── Verify Google
                       ├── Create/Find user
                       ├── Issue JWT
                       ├── Set session cookie
                       │
                       └── Webhook ──────→    POST /api/webhooks/
                                              clerk
                                              │
                                              ├── Verify signature
                                              ├── user.created?    INSERT user
                                              ├── user.updated?    UPDATE user
                                              └── user.deleted?    SOFT DELETE

На каждый запрос:
  Cookie (JWT) ──→     Clerk Middleware
                       (Next.js middleware.ts)
                       │
                       ├── Valid? → req.auth = {userId}
                       │           → продолжить
                       │
                       └── Invalid? → redirect /sign-in
```

---

## Поток 6: Подписка (Stripe)

```
КЛИЕНТ            СЕРВЕР              STRIPE             POSTGRES
──────            ──────              ──────             ────────

"Подписаться" ──→ POST /api/stripe/
                  checkout
                  │
                  └── stripe.checkout   
                      .sessions.create
                      ({price, email}) ──→ Create session
                                          │
                  ←── {checkout_url} ←─── │
                                          │
Redirect ─────────────────────────────→   Checkout page
Ввод карты                                (Stripe hosted)
                                          │
                                          │ Payment OK
                                          │
                  POST /api/webhooks/ ←── Webhook:
                  stripe                  checkout.session
                  │                       .completed
                  ├── Verify signature
                  │   (stripe.webhooks
                  │    .constructEvent)
                  ├── Get subscription_id
                  ├── Update user: ─────────────────────→ UPDATE user
                  │   is_premium = true                   SET is_premium=true
                  │   premium_tier = 'star'               premium_tier='star'
                  │   stripe_customer_id                   premium_expires_at
                  │   stripe_subscription_id
                  └── Send welcome email
                      (Resend)

                                          Каждый месяц:
                                          invoice.paid ──→ Обновить
                                                          premium_expires_at
                                          
                                          Отмена:
                                          subscription  ──→ UPDATE user
                                          .deleted          is_premium=false
```

### Stripe: технические детали

**npm:** `stripe` (серверный SDK)

**Env переменные (Vercel):**
- `STRIPE_SECRET_KEY` — серверны�� ключ
- `STRIPE_WEBHOOK_SECRET` — для верификации webhook подписей
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — клиентский ключ (для Checkout redirect)

**API Routes:**

| Route | Метод | Назначение |
|-------|-------|-----------|
| `/api/stripe/checkout` | POST | Создать Checkout Session → redirect на Stripe |
| `/api/stripe/portal` | POST | Создать Customer Portal Session (управление подпиской) |
| `/api/webhooks/stripe` | POST | Обработка Stripe webhooks |

**Webhook events для обработки:**

| Event | Действие |
|-------|----------|
| `checkout.session.completed` | Создать подписку: `is_premium=true`, сохранить `stripe_customer_id`, `stripe_subscription_id` |
| `invoice.paid` | Обновить `premium_expires_at` (продление) |
| `invoice.payment_failed` | Отправить email "Проблема с оплатой" (Resend) |
| `customer.subscription.deleted` | `is_premium=false`, `premium_tier=null` |
| `customer.subscription.updated` | Обновить `premium_tier` (если сменил план) |

**Безопасность:**
- Webhook подпись верифицируется через `stripe.webhooks.constructEvent(body, sig, secret)`
- Idempotency: проверяем `event.id` перед обработкой (дедупликация)
- Raw body для webhook (Next.js: `export const config = { api: { bodyParser: false } }`)

**MVP scope:** Только Star tier ($9.99/мес). Cosmos tier — Фаза 2. Годовая подписка — Фаза 2.

---

## Поток 6.5: MCP-сервер (AI как канал привлечения)

> **Zero CAC. Каждый AI-ассистент, подключённый к нашему серверу, продаёт за нас 24/7.**

```
ПОЛЬЗОВАТЕЛЬ            AI ASSISTANT             MCP SERVER (Estrevia)
────────────            ────────────             ────────────────────

"What's my real         Claude/ChatGPT
 zodiac sign?           │
 Born March 20,         ├── Discovers Estrevia
 1990, Moscow"          │   MCP server (Smithery)
                        │
                        ├── tool: calculate_chart
                        │   {date: "1990-03-20",
                        │    time: null,          POST /api/chart/calculate
                        │    city: "Moscow"}  ──→ │
                        │                         ├── sweph расчёт
                        │                         ├── sidereal + tropical
                        │   ←─────────────────── └── JSON response
                        │   {
                        │     tropical_sun: "Pisces 29°42'",
                        │     sidereal_sun: "Pisces 5°24'",
                        │     moon: "Cancer 12°18'",
                        │     link: "estrevia.app/s/abc123"
                        │   }
                        │
                        └── "Your sidereal Sun is
                             Pisces at 5°24'...
                             Full Cosmic Passport:
                             estrevia.app/s/abc123"
```

### MCP Tools

| Tool | Описание | API endpoint |
|------|----------|-------------|
| `calculate_chart` | Натальная карта по дате/времени/месту | `POST /api/chart/calculate` |
| `get_moon_phase` | Текущая фаза Луны + знак | `GET /api/moon/current` |
| `get_planetary_hours` | Планетарные часы для города | `GET /api/hours/[city]` |
| `compare_sidereal_tropical` | Сравнение двух систем для даты | `POST /api/chart/compare` |
| `get_correspondences_777` | Соответствия из 777 по знаку/планете | `GET /api/777/[sign]` |

### Технические детали

- **npm:** `@modelcontextprotocol/sdk` 
- **~200 строк кода** — обёртка над существующим API
- **Публикация:** Smithery, mcpt, OpenTools
- **Timing:** сразу после стабилизации API (неделя 6-7)
- **Rate limiting:** тот же Upstash, те же лимиты что и для web API
- **Source attribution:** каждый ответ включает `link: "estrevia.app/s/[id]"` — AI показывает ссылку пользователю

---

## Поток 7: Viral Share — «Космический паспорт»

> **Основной growth loop продукта.** Пользователь делает маркетинг за нас, потому что хвастается собой, а не Estrevia.

```
ПОЛЬЗОВАТЕЛЬ A                СЕРВЕР                      ПОЛЬЗОВАТЕЛЬ B
──────────────                ──────                      ──────────────

Рассчитал карту
  │
  ├── Видит: «Ваш настоящий
  │    знак — Рыбы, не Овен»
  │
  ├── Нажимает «Поделиться»
  │
  │    Web Share API (mobile)
  │    или «Скопировать ссылку»
  │                              
  └── Ссылка: estrevia.app/
       s/abc123
                                                          Открывает ссылку
                                                            │
                              GET /s/abc123 ◄───────────────┘
                              │
                              ├── OG meta tags:
                              │   og:title = "Kirill's real sign is ♓ Pisces"
                              │   og:image = /api/og/passport/abc123
                              │   og:description = "Not ♈ Aries..."
                              │
                              ├── GET /api/og/passport/abc123
                              │   → @vercel/og (Satori):
                              │     JSX → SVG → PNG (1200×630)
                              │     Кэш: CDN, immutable
                              │
                              └── HTML страница:
                                  ├── Карточка результата A
                                  ├── CTA: «Узнай свой    ──→  Вводит дату
                                  │    настоящий знак»          │
                                  └── Ввод даты прямо           ├── Расчёт
                                      на странице               ├── Свой результат
                                                                └── «Поделиться»
                                                                     │
                                                                     └── → LOOP
```

### Космический паспорт: технические детали

**OG Image API:** `GET /api/og/passport/[shareId]`

```
┌─────────────────────────────────────────────┐
│                                             │
│          ✦ ESTREVIA                         │
│                                             │
│     ♈ Aries        →        ♓ Pisces       │
│   (зачёркнут,              (яркий,         │
│    серый)                   в цвете стихии) │
│                                             │
│   ☉ Sun: Pisces  ☽ Moon: Cancer  ASC: Libra│
│                                             │
│   ♀ Ruling planet: Venus                    │
│   💧 Element: Water                         │
│   «1 of 8% with this combination»          │
│                                             │
│          estrevia.app — find yours          │
│                                             │
└─────────────────────────────────────────────┘

Размеры: 1200×630 (OG), 1080×1080 (Instagram), 1080×1920 (Stories)
Фон: #0A0A0F с subtle градиентом в цвет стихии (15% opacity)
```

**npm:** `@vercel/og` (Satori — JSX → SVG → PNG на Edge)

**Share button — компонент:**

```
Пользователь нажимает "Share"
  │
  ├── Mobile → navigator.share({
  │     title: "My Cosmic Passport",
  │     text: pre-filled text (EN),
  │     url: "estrevia.app/s/abc123"
  │   })
  │   → Система предлагает WhatsApp/Telegram/Instagram/etc.
  │
  ├── Desktop fallback:
  │   ├── "Copy link" (всегда)
  │   ├── Twitter/X: https://twitter.com/intent/tweet?text=...&url=...
  │   └── Telegram: https://t.me/share/url?url=...&text=...
  │
  └── "Download PNG" → для Instagram Stories / ручного шеринга
```

**Pre-filled текст (EN):**

```
"Turns out I'm not ♈ Aries — my real sidereal sign is ♓ Pisces.
 ☉ Pisces ☽ Cancer ↑ Libra
 Find yours → estrevia.app/s/abc123"
```

**Модель данных:**

| Поле | Тип | Описание |
|------|-----|----------|
| share_id | String (nanoid, 8 char) | PK, короткий ID для URL |
| tropical_sign | Enum | Тропический знак Солнца |
| sidereal_sign | Enum | Сидерический знак Солнца |
| moon_sign | Enum? | Знак Луны |
| asc_sign | Enum? | Восходящий знак (null если время не указано) |
| ruling_planet | Enum | Управляющая планета |
| element | Enum | fire / water / earth / air |
| rarity_pct | Float | Процент людей с такой комбинацией |
| display_name | String? | Имя (опционально, для персонализации) |
| created_at | DateTime | — |
| view_count | Int | Счётчик просмотров |

**Не хранится:** дата рождения, время, место — это PII. Карточка содержит только результат.

**Кэширование:** OG image генерируется один раз → кэшируется на Vercel CDN навсегда (immutable). При 10K шеров = 10K PNG, каждый ~50KB = ~500MB CDN. Входит в Vercel Pro.

**Аналитика (PostHog):**

| Event | Когда |
|-------|-------|
| `passport_created` | Пользователь нажал «Поделиться» |
| `passport_viewed` | Кто-то открыл /s/[id] |
| `passport_converted` | Посетитель /s/[id] ввёл свою дату |
| `passport_reshared` | Посетитель /s/[id] создал свою карточку |

**Viral coefficient** = `passport_converted` / `passport_viewed` × reshare rate. Цель: > 1.0.

### Фаза 2: дополнительные shareable артефакты

| Артефакт | Триггер | Частота | Описание |
|----------|---------|---------|----------|
| **Лунные карточки** | Новолуние / полнолуние | 2× в месяц | Персонализированная карточка: "Полнолуние в Скорпионе — что это значит для ♓ Рыб?" Push-уведомление + share card. Требует сохранённой карты пользователя |
| **Birthday Wrapped** | День рождения пользователя | 1× в год | Серия из 5-7 карточек (как Spotify Wrapped): ключевые транзиты года, управляющие влияния, персональная статистика. Требует транзитов + накопленных данных |

---

## Сводная схема: все потоки вместе

```
                        ┌─────────────┐
                        │ ПОЛЬЗОВАТЕЛЬ│
                        └──────┬──────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │             │
                 ▼             ▼             ▼
          ┌──────────┐  ┌──────────┐  ┌──────────┐
          │ Расчёты  │  │ Контент  │  │ Действия │
          │ (API)    │  │ (CDN)    │  │ (API)    │
          │          │  │          │  │          │
          │ Карта    │  │ Эссе     │  │ Сохранить│
          │ Луна     │  │ (ISR)    │  │ Войти    │
          │ Часы     │  │          │  │ Платить  │
          │ Toggle   │  │ CDN кэш  │  │ Passport │
          │          │  │          │  │          │
          │ Online   │  │ Кэш ✓   │  │ Online   │
          └─────┬────┘  └──────────┘  └─────┬────┘
                │                           │
                └───────────┬───────────────┘
                    ┌───────┼───────┐
                    ▼       ▼       ▼
              ┌────────┐ ┌─────┐ ┌──────┐
              │Postgres│ │Redis│ │Stripe│
              │        │ │     │ │Clerk │
              │Users   │ │Cache│ │Resend│
              │Charts  │ │NASA │ │      │
              │Feed    │ │Rate │ │      │
              └────────┘ └─────┘ └──────┘
```
