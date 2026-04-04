# База данных: PostgreSQL + Prisma + Neon

## Что это простыми словами

Три инструмента, каждый делает своё:

- **PostgreSQL** — сама база данных. Хранит пользователей, карты, позиции планет. Как Excel, но для миллионов строк, с гарантией надёжности.
- **Prisma** — «переводчик» между TypeScript-кодом и базой. Вместо написания SQL-запросов вручную пишешь `prisma.user.findMany()` и получаешь типизированный результат.
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

## Prisma vs Drizzle: ключевой вопрос

### ⚠️ Это самое спорное решение в стеке

| Аспект | Prisma | Drizzle |
|--------|--------|---------|
| **Bundle size** | **~1.6 MB** | **~7.4 KB** (в 200x меньше!) |
| **Cold start** | 500-1500ms (serverless) | 50-100ms |
| **DX** | `prisma.user.create({})` — интуитивно | SQL-like: `db.insert(users)` — ближе к SQL |
| **Миграции** | `prisma migrate` — отличные | `drizzle-kit push` — хорошие |
| **Типы** | Генерируются из schema | Inferются из schema (TS-first) |
| **Edge Runtime** | ❌ (нужен Prisma Accelerate — платный) | ✅ (нативно) |
| **npm downloads** | ~9.3M/нед | ~6.8M/нед |
| **Зрелость** | 5+ лет, стабильный | 2+ года, быстро растёт |

### Что пишут разработчики

**Про Prisma:**
- «Лучший DX для людей, которые не любят SQL»
- «Холодные старты на Vercel — кошмар. 1.5 секунды на первый запрос»
- «Prisma v7.4 добавил кэширование query plans — стало лучше, но bundle size никуда не делся»
- «Prisma Studio для визуального просмотра данных — бесценен при разработке»

**Про Drizzle:**
- «SQL-like API = не нужно учить новый язык запросов»
- «7 KB вместо 1.6 MB — для serverless это game-changer»
- «Документация хуже, чем у Prisma. Но быстро улучшается»
- «Если знаешь SQL — Drizzle чувствуется естественнее»

### Решение для Estrevia

**Начинаем с Prisma** по причинам:
1. Лучшая интеграция с Next.js и Clerk (официальные примеры)
2. Prisma Studio для отладки на MVP
3. Миграции зрелее
4. Генерация типов из schema = быстрый старт

**Но:** если cold starts станут проблемой (> 1s) — мигрировать на Drizzle. Миграция болезненная, но выполнимая (схема = SQL, данные остаются в Postgres).

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

### 1. Prisma cold start

Первый запрос после деплоя = 1-2 секунды (Prisma client generation + connection pool). 

**Митигация:** Prisma warm-up в middleware или API route.

### 2. Neon cold start

БД засыпает → первый запрос = ~1 секунда на пробуждение.

**Митигация:** Vercel Cron каждые 4 минуты отправляет heartbeat запрос. Или использовать Neon's always-on compute (paid).

### 3. Шифрование PII

Birth data = PII. PostgreSQL не шифрует поля автоматически.

**Решение:** Prisma middleware для автоматического encrypt/decrypt. AES-256-GCM. Ключ в Vercel env vars.

### 4. Двойной cold start

Prisma cold start + Neon cold start = до 3 секунд на первый запрос после паузы. 

**Важно:** это проблема только для первого запроса. Все последующие — быстрые (<100ms).

---

## Вердикт

**PostgreSQL + Neon = правильный выбор.** Serverless, бесплатный старт, branching, Vercel-интеграция.

**Prisma = осознанный компромисс.** Лучший DX, но тяжёлый для serverless. Следить за cold starts. Plan B: Drizzle.
