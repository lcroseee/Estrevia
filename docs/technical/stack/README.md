# Технологический стек: обоснование выборов

> Каждый инструмент выбран с вопросом: «Почему это, а не альтернативы?» Для каждого — плюсы, минусы, подводные камни, что пишут люди.

---

## Карта решений

### Ядро приложения

| Файл | Инструмент | Одно предложение |
|------|-----------|-----------------|
| [framework.md](framework.md) | **Next.js 16** | React-фреймворк #1, SSR/ISR, API routes, лучшая интеграция с Vercel |
| [language.md](language.md) | **TypeScript** | Типобезопасность = меньше багов на проекте с астрономическими расчётами |
| [styling.md](styling.md) | **Tailwind CSS 4 + shadcn/ui** | Utility-CSS + копируемые компоненты = быстрая тёмная космическая тема |
| [astro-engine.md](astro-engine.md) | **Swiss Ephemeris (server, Node.js native)** | Единственный стандарт точности для астрологических расчётов |

### Данные и инфраструктура

| Файл | Инструмент | Одно предложение |
|------|-----------|-----------------|
| [database.md](database.md) | **PostgreSQL + Drizzle ORM + Neon** | Serverless Postgres, 7KB ORM bundle, быстрый cold start |
| [cache.md](cache.md) | **Upstash Redis** | HTTP-based Redis для serverless, кэш API данных NASA |
| [hosting.md](hosting.md) | **Vercel** | Лучший DX для Next.js, но следим за ценами |
| [storage.md](storage.md) | **Vercel Blob** | Простое хранилище для медиа, текстур, аватаров |
| [dns.md](dns.md) | **Cloudflare** | Самый быстрый DNS в мире, домены по себестоимости |

### Сервисы

| Файл | Инструмент | Одно предложение |
|------|-----------|-----------------|
| [auth.md](auth.md) | **Clerk** | Auth за 1 день вместо 1 месяца, но следим за ценой при росте |
| [ai.md](ai.md) | **Claude API + Stability AI** | Генерация 240 эссе за $5 + аватары по натальной карте |
| [analytics.md](analytics.md) | **PostHog** | Open-source аналитика, A/B тесты, фичефлаги — всё в одном |
| [email.md](email.md) | **Resend** | Developer-first email, бесплатный тиер для MVP |
| [payments.md](payments.md) | **Stripe** | Стандарт для подписок, отсутствовал в изначальном стеке |

### Будущее (Фаза 2+)

| Файл | Инструмент | Одно предложение |
|------|-----------|-----------------|
| [3d-engine.md](3d-engine.md) | **Three.js + React Three Fiber** | Единственный зрелый 3D-движок для React. Не в MVP |

---

## Общие принципы выбора

1. **Бесплатный старт.** Каждый инструмент имеет free tier, достаточный для MVP (0-5K пользователей)
2. **TypeScript everywhere.** Один язык на всём стеке = один разработчик может делать всё
3. **Managed > self-hosted.** На этапе MVP нет DevOps-инженера. Managed сервисы экономят месяцы
4. **Vercel ecosystem.** Не потому что лучший — а потому что **один провайдер** = меньше точе�� отказа
5. **Готовность к замене.** Каждый сервис можно заменить. Clerk → Auth.js, Neon → Supabase, Resend → Postmark

---

## Стоимость стека (MVP)

| Сервис | Бесплатный тиер | Когда платить |
|--------|----------------|---------------|
| Next.js | ∞ | Никогда (open source) |
| Vercel Pro | — | $20/мес с первого дня |
| Neon PostgreSQL | 100 CU-hours/мес | При >5K запросов/день |
| Upstash Redis | 10K commands/день | При >500 DAU |
| Clerk | 10K MAU | При >10K пользователей |
| PostHog Cloud | 1M events/мес | При >50K DAU |
| Resend | 3K emails/мес | При >1K регистраций/мес |
| Claude API | Pay per use | ~$5 разовая генерация |
| Stripe | 2.9% + $0.30 | При первой оплате |
| Cloudflare | ∞ (DNS + DDoS) | Никогда для наших нужд |
| **Итого MVP** | | **~$25/мес** |

---

## ⚠️ Критические решения, требующие внимания

| Решение | Почему важно | Файл |
|---------|-------------|------|
| Swiss Ephemeris лицензия | ✅ Решено: open source (AGPL-3.0) снимает проблему | [astro-engine.md](astro-engine.md) |
| Open source стратегия | Код открыт (AGPL), контент (эссе) закрыт (proprietary) | [open-source.md](../open-source.md) |
| Drizzle ORM | ✅ Решено: Drizzle (7KB bundle, быстрый cold start на Vercel Functions) | [database.md](database.md) |
| Clerk ценообразование | $0.02/MAU после 10K = $800/мес при 50K юзерах | [auth.md](auth.md) |
| Vercel скрытые расходы | Bandwidth overages, Functions billing | [hosting.md](hosting.md) |
| Stripe не был в стеке | Нужен для подписок — добавлен | [payments.md](payments.md) |
