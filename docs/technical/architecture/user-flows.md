# Пользовательские флоу: что происходит при каждом действии

> Для каждого действия: что видит пользователь → что происходит технически → какие данные нужны.

---

## Флоу 1: Расчёт натальной карты (гость)

**Триггер:** пользователь вводит дату рождения на Landing page

```
ПОЛЬЗОВАТЕЛЬ                     БРАУЗЕР                         СЕРВЕР
─────────────                    ────────                        ──────
Вводит:                          
  дата: 1990-03-15               
  время: 14:30 (опционально)     
  город: "Moscow"                
                                 
Нажимает "Рассчитать"       ──→  1. Geocoding города:
                                    "Moscow" → {lat: 55.75, lon: 37.62}
                                    Используем browser API или
                                    кэшированный список городов
                                 
                                 2. Timezone resolution:
                                    {lat, lon, date} → "Europe/Moscow"
                                    Библиотека timezone-lookup (клиент)
                                 
                                 3. Swiss Ephemeris WASM:
                                    {julian_day, lat, lon, ayanamsa}
                                    → позиции 12 тел (< 50ms)
                                 
                                 4. Рендеринг SVG колеса:
                                    позиции → знаки → дома → аспекты
                                    → SVG на Canvas

Видит натальную карту        ←── 5. UI обновляется:
  ├── Колесо с планетами            ├── Колесо (SVG)
  ├── Таблица позиций               ├── Таблица (React)
  ├── "Ваш знак Солнца:             ├── Highlight message
  │    Рыбы (сидерич.)"             └── Toggle tropical
  └── Toggle: Тропическая?
                                 
Нажимает Toggle              ──→  6. Пересчёт с другой ayanamsa
                                    (0ms — только offset,
                                     не новый расчёт)

Видит обе системы            ←── 7. Side-by-side или анимация
```

### Какие данные нужны

| Данные | Источник | Размер | Кэш |
|--------|---------|--------|-----|
| Swiss Ephemeris WASM | CDN → Service Worker | ~2MB | При установке PWA |
| Список городов (autocomplete) | Статичный JSON | ~500KB | Service Worker |
| Timezone данные | npm: timezone-lookup | ~100KB | Bundle |
| Ayanamsa offsets | Hardcoded constants | ~1KB | Bundle |

### Что НЕ уходит на сервер

- Дата рождения
- Время рождения
- Место рождения
- Результат расчёта

**Всё остаётся на устройстве** до момента, когда пользователь нажмёт «Сохранить».

---

## Флоу 2: Сохранение карты (регистрация)

**Триггер:** пользователь нажимает «Сохранить карту»

```
ПОЛЬЗОВАТЕЛЬ                     БРАУЗЕР                         СЕРВЕР
─────────────                    ────────                        ──────
Нажимает "Сохранить"         ──→ 1. Проверка: авторизован?
                                    Нет → показать Clerk modal

Видит форму входа            ←── 2. Clerk <SignUp /> компонент
  ├── Google OAuth                  ├── Google OAuth redirect
  ├── Email + magic link            ├── Clerk API
  └── Email + пароль                └── Clerk API

Авторизуется                 ──→ 3. Clerk webhook → сервер   ──→ Clerk → Vercel:
                                                                  POST /api/webhooks/clerk
                                                                  {type: "user.created",
                                                                   data: {id, email, name}}
                                                              
                                                              4. Создание User в БД:
                                                                  prisma.user.create({
                                                                    clerk_id, email(encrypted),
                                                                    display_name
                                                                  })

                                 5. Отправка карты:          ──→ POST /api/chart/save
                                    {birth_data(encrypted),       {birth_date, birth_time,
                                     positions, system,            birth_location, positions,
                                     ayanamsa}                     system, ayanamsa}
                                                              
                                                              6. Сохранение:
                                                                  encrypt(birth_data) →
                                                                  prisma.natalChart.create()
                                                                  prisma.chartPlanet.createMany()
                                                                  prisma.chartAspect.createMany()
                                                                  prisma.chartHouse.createMany()

Видит "Карта сохранена ✓"    ←── 7. Response: {chartId}

                                 8. PostHog event:
                                    track('chart_saved', {system, has_time})
```

---

## Флоу 3: Чтение эссе по позиции

**Триггер:** пользователь нажимает на планету в колесе или выбирает эссе из списка

```
ПОЛЬЗОВАТЕЛЬ                     БРАУЗЕР                         СЕРВЕР
─────────────                    ────────                        ──────
Нажимает на Солнце           ──→ 1. Router: /essays/sun-in-pisces
  в колесе карты
                                 2. Проверка: Free или Premium?
                                    Солнце/Луна/Восходящий = Free
                                    Остальные 9 = Premium

[Если Free]                  ←── 3. Next.js загружает MDX:
Видит эссе:                         /content/essays/en/sun-in-pisces.mdx
  "Солнце в сидерических           SSR: уже отрендерен на сервере
   Рыбах..."                       (ISR: кэш 24 часа)

                                 4. PostHog: track('essay_read',
                                    {planet: 'sun', sign: 'pisces'})

[Если Premium-only            ←── 5. Показать превью (первый абзац)
 и юзер не Premium]                  + CTA "Раскрыть полный текст"
                                     + Pricing modal (Star $9.99/мес)
```

### Какие данные нужны

| Данные | Источник | Размер |
|--------|---------|--------|
| Текст эссе (MDX → HTML) | ISR (Vercel CDN) | ~3KB/эссе |
| 777 соответствия | JSON в MDX frontmatter | ~200B |
| Метаданные (planet, sign) | URL slug parsing | — |
| Premium статус | Clerk session → User DB | — |

---

## Флоу 4: Лунный календарь

**Триггер:** пользователь открывает вкладку «Луна»

```
ПОЛЬЗОВАТЕЛЬ                     БРАУЗЕР                         СЕРВЕР
─────────────                    ────────                        ──────
Открывает /moon              ──→ 1. Swiss Ephemeris WASM:
                                    Текущая дата → позиция Луны
                                    → знак, градус, фаза
                                    (расчёт на клиенте, < 10ms)

                                 2. Генерация 30 дней:
                                    Для каждого дня месяца:
                                    → позиция Луны, фаза, знак
                                    (30 расчётов × 10ms = 300ms)

Видит:                       ←── 3. Рендеринг:
  ├── Сегодня: Луна в              ├── Текущая фаза (SVG)
  │   Скорпионе, ◐ 67%            ├── Календарная сетка
  ├── Календарь на месяц           ├── Каждый день: иконка фазы
  │   с фазами                     └── Тап на день → детали
  └── "Новолуние через 5 дн"

Тап на конкретный день       ──→ 4. Detail view:
                                    ├── Фаза, знак, градус
                                    ├── Восход/заход Луны
                                    └── Краткое описание
                                        (из кэшированного MDX)
```

**Ключ:** весь лунный календарь рассчитывается на клиенте. Сервер не участвует. Работает офлайн.

---

## Флоу 5: Планетарные часы (Real-time)

**Триггер:** пользователь открывает вкладку «Часы»

```
ПОЛЬЗОВАТЕЛЬ                     БРАУЗЕР                         СЕРВЕР
─────────────                    ────────                        ──────
Открывает /hours             ──→ 1. Геолокация пользователя:
                                    navigator.geolocation
                                    → {lat, lon} (или вручную)

                                 2. Swiss Ephemeris WASM:
                                    sunrise(today, lat, lon)
                                    sunset(today, lat, lon)
                                    → длительность дня/ночи

                                 3. Расчёт планетарных часов:
                                    День делится на 12 часов
                                    (неравных! зависят от
                                     длительности дня)
                                    Каждый час = планета-управитель
                                    Сб=Saturn, Вс=Sun, Пн=Moon...

Видит:                       ←── 4. Рендеринг:
  ├── Кольцевая диаграмма          ├── SVG кольцо (12 секторов)
  │   с 12 часами дня              ├── Текущий час подсвечен
  ├── "Сейчас: Час Юпитера"        ├── Стрелка real-time
  ├── Следующий: Час Марса          ├── Обратный отсчёт
  │   через 47 мин                 └── Ночные часы = другое кольцо
  └── Ночные часы (свёрнуты)

                                 5. setInterval(60_000):
                                    Обновление каждую минуту
                                    (пересчёт не нужен —
                                     только сдвиг стрелки)
```

**Ключ:** никакого сервера. Всё на клиенте. Офлайн.

---

## Флоу 6: Лента NASA/USGS данных

**Триггер:** пользователь открывает вкладку «Данные»

```
ПОЛЬЗОВАТЕЛЬ                     БРАУЗЕР                         СЕРВЕР
─────────────                    ────────                        ──────
Открывает /feed              ──→                             ──→ GET /api/feed
                                                                  │
                                                                  ├─ Redis: есть кэш?
                                                                  │   Да → вернуть из кэша
                                                                  │   Нет → fetch NASA + USGS
                                                                  │
                                                                  └─ Response:
                                                                     [{type: 'solar_flare',
                                                                       class: 'M2.5',
                                                                       time: '2026-04-04T12:30Z'},
                                                                      {type: 'earthquake',
                                                                       magnitude: 5.2,
                                                                       location: 'Japan'},
                                                                      ...]

Видит ленту событий:         ←── Рендеринг карточек:
  ├── 🌞 M2.5 Solar Flare          Каждое событие = карточка
  │   12:30 UTC today               с иконкой, временем, деталями
  ├── 🌍 5.2 Earthquake            
  │   Japan, 08:15 UTC             
  ├── 🌞 C3.1 Solar Flare         
  │   Yesterday, 23:45 UTC        
  └── [Показать ещё]              

                                    ┌──────────────────────────┐
                                    │ Фоновый процесс (Cron):  │
                                    │                          │
                                    │ Каждые 5 мин:            │
                                    │  1. Fetch NASA DONKI API │
                                    │  2. Fetch USGS API       │
                                    │  3. Parse + transform    │
                                    │  4. Сохранить в Redis    │
                                    │     (TTL: 5 min)         │
                                    │  5. Сохранить в Postgres │
                                    │     (для истории)        │
                                    └──────────────────────────┘
```

---

## Флоу 7: Подписка на Premium

**Триггер:** пользователь нажимает «Подписаться» на Star ($9.99/мес)

```
ПОЛЬЗОВАТЕЛЬ                     БРАУЗЕР                         СЕРВЕР
─────────────                    ────────                        ──────
Нажимает "Star $9.99"       ──→                              ──→ POST /api/stripe/checkout
                                                                  {tier: 'star',
                                                                   period: 'monthly'}
                                                              
                                                              1. Stripe API:
                                                                  stripe.checkout.sessions
                                                                    .create({
                                                                      mode: 'subscription',
                                                                      price: 'price_star_monthly',
                                                                      customer_email: user.email
                                                                    })
                                                              
                                                              2. Response:
                                                                  {url: 'https://checkout.
                                                                        stripe.com/...'}

Redirect на Stripe           ←── window.location = checkout_url

Вводит карту на Stripe       ──→ (Stripe handles)

Redirect обратно             ←── /settings?success=true

                                                              3. Stripe Webhook:
                                                                  POST /api/webhooks/stripe
                                                                  {type: 'checkout.session
                                                                         .completed',
                                                                   subscription: 'sub_xxx'}
                                                              
                                                              4. Обновление User:
                                                                  prisma.user.update({
                                                                    is_premium: true,
                                                                    premium_tier: 'star',
                                                                    premium_expires_at: ...
                                                                  })

Видит: "Подписка активна ✓"  ←── 5. UI обновляется:
  Все 120 эссе разблокированы       Clerk session refresh
  Confetti анимация 🎉             → is_premium = true
```

---

## Флоу 8: Share Card (генерация PNG)

**Триггер:** пользователь нажимает «Поделиться»

```
ПОЛЬЗОВАТЕЛЬ                     БРАУЗЕР                         СЕРВЕР
─────────────                    ────────                        ──────
Нажимает "Поделиться"        ──→                              ──→ GET /api/og/chart?
                                                                   sun=pisces&moon=cancer
                                                                   &asc=libra&system=sidereal
                                                              
                                                              1. next/og (ImageResponse):
                                                                  Генерация PNG 1200x630:
                                                                  ┌────────────────────┐
                                                                  │ ☀ Sun in Pisces    │
                                                                  │ ☽ Moon in Cancer   │
                                                                  │ ↑ Asc: Libra       │
                                                                  │                    │
                                                                  │ ESTREVIA           │
                                                                  │ Sidereal Chart     │
                                                                  └────────────────────┘

Видит превью:                ←── 2. <img src="/api/og/chart?...">
  ├── Скопировать ссылку          
  ├── Скачать PNG                 3. Share API (если поддерж.):
  └── Поделиться в...                navigator.share({
                                       title, url, files: [png]
                                     })
```

---

## Сводка: что где живёт

```
┌──────────────────────────────────────────────────────┐
│                    КЛИЕНТ (браузер)                   │
│                                                      │
│  Расчёт карты ✓     Лунный календарь ✓               │
│  План. часы ✓        Sidereal/Tropical toggle ✓      │
│  Чтение эссе ✓       Офлайн режим ✓                  │
│  Аналитика (PostHog JS) ✓                            │
│                                                      │
│  = Всё что не требует авторизации или внешних данных │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                    СЕРВЕР (Vercel)                    │
│                                                      │
│  Регистрация/логин    Сохранение карты               │
│  NASA/USGS polling    Stripe подписки                │
│  OG Image генерация   Waitlist emails                │
│  Webhooks (Clerk, Stripe)                            │
│                                                      │
│  = Всё что требует авторизации, БД, или секретов     │
└──────────────────────────────────────────────────────┘
```
