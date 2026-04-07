# Модель данных

> Этот документ описывает основные сущности, их связи и стратегию хранения.

---

## Обзор сущностей (MVP)

```
┌──────────┐     1:N     ┌──────────────┐
│   User   │────────────▶│  NatalChart  │
└──────────┘             └──────────────┘
     │                         │
     │ 1:N                     │ 1:N
     ▼                         ▼
┌──────────┐             ┌──────────────┐
│  Session │             │  ChartPlanet │
└──────────┘             └──────────────┘
     
┌──────────────┐         ┌──────────────┐
│  Essay       │         │  DataFeedItem│
└──────────────┘         └──────────────┘

┌──────────────┐
│  WaitlistEntry│
└──────────────┘
```

---

## Таблицы

### User

Управляется Clerk. В нашей БД — минимальная проекция.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK, совпадает с Clerk user ID |
| clerk_id | String | Clerk external ID |
| email | String (encrypted) | Email (AES-256) |
| display_name | String | Отображаемое имя |
| preferred_system | Enum | 'sidereal' / 'tropical' |
| preferred_ayanamsa | Enum | 'lahiri' (MVP). Фаза 2: 'fagan_bradley' / 'krishnamurti' |
| preferred_language | Enum | 'en' (MVP). Фаза 2: 'es' |
| detail_level | Enum | 'beginner' / 'intermediate' / 'expert' |
| timezone | String | IANA timezone |
| is_premium | Boolean | Активная подписка |
| premium_tier | Enum? | 'star' / 'cosmos' / null |
| premium_expires_at | DateTime? | Дата окончания подписки |
| stripe_customer_id | String? | Stripe Customer ID |
| stripe_subscription_id | String? | Stripe Subscription ID |
| created_at | DateTime | — |
| updated_at | DateTime | — |
| deleted_at | DateTime? | Soft delete (GDPR) |

### NatalChart

**Чувствительные данные:** birth_date, birth_time, birth_location — шифруются AES-256 at rest.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| user_id | UUID? | FK → User (null = гостевой или temp расчёт) |
| status | Enum | 'temp' / 'saved' — temp создаётся при расчёте, saved при явном сохранении |
| label | String | «Моя карта», «Мама», и т.д. (default: 'My Chart') |
| birth_date | String (encrypted) | Дата рождения |
| birth_time | String? (encrypted) | Время рождения (может быть неизвестно) |
| birth_time_known | Boolean | Известно ли время |
| birth_location | String (encrypted) | Город / координаты |
| birth_lat | String (encrypted) | Широта (Float → encrypt → String в БД) |
| birth_lon | String (encrypted) | Долгота (Float → encrypt → String в БД) |
| timezone_at_birth | String | IANA timezone на момент рождения |
| system | Enum | 'sidereal' / 'tropical' |
| ayanamsa | Enum? | 'lahiri' / 'fagan_bradley' / 'krishnamurti' |
| house_system | Enum | 'placidus' / 'whole_sign' / 'equal' |
| is_primary | Boolean | Основная карта пользователя |
| calculated_at | DateTime | Когда рассчитана |
| ephemeris_version | String | 'swisseph_2.10' |
| created_at | DateTime | — |

### ChartPlanet

Кэш рассчитанных позиций. Позволяет не пересчитывать каждый раз.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| chart_id | UUID | FK → NatalChart |
| planet | Enum | sun / moon / mercury / venus / mars / jupiter / saturn / uranus / neptune / pluto / north_node / chiron |
| sign | Enum | aries / taurus / ... / pisces |
| degree | Float | Градусы в знаке (0-30) |
| absolute_degree | Float | Абсолютные градусы (0-360) |
| minute | Int | Минуты дуги |
| second | Float | Секунды дуги |
| is_retrograde | Boolean | Ретроградность |
| house | Int? | Дом (1-12), null если время неизвестно |
| speed | Float | Скорость движения (градусы/день) |

### ChartAspect

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| chart_id | UUID | FK → NatalChart |
| planet1 | Enum | Первая планета |
| planet2 | Enum | Вторая планета |
| aspect_type | Enum | conjunction / opposition / trine / square / sextile / ... |
| orb | Float | Орбис в градусах |
| is_applying | Boolean | Сходящийся или расходящийся |

### ChartHouse

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| chart_id | UUID | FK → NatalChart |
| house_number | Int | 1-12 |
| sign | Enum | Знак на куспиде |
| degree | Float | Градус куспида |

### Essay (контент, MDX файлы)

120 эссе на MVP: 10 планет (Sun–Pluto) × 12 знаков. North Node и Chiron — Фаза 2.

Не в БД — хранится как MDX в репозитории. Frontmatter:

```yaml
---
planet: sun
sign: aries
system: sidereal
title: "Sun in Sidereal Aries"
# title_es: "Sol en Aries Sideral"  — Фаза 2 (i18n)
description: "The sidereal Sun in Aries..."
correspondences_777: "Emperor (IV), Heh, Aries"
last_verified: "2026-04-15"
verified_by: "astrologer_handle"
---
```

### DataFeedItem (Фаза 2)

> Data Feed (NASA/USGS) перенесён из MVP в Фазу 2.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| source | Enum | 'nasa_donki' / 'usgs_earthquake' / 'openweather' |
| event_type | String | 'solar_flare' / 'earthquake' / 'cme' / ... |
| title | String | Заголовок события |
| description | Text | Описание |
| severity | String? | Уровень (для вспышек: C/M/X) |
| lat | Float? | Геолокация (для землетрясений) |
| lon | Float? | — |
| magnitude | Float? | Магнитуда (для землетрясений) |
| event_time | DateTime | Время события |
| raw_data | JSON | Оригинальный JSON ответа API |
| fetched_at | DateTime | Когда получено |
| created_at | DateTime | — |

### CosmicPassport

Виральная карточка «Космический паспорт». Не содержит PII — только результат расчёта.

| Поле | Тип | Описание |
|------|-----|----------|
| id | String (nanoid, 8 char) | PK, короткий ID для URL `/s/[id]` |
| chart_id | UUID? | FK → NatalChart (для аналитики: какая карта породила паспорт) |
| tropical_sign | Enum | Тропический знак Солнца |
| sidereal_sign | Enum | Сидерический знак Солнца |
| moon_sign | Enum? | Знак Луны (сидерический) |
| asc_sign | Enum? | Восходящий знак (null если время не указано) |
| ruling_planet | Enum | Управляющая планета (по сидерическому Солнцу) |
| element | Enum | fire / water / earth / air |
| rarity_pct | Float | Процент людей с такой комбинацией Солнце+Луна (см. ниже) |
| display_name | String? | Имя (опционально, для персонализации) |
| view_count | Int | Счётчик просмотров |
| created_at | DateTime | — |

**rarity_pct — источник данных:**
Статическая lookup-таблица 12×12 (144 комбинации Sun×Moon). Распределение **не равномерное** — Солнце проводит ~30 дней в знаке, Луна ~2.5 дня. Вероятность рассчитана на основании астрономических периодов: `P(Sun=X, Moon=Y) ≈ (days_Sun_in_X / 365.25) × (days_Moon_in_Y / 27.3)`. Таблица генерируется один раз и хранится в коде как константа.

### WaitlistEntry

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| email | String | Email |
| source | String? | utm_source / referrer |
| created_at | DateTime | — |

---

## Drizzle Schema (ключевые таблицы)

> ORM: Drizzle ORM (7KB bundle, type-safe, SQL-like API). Все таблицы описаны в том же формате.

```typescript
import { pgTable, uuid, text, timestamp, boolean, real, integer, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const systemEnum = pgEnum('system', ['sidereal', 'tropical']);
export const ayanamsaEnum = pgEnum('ayanamsa', ['lahiri', 'fagan_bradley', 'krishnamurti']);
export const houseSystemEnum = pgEnum('house_system', ['placidus', 'whole_sign', 'equal']);
export const chartStatusEnum = pgEnum('chart_status', ['temp', 'saved']);
export const elementEnum = pgEnum('element', ['fire', 'water', 'earth', 'air']);
export const detailLevelEnum = pgEnum('detail_level', ['beginner', 'intermediate', 'expert']);
export const premiumTierEnum = pgEnum('premium_tier', ['star', 'cosmos']);

// User — управляется Clerk, в нашей БД минимальная проекция
export const users = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),               // encrypted (AES-256-GCM)
  displayName: text('display_name'),
  preferredSystem: systemEnum('preferred_system').default('sidereal'),
  preferredAyanamsa: ayanamsaEnum('preferred_ayanamsa').default('lahiri'),
  preferredLanguage: text('preferred_language').default('en'),
  detailLevel: detailLevelEnum('detail_level').default('beginner'),
  timezone: text('timezone'),
  isPremium: boolean('is_premium').default(false),
  premiumTier: premiumTierEnum('premium_tier'),
  premiumExpiresAt: timestamp('premium_expires_at'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),           // soft delete (GDPR)
});

// NatalChart — birth data encrypted (AES-256-GCM)
// status: 'temp' = created on calculate (no user, no PII stored), 'saved' = user clicked Save (PII encrypted)
// Temp records with no user are cleaned up by cron after 7 days.
export const natalCharts = pgTable('natal_chart', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  status: chartStatusEnum('status').default('temp').notNull(),
  label: text('label').notNull().default('My Chart'),
  birthDate: text('birth_date').notNull(),       // encrypted
  birthTime: text('birth_time'),                 // encrypted, nullable
  birthTimeKnown: boolean('birth_time_known').notNull(),
  birthLocation: text('birth_location').notNull(), // encrypted
  birthLat: text('birth_lat').notNull(),         // encrypted (Float → String → encrypt)
  birthLon: text('birth_lon').notNull(),         // encrypted (Float → String → encrypt)
  timezoneAtBirth: text('timezone_at_birth').notNull(),
  system: systemEnum('system').notNull(),
  ayanamsa: ayanamsaEnum('ayanamsa'),
  houseSystem: houseSystemEnum('house_system').notNull(),
  isPrimary: boolean('is_primary').default(false),
  calculatedAt: timestamp('calculated_at').notNull(),
  ephemerisVersion: text('ephemeris_version').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_natal_chart_user').on(table.userId),
]);

// CosmicPassport — виральная карточка, без PII
export const cosmicPassports = pgTable('cosmic_passport', {
  id: text('id').primaryKey(),                   // nanoid, 8 char
  chartId: uuid('chart_id').references(() => natalCharts.id), // FK for analytics: which chart spawned this passport
  tropicalSign: text('tropical_sign').notNull(),
  siderealSign: text('sidereal_sign').notNull(),
  moonSign: text('moon_sign'),
  ascSign: text('asc_sign'),
  rulingPlanet: text('ruling_planet').notNull(),
  element: elementEnum('element').notNull(),
  rarityPct: real('rarity_pct').notNull(),
  displayName: text('display_name'),
  viewCount: integer('view_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

> Остальные таблицы (ChartPlanet, ChartAspect, ChartHouse, DataFeedItem, WaitlistEntry) описаны в том же формате Drizzle. Миграции через `drizzle-kit push` / `drizzle-kit generate`.

---

## Индексы

Индексы определяются в третьем аргументе `pgTable()` (см. пример `natalCharts` выше). Дополнительные:

```typescript
// В определениях таблиц:
// chart_planet: index('idx_chart_planet_chart').on(table.chartId)
// chart_aspect: index('idx_chart_aspect_chart').on(table.chartId)
// data_feed_item: index('idx_data_feed_source_time').on(table.source, table.eventTime)
// data_feed_item: index('idx_data_feed_type').on(table.eventType)
```

---

## Шифрование

### Что шифруется (AES-256-GCM)

- `natal_chart.birth_date`
- `natal_chart.birth_time`
- `natal_chart.birth_location`
- `natal_chart.birth_lat` (Float сериализуется в String перед шифрованием)
- `natal_chart.birth_lon` (Float сериализуется в String перед шифрованием)
- `user.email` (дополнительно к Clerk)

> **Все зашифрованные поля хранятся в БД как `String` (base64-encoded ciphertext).** Числовые значения (lat/lon) сериализуются в строку перед шифрованием и парсятся обратно в Float после дешифрования. Поиск по зашифрованным полям невозможен (не нужен на MVP — карты загружаются по `user_id`).

### Как (MVP — упрощённый подход)

- Ключ шифрования в Vercel Environment Variables (не в коде)
- Утилита `encrypt()`/`decrypt()` вызывается явно в API route при сохранении/загрузке карты
- **Application-level encryption** на MVP — явные вызовы `encrypt()`/`decrypt()` проще отлаживать и понимать
- **Без blind index** на MVP — поиск по зашифрованным полям не нужен (карты загружаются по user_id)
- Ротация ключей — Фаза 2 (после валидации PMF)

### Экстренная ротация ключей (MVP)

При компрометации ключа шифрования:
1. Сгенерировать новый ключ, добавить в Vercel env как `ENCRYPTION_KEY_NEW`
2. Миграционный скрипт: для каждой записи `decrypt(old_key)` → `encrypt(new_key)`
3. Заменить `ENCRYPTION_KEY` на новый, удалить `ENCRYPTION_KEY_NEW`
4. Верифицировать: `decrypt(new_key)` для выборки записей

> Скрипт re-encryption нужно написать заранее (до инцидента) и протестировать на staging.

### Как (Фаза 2 — полная реализация)

- Application-level middleware (Drizzle custom wrapper) для автоматического encrypt/decrypt
- Blind index (HMAC) для searchable encryption (если понадобится)
- Ротация ключей каждые 12 месяцев с re-encryption migration

---

## Миграции (будущее)

### Фаза 2: Social

```
+ Profile (bio, avatar, theme, music_embed)
+ Post (content, media, visibility)
+ Follow (follower_id, following_id)
+ Comment (post_id, user_id, content)
+ SynastryResult (chart1_id, chart2_id, score, aspects)
```

### Фаза 3: Comms + Music

```
+ Message (sender_id, receiver_id, content, type)
+ Channel (name, type, members)
+ DreamEntry (user_id, content, symbols, interpretation)
```
