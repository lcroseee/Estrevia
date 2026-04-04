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
| preferred_ayanamsa | Enum | 'lahiri' / 'fagan_bradley' / 'krishnamurti' |
| preferred_language | Enum | 'en' / 'es' |
| detail_level | Enum | 'beginner' / 'intermediate' / 'expert' |
| timezone | String | IANA timezone |
| is_premium | Boolean | Активная подписка |
| premium_tier | Enum? | 'star' / 'cosmos' / null |
| premium_expires_at | DateTime? | Дата окончания подписки |
| created_at | DateTime | — |
| updated_at | DateTime | — |
| deleted_at | DateTime? | Soft delete (GDPR) |

### NatalChart

**Чувствительные данные:** birth_date, birth_time, birth_location — шифруются AES-256 at rest.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| user_id | UUID? | FK → User (null = гостевой расчёт) |
| label | String | «Моя карта», «Мама», и т.д. |
| birth_date | String (encrypted) | Дата рождения |
| birth_time | String? (encrypted) | Время рождения (может быть неизвестно) |
| birth_time_known | Boolean | Известно ли время |
| birth_location | String (encrypted) | Город / координаты |
| birth_lat | Float (encrypted) | Широта |
| birth_lon | Float (encrypted) | Долгота |
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

Не в БД — хранится как MDX в репозитории. Frontmatter:

```yaml
---
planet: sun
sign: aries
system: sidereal
title: "Sun in Sidereal Aries"
title_es: "Sol en Aries Sideral"
description: "The sidereal Sun in Aries..."
correspondences_777: "Emperor (IV), Heh, Aries"
last_verified: "2026-04-15"
verified_by: "astrologer_handle"
---
```

### DataFeedItem

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

### WaitlistEntry

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| email | String | Email |
| source | String? | utm_source / referrer |
| created_at | DateTime | — |

---

## Индексы

```sql
-- Частые запросы
CREATE INDEX idx_natal_chart_user ON natal_chart(user_id);
CREATE INDEX idx_chart_planet_chart ON chart_planet(chart_id);
CREATE INDEX idx_chart_aspect_chart ON chart_aspect(chart_id);
CREATE INDEX idx_data_feed_source_time ON data_feed_item(source, event_time DESC);
CREATE INDEX idx_data_feed_type ON data_feed_item(event_type);
```

---

## Шифрование

### Что шифруется (AES-256-GCM)

- `natal_chart.birth_date`
- `natal_chart.birth_time`
- `natal_chart.birth_location`
- `natal_chart.birth_lat`
- `natal_chart.birth_lon`
- `user.email` (дополнительно к Clerk)

### Как

- Ключ шифрования в Vercel Environment Variables (не в коде)
- Prisma middleware для автоматического encrypt/decrypt
- Поиск по зашифрованным полям — через blind index (HMAC)

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
