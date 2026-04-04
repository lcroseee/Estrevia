# Хостинг: Vercel

## Что это простыми словами

Vercel — платформа, где работает твой сайт. Ты пушишь код в GitHub → Vercel автоматически собирает и деплоит. Каждый PR получает свой URL для превью. Настройка: ноль. Для Next.js — лучшая поддержка (те же люди делают и Next.js, и Vercel).

---

## Почему Vercel

| Причина | Для Estrevia |
|---------|-------------|
| **Next.js first** | Создатели Next.js = Vercel. Лучшая интеграция в мире |
| **Zero config** | Git push → live за 30 сек. Нет Docker, нет nginx, нет CI/CD настройки |
| **Preview deploys** | Каждый PR → уникальный URL. Показать дизайнеру, тестировать |
| **Fluid Compute** | Serverless функции с полным Node.js, reuse между запросами |
| **Vercel Marketplace** | Neon, Clerk, Upstash — подключение в 1 клик, env vars автоматически |
| **Edge Network** | CDN по всему миру. Статика раздаётся за < 50ms |
| **Cron Jobs** | Встроенные. NASA API polling каждые 5 минут — бесплатно на Pro |

---

## ⚠️ Главная проблема: скрытые расходы

### Pricing структура

| Тиер | Цена | Что включено |
|------|------|-------------|
| **Hobby** | $0 | 100GB bandwidth, limited functions |
| **Pro** | $20/мес/user | 1TB bandwidth, unlimited functions |
| **Enterprise** | Custom | SLA, support, advanced features |

### Где кроются сюрпризы

| Ресурс | Включено в Pro | Сверх лимита |
|--------|---------------|-------------|
| Bandwidth | 1TB | **$40/100GB** |
| Function execution | 1000 GB-hours | **$40/100 GB-hours** |
| Vercel Blob | 250GB transfer | Usage-based |
| Image optimization | 5000/мес | $5/1000 |

### Что пишут разработчики

- «Changed from 'this is amazing' to 'did you see my bill?'» — общий sentiment
- Истории $400-1200+ неожиданных счетов на Reddit и HN
- «Вирусный трафик (хорошая вещь) = финансовый шок»
- «Pro $20/мес звучит дёшево, пока не дойдёшь до overages»

### Для Estrevia конкретно

| Сценарий | Трафик | Стоимость |
|----------|--------|-----------|
| MVP (2K users) | ~50GB/мес | $20 (Pro plan, внутри лимита) |
| Growth (10K users) | ~200GB/мес | $20 (внутри 1TB) |
| Viral moment (100K visits/day) | ~2TB/мес | **$20 + $400 bandwidth** |

**Митигация:** Vercel spend alerts. Установить лимит $100/мес. При вирусном трафике — celebration, не паника.

---

## Альтернативы

### Netlify

| Аспект | Подробности |
|--------|------------|
| **Цена** | $19/мес (Pro). 1TB bandwidth. $55/100GB overage (дешевле Vercel) |
| **Плюсы** | Нет vendor lock-in (декларируют). Composable architecture. Предсказуемее в ценах |
| **Минусы** | Next.js поддержка хуже (не они создали). Меньше Next.js-specific оптимизаций |
| **Когда лучше** | Для non-Next.js проектов (Astro, SvelteKit) |

### Cloudflare Pages

| Аспект | Подробности |
|--------|------------|
| **Цена** | **Безлимитный bandwidth на всех тиерах.** $0 для большинства сценариев |
| **Плюсы** | Драматически дешевле при трафике. Workers = мощный edge compute |
| **Минусы** | Next.js поддержка — через `@cloudflare/next-on-pages`, не нативная. DX хуже |
| **Когда лучше** | При 50K+ DAU, когда Vercel bandwidth стоит > $200/мес |
| **Тренд** | Купили Astro (янв. 2026). Становятся серьёзным full-stack конкурентом |

### Self-hosted (Docker + VPS)

| Аспект | Подробности |
|--------|------------|
| **Цена** | $5-20/мес за VPS (Hetzner, DigitalOcean) |
| **Плюсы** | Полный контроль. Предсказуемая цена. Нет lock-in |
| **Минусы** | Нужен DevOps. Нет preview deploys. Нет auto-scaling. Нет zero-config |
| **Когда лучше** | При команде 3+ с DevOps инженером |

---

## Стратегия для Estrevia

### MVP-Growth (месяцы 1-12): Vercel Pro

- $20/мес — приемлемо
- Zero-config = фокус на продукте, не на инфраструктуре
- Preview deploys = быстрые итерации
- Marketplace = Neon + Clerk + Upstash в 1 клик

### При Vercel > $200/мес: оценить миграцию

| Триггер | Действие |
|---------|----------|
| Bandwidth > 2TB/мес | Рассмотреть Cloudflare Pages |
| Functions > $100/мес | Оптимизировать или выносить тяжёлое на Railway |
| Общий bill > $500/мес | Серьёзно оценить self-hosted или Cloudflare |

### Подготовка к миграции

- `output: 'standalone'` в next.config — готовность к Docker
- Бизнес-логика в `src/modules/`, не в Vercel-specific коде
- Vercel Blob → абстракция через интерфейс (позже заменить на R2/S3)

---

## Вердикт

**Vercel = правильно для MVP и первого года.** Лучший DX, лучшая Next.js интеграция, нулевая настройка. Но **ставить spend alerts с первого дня** и быть готовым к миграции при росте. Vercel = отличный лаунчпад, не обязательно вечный дом.
