# Потоки данных: как информация перемещается

> Откуда берутся данные, как трансформируются, где хранятся, куда уходят.

---

## Поток 1: Натальная карта (core)

```
ВВОД                    ОБРАБОТКА                   ВЫВОД
─────                   ─────────                   ─────

Пользователь:           ┌─ КЛИЕНТ ─────────────┐   Экран:
                        │                       │
 date: 1990-03-15  ───→ │ 1. Geocode город      │ ──→  SVG Колесо
 time: 14:30       ───→ │    "Moscow" → lat/lon  │      с планетами
 city: "Moscow"    ───→ │                       │
                        │ 2. Timezone lookup     │ ──→  Таблица позиций:
                        │    → Europe/Moscow     │      ☉ Солнце 24°15' ♓
                        │                       │      ☽ Луна 8°42' ♋
                        │ 3. Julian Day calc     │      ...
                        │    → 2448264.1042     │
                        │                       │ ──→  "Ваш знак: Рыбы
                        │ 4. Swiss Ephemeris     │       (не Овен!)"
                        │    WASM расчёт:        │
                        │    ┌───────────────┐   │
                        │    │ Для каждого из │   │
                        │    │ 12 тел:        │   │
                        │    │  - ecliptic lon│   │
                        │    │  - ecliptic lat│   │
                        │    │  - distance    │   │
                        │    │  - speed       │   │
                        │    └───────────────┘   │
                        │                       │
                        │ 5. Ayanamsa offset     │
                        │    (если sidereal):    │
                        │    tropical_pos −       │
                        │    24.18° (Lahiri 2026)│
                        │                       │
                        │ 6. Знак = floor(pos/30)│
                        │    Градус = pos mod 30 │
                        │                       │
                        │ 7. Дома (если время    │
                        │    известно):          │
                        │    Placidus cusps      │
                        │                       │
                        │ 8. Аспекты:            │
                        │    Для каждой пары     │
                        │    планет: diff = |a-b|│
                        │    conjunction: < 8°    │
                        │    opposition: 180±8°   │
                        │    trine: 120±8°        │
                        │    square: 90±7°        │
                        │    sextile: 60±6°       │
                        └───────────────────────┘

              Ничего не уходит на сервер.
              Всё в памяти браузера.
              Работает офлайн.
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
                                
                                   prisma.natalChart.create({   INSERT natal_chart
                                     userId, encrypted_data,
                                     system, ayanamsa
                                   })
                                                                
                                   prisma.chartPlanet           INSERT chart_planet
                                     .createMany({               × 12 rows
                                       chartId, planets[]
                                     })
                                
                                   prisma.chartAspect            INSERT chart_aspect
                                     .createMany({               × ~15 rows
                                       chartId, aspects[]
                                     })
                                
                                   prisma.chartHouse             INSERT chart_house
                                     .createMany({               × 12 rows
                                       chartId, houses[]
                                     })
                                                                
                                                                COMMIT
                                
                                5. Response:
                                   {id: "chart_xxx",
                          ←──────  status: "saved"}
```

---

## Поток 3: NASA/USGS Real-time данные

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
  
  3. Service Worker:
     └── Кэш при первом прочтении → офлайн доступ
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
          │ (WASM)   │  │ (CDN)    │  │ (API)    │
          │          │  │          │  │          │
          │ Карта    │  │ Эссе     │  │ Сохранить│
          │ Луна     │  │ (ISR)    │  │ Войти    │
          │ Часы     │  │          │  │ Платить  │
          │ Toggle   │  │ Офлайн:  │  │ Share    │
          │          │  │ SW кэш   │  │          │
          │ Офлайн ✓ │  │ Офлайн ✓ │  │ Online ✗ │
          └──────────┘  └──────────┘  └─────┬────┘
                                            │
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
