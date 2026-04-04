# Технологический стек и инфраструктура

## Основной стек

| Слой | Технология | Версия | Почему |
|------|-----------|--------|--------|
| **Frontend** | Next.js (App Router) | 15+ | SSR, ISR, API routes, единый фреймворк |
| **Язык** | TypeScript | 5.x | Типобезопасность, один язык на всём стеке |
| **Стили** | Tailwind CSS | 4.x | Utility-first, тёмная тема, быстрый UI |
| **UI компоненты** | shadcn/ui | latest | Не библиотека — копируемые компоненты, полный контроль |
| **3D Engine** | Three.js + React Three Fiber | — | Бесплатно, NASA текстуры, большое сообщество |
| **Астро-движок** | Swiss Ephemeris (WASM) | 2.10+ | Золотой стандарт эфемерид, ±0.01° точность |
| **БД** | PostgreSQL | 16+ | Надёжность, JSON-поля, геоданные, Prisma ORM |
| **ORM** | Prisma | 6.x | Типобезопасные запросы, миграции, хорошая интеграция с Next.js |
| **Кэш** | Redis (Upstash) | — | Кэш эфемерид, rate limiting, сессии |
| **Auth** | Clerk | — | OAuth, magic links, управление пользователями, Vercel Marketplace |
| **AI (текст)** | Claude API | Sonnet/Haiku | Генерация контента, перевод, интерпретации |
| **AI (изображения)** | Stability AI | — | Генерация аватаров, таро иллюстрации |
| **Аналитика** | PostHog | — | Open-source, GDPR compliant, $0 до 1M events |
| **Email** | Resend | — | Transactional emails, waitlist nurture |
| **Хостинг frontend** | Vercel | — | Edge, ISR, preview deployments, zero-config |
| **Хостинг backend** | Vercel Functions (Fluid Compute) | — | Один провайдер, серверные функции с полным Node.js |
| **Хранилище файлов** | Vercel Blob | — | Фото, текстуры, медиа (public + private) |
| **DNS/Домены** | Cloudflare | — | Быстрый DNS, DDoS protection, дешёвые домены |

---

## Внешние API для real-time данных

| Данные | API Источник | Стоимость | Частота обновления |
|--------|-------------|-----------|-------------------|
| Эфемериды планет | Swiss Ephemeris (swisseph WASM) | Бесплатно (GPL) | Расчёт на клиенте |
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
| Vercel Pro | $20/мес | $20/мес | Включает Functions, Blob |
| Neon PostgreSQL | $0 (free tier) | $19/мес | 0.5GB → 10GB |
| Upstash Redis | $0 (free tier) | $10/мес | 10K commands/day → 100K |
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
swisseph                  # Swiss Ephemeris (WASM binding)

# База данных
prisma
@prisma/client

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

# Утилиты
date-fns                  # Работа с датами
zod                       # Валидация схем
```

---

## Решения, которые стоит пересмотреть позже

| Решение | Когда пересмотреть | Альтернативы |
|---------|-------------------|-------------|
| Монолит Next.js | При 50K+ DAU | Выделение Astro Engine в отдельный сервис |
| Vercel Blob | При 100GB+ медиа | S3 + CloudFront |
| Neon PostgreSQL | При сложных запросах real-time | Supabase, PlanetScale |
| Clerk Auth | При кастомных auth flows | Auth.js, custom JWT |
| PostHog Cloud | При 1M+ events/мес | Self-hosted PostHog |
