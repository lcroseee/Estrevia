# База данных: PostgreSQL + Drizzle ORM + Neon

## Что это простыми словами

Три инструмента, каждый делает своё:

- **PostgreSQL** — сама база данных. Хранит пользователей, карты, позиции планет. Как Excel, но для миллионов строк, с гарантией надёжности.
- **Drizzle ORM** — type-safe ORM с SQL-like API. 7KB bundle (vs Prisma 1.6MB) — критично для Vercel Functions cold start. Пишешь `db.select().from(users)` и получаешь типизированный результат.
- **Neon** — «облако» для PostgreSQL. Вместо настройки сервера — нажимаешь кнопку, получаешь базу. Serverless: масштабируется автоматически, засыпает когда не нужна.

---

## Почему PostgreSQL (а не MySQL, MongoDB, SQLite)

| Альтернатива | Почему не подходит |
|-------------|-------------------|
| **MySQL** | Нет JSON-полей на уровне Postgres. Нет GeoDB. Postgres = стандарт для новых проектов |
| **MongoDB** | Данные рождения = структурированные (дата, время, координаты). Relational model идеален. MongoDB = для неструктурированных документов |
| **SQLite** | Один файл, нет concurrent writes. Не подходит для multi-user SaaS |
| **Firebase/Firestore** | Vendor lock-in (Google). Дорого при росте. Нет SQL для сложных запросов |

---

## Почему Drizzle ORM (а не Prisma)

### Решение принято: Drizzle ORM

| Аспект | Drizzle (выбран) | Prisma (отвергнут) |
|--------|-----------------|-------------------|
| **Bundle size** | **~7 KB** | ~1.6 MB |
| **Cold start** | **50-100ms** | 500-1500ms |
| **DX** | SQL-like: `db.insert(users)` — ближе к SQL | `prisma.user.create({})` — интуитивно |
| **Миграции** | `drizzle-kit push` / `drizzle-kit generate` | `prisma migrate` |
| **Типы** | Inferются из schema (TS-first) | Генерируются из schema |
| **Edge Runtime** | ✅ (нативно) | ❌ (нужен Prisma Accelerate — платный) |
| **Зрелость** | 2+ года, быстро растёт | 5+ лет, стабильный |

### Почему Drizzle для Estrevia

1. **7KB bundle size (vs Prisma 1.6MB)** — критично для Vercel Functions cold start. Каждая функция загружает ORM, и 1.6MB Prisma = 500-1500ms задержка на первый запрос
2. **TS-first** — типы инферятся из schema, не генерируются. Один источник правды
3. **SQL-like API** — если знаешь SQL, Drizzle чувствуется естественно: `db.select().from(users).where(eq(users.id, id))`
4. **Edge-compatible** — работает на Edge Runtime без платного Prisma Accelerate
5. **Drizzle Kit** — миграции через `drizzle-kit push` (dev) и `drizzle-kit generate` + `drizzle-kit migrate` (prod)

---

## Neon vs альтернативы

### Neon PostgreSQL

| Аспект | Подробности |
|--------|------------|
| **Что это** | Serverless Postgres. Засыпает через 5 мин неактивности → $0. Просыпается за ~1s |
| **Куплен** | Databricks (май 2025). Стабильность обеспечена |
| **Free tier** | 100 CU-hours/мес (удвоен после покупки). ~0.5 GB storage |
| **Цена** | $0.14/CU-hour compute, $0.35/GB-month storage |
| **Killer feature** | **Database branching** — создаёт копию БД для каждого preview deploy за секунды |
| **Проблема** | Cold start ~1s при пробуждении. Для первого запроса после паузы |

### Альтернативы

| Сервис | Плюсы | Минусы |
|--------|-------|--------|
| **Supabase** | Полный BaaS (auth + storage + realtime + DB) | Дороже storage. Нет scale-to-zero. Избыточен если уже есть Clerk + Vercel Blob |
| **PlanetScale** | Лучший uptime, отличная производительность | MySQL (не Postgres!). Убрали free tier. Дорого |
| **Turso** | SQLite на edge, глобально распределён | Другая парадигма. Не Postgres. Экосистема меньше |
| **Railway PostgreSQL** | Простой, предсказуемый | Нет scale-to-zero. Нет branching. $5/мес минимум |

### Почему Neon

1. **Vercel Marketplace** — нативная интеграция, env variables автоматически
2. **Branching** — каждый PR получает свою копию БД
3. **Scale-to-zero** — $0 когда не используется (ночью, например)
4. **Databricks backing** — не стартап-однодневка
5. **PostgreSQL** — не MySQL, не SQLite. Стандарт

---

## Подводные камни

### 1. Neon cold start

БД засыпает → первый запрос = ~1 секунда на пробуждение.

**Митигация:** Vercel Cron каждые 4 минуты отправляет heartbeat запрос. Или использовать Neon's always-on compute (paid).

### 2. Шифрование PII

Birth data = PII. PostgreSQL не шифрует поля автоматически.

**Решение:** Application-level encryption — явные `encrypt()`/`decrypt()` вызовы в API routes. AES-256-GCM. Ключ в Vercel env vars.

### 3. Cold start (Neon)

Neon cold start = ~1 секунда на первый запрос после паузы. Drizzle ORM добавляет минимум (50-100ms vs 500-1500ms у Prisma).

**Важно:** это проблема только для первого запроса. Все последующие — быстрые (<100ms).

**Решение:** Vercel Cron heartbeat каждые 4 минуты (`/api/health` → простой `SELECT 1`) держит Neon разогретым. Стоимость: ~0 (Vercel Pro включает Cron).

---

## Вердикт

**PostgreSQL + Neon = правильный выбор.** Serverless, бесплатный старт, branching, Vercel-интеграция.

**Drizzle ORM = оптимальный выбор для serverless.** 7KB bundle, 50-100ms cold start, SQL-like API, Edge-compatible. Миграции через `drizzle-kit`.
