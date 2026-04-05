# Технологический стек и инфраструктура

## Основной стек

| Слой | Технология | Версия | Почему |
|------|-----------|--------|--------|
| **Frontend** | Next.js (App Router) | 16+ | SSR, ISR, API routes, единый фреймворк |
| **Язык** | TypeScript | 5.x | Типобезопасность, один язык на всём стеке |
| **Стили** | Tailwind CSS | 4.x | Utility-first, тёмная тема, быстрый UI |
| **UI компоненты** | shadcn/ui | latest | Не библиотека — копируемые компоненты, полный контроль |
| **Астро-движок** | Swiss Ephemeris (`sweph`, Node.js native) | 2.10+ | Золотой стандарт эфемерид, ±0.01° точность, серверный расчёт |
| **БД** | PostgreSQL | 16+ | Надёжность, JSON-поля, геоданные |
| **ORM** | Drizzle ORM | latest | Type-safe, 7KB bundle (vs Prisma 1.6MB), быстрый cold start на serverless |
| **Кэш** | Redis (Upstash) | — | Кэш эфемерид, rate limiting, сессии |
| **Auth** | Clerk | — | OAuth, magic links, управление пользователями, Vercel Marketplace |
| **AI (текст)** | Claude API | Sonnet/Haiku | Генерация контента, перевод, интерпретации |
| **AI (изображения)** | Stability AI | — | Генерация аватаров, таро иллюстрации |
| **Аналитика** | PostHog (**Cloud EU**) | — | Open-source, GDPR compliant (EU data residency), $0 до 1M events |
| **Email** | Resend | — | Transactional emails, waitlist nurture |
| **Хостинг frontend** | Vercel | — | Edge, ISR, preview deployments, zero-config |
| **Хостинг backend** | Vercel Functions (Fluid Compute) | — | Один провайдер, серверные функции с полным Node.js |
| **Хранилище файлов** | Vercel Blob | — | Фото, текстуры, медиа (public + private) |
| **DNS/Домены** | Cloudflare | — | Быстрый DNS, DDoS protection, дешёвые домены |

> **3D Engine (Phase 2):** Three.js + React Three Fiber — 3D-визуализация планет и созвездий. Не входит в MVP.

---

## Внешние API для real-time данных

| Данные | API Источник | Стоимость | Частота обновления |
|--------|-------------|-----------|-------------------|
| Эфемериды планет | Swiss Ephemeris (`sweph` Node.js) | Бесплатно (AGPL) | Расчёт на сервере (API) |
| Солнечные вспышки | NASA DONKI API | Бесплатно | Каждые 5 мин |
| Землетрясения | USGS Earthquake API | Бесплатно | Real-time (GeoJSON) |
| Погода планет | NASA Horizons | Бесплатно | Ежедневно |
| Погода Земли | OpenWeather API | Free tier / $40/мес | Каждые 15 мин |
| Текстуры планет | NASA Solar System Textures | Бесплатно (PD) | Статичные |
| Звуки планет | NASA Space Sounds | Бесплатно (PD) | Статичные |
| Астрономические события | NASA Eyes | Бесплатно | Ежедневно |

### Стратегия работы с API

- **Cron jobs** (Vercel Cron): NASA DONKI и USGS опрашиваются каждые 5 минут. Результаты кэшируются в Redis.
- **Fallback:** если API недоступен, показываем последние кэшированные данные + индикатор «обновится при подключении».
- **Rate limits:** NASA API — 1000 req/час. USGS — без лимита. OpenWeather — 60 req/мин (free tier).

---

## Инфраструктура

### Среды

| Среда | URL | Назначение |
|-------|-----|-----------|
| Production | estrevia.app | Основной продакшн |
| Preview | *.vercel.app | Превью для каждого PR |
| Development | localhost:3000 | Локальная разработка |

### Сервисы по провайдерам

```
Vercel (единая платформа)
├── Frontend (Next.js, SSR, ISR)
├── API Routes (Fluid Compute, Node.js)
├── Cron Jobs (NASA/USGS polling)
├── Blob Storage (медиа, текстуры)
└── Edge Config (feature flags)

Vercel Marketplace
├── Neon PostgreSQL (основная БД)
├── Upstash Redis (кэш, rate limiting)
└── Clerk (аутентификация)

Внешние
├── Claude API (генерация контента)
├── Stability AI (генерация изображений)
├── PostHog Cloud (аналитика)
├── Resend (email)
├── Cloudflare (DNS, DDoS)
└── NASA/USGS/NOAA (данные)
```

### Стоимость инфраструктуры (прогноз)

| Сервис | MVP (0-1K юзеров) | Scale (10K юзеров) | Комментарий |
|--------|-------------------|-------------------|-------------|
| Vercel Pro | $20/мес | $20/мес | Включает Functions, Blob, 1TB bandwidth. Расчёт на сервере (sweph native) — клиент получает только результат, первый load ~300KB — хватит до 100K+ пользователей |
| Neon PostgreSQL | $0 (free tier) | $19/мес | 0.5GB → 10GB |
| Upstash Redis | $0 (free tier) | $10/мес | 10K cmd/day (free) → 100K. **Важно:** при ~100+ DAU free tier кончится — перейти на Pay-as-you-go ($0.2/100K cmd) |
| Clerk | $0 (free tier) | $25/мес | До 10K MAU бесплатно |
| PostHog | $0 | $0 | До 1M events бесплатно |
| Claude API | ~$3/мес | ~$20/мес | Haiku для daily, Sonnet для генерации |
| Resend | $0 (free tier) | $20/мес | 3K emails/мес → 50K |
| OpenWeather | $0 (free tier) | $0 | 60 req/мин достаточно |
| **Итого** | **~$25/мес** | **~$115/мес** | |

---

## Ключевые npm-пакеты (MVP)

```
# Framework
next
react
react-dom
typescript

# Стили и UI
tailwindcss
@tailwindcss/postcss
shadcn/ui (via CLI)
lucide-react              # Иконки
framer-motion             # Анимации

# Астро-движок
sweph                     # Swiss Ephemeris (Node.js native binding)

# База данных
drizzle-orm
drizzle-kit

# Auth
@clerk/nextjs

# AI
@anthropic-ai/sdk         # Claude API
ai                        # Vercel AI SDK

# Аналитика
posthog-js
posthog-node

# Email
resend

# MCP
@modelcontextprotocol/sdk # MCP server SDK (обёртка над API для AI-ассистентов)

# Платежи
stripe                    # Stripe SDK (серверный)

# Утилиты
date-fns                  # Работа с датами
date-fns-tz               # Timezone-aware операции с датами
@vvo/tzdb                 # Полная IANA tz database (исторические DST/offset)
zod                       # Валидация схем
```

---

## Решения, которые стоит пересмотреть позже

| Решение | Когда пересмотреть | Альтернативы |
|---------|-------------------|-------------|
| Монолит Next.js | При 50K+ DAU | Выделение Astro Engine в отдельный сервис |
| Vercel Blob | При 100GB+ медиа | S3 + CloudFront |
| Clerk Auth | При кастомных auth flows | Auth.js, custom JWT |
| PostHog Cloud | При 1M+ events/мес | Self-hosted PostHog |
