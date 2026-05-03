# MVP: Скоуп и Приоритизация (Shipped)

> **MVP = то, что делает одну вещь лучше всех. Для нас это: лучшая сидерическая натальная карта с эзотерическим контекстом.**
>
> **English only. Customer conversion path — главный приоритет дизайна.**

---

## Что входит в MVP

**Команда:** Solo-разработчик + Claude Code (AI-assisted development)

### Функции

| # | Функция | Статус |
|---|---------|--------|
| 1 | Натальная карта (sidereal/tropical, Lahiri ayanamsa) | ✅ |
| 2 | Real-time планетарные часы | ✅ |
| 3 | Лунный календарь (фаза, знак, положение) | ✅ |
| 4 | Эссе по позициям (120 текстов = 10 планет × 12 знаков, EN) + мини-калькулятор + эфемериды | ✅ |
| 5 | Страница «Почему сидерическая» | ✅ |
| 6 | Регистрация + сохранение карты | ✅ |
| 7 | «Космический паспорт» — viral share card + OG image | ✅ |
| 8 | Stripe подписка (Star tier) | ✅ |
| 9 | Landing page + waitlist | ✅ |
| 10 | PWA manifest (installability only, без офлайн-кэширования) | ✅ |
| 11 | MCP-сервер (обёртка над API) + публикация в Smithery | 🔲 |

**Убрано из MVP (перенесено в Фазу 2):**
- ~~Лента NASA/USGS данных~~ — не core value, пользователи идут за натальной картой
- ~~Fagan-Bradley / Krishnamurti ayanamsa~~ — Lahiri покрывает ~80% сидерических астрологов
- ~~i18n (ES и другие языки)~~ — запуск на EN only, перевод после валидации PMF
- ~~Эссе для North Node и Chiron~~ — 120 эссе достаточно для MVP, дополнительные 24 в Фазу 2
- ~~House systems: Whole Sign, Equal~~ — MVP только Placidus, остальные в Фазу 2

### Инфраструктура MVP

| Компонент | Решение | Стоимость |
|-----------|---------|-----------|
| Frontend + API | Next.js на Vercel | $20/мес (Pro) |
| База данных | Neon PostgreSQL | $0 (free tier) |
| Аутентификация | Clerk | $0 (free tier) |
| Кэш | Upstash Redis | $0 (free tier) |
| Аналитика | PostHog Cloud | $0 (free tier) |
| Email | Resend | $0 (free tier) |
| AI контент | Claude API | ~$3 (разовая генерация) |
| **Итого** | | **~$25/мес** |

---

## Что НЕ входит в MVP

| Функция | Почему не сейчас | Когда |
|---------|-----------------|-------|
| **Социальная сеть** | Соцсеть без людей — мёртвый продукт. Сначала привлекаем астрологией | Фаза 2 |
| **Музыка/стриминг** | Отдельный бизнес. Лицензии стоят миллионы | Фаза 3 |
| **Чат/звонки** | Требует отдельной команды | Фаза 3 |
| **3D-вселенная** | Красиво, но не решает проблему пользователя | Фаза 2 |
| **Онлайн-библиотека** | Юридический кошмар. Начинаем с PD текстов | Фаза 3 |
| **AI-аватары** | WOW-фактор, но не удерживает пользователей | Фаза 2 |
| **Мобильное приложение** | PWA покрывает 90% потребностей | Фаза 3 |

---

## Критерии готовности MVP

### Технические

- [x] Натальная карта считается с точностью ±0.01° (сверка с Astro.com)
- [x] Ayanamsa: Lahiri (Fagan-Bradley, Krishnamurti — Фаза 2)
- [x] 100+ автотестов для эталонных карт проходят в CI
- [x] Swiss Ephemeris серверный API (`/api/chart/calculate`) отвечает < 500ms
- [x] Lighthouse Performance score ≥ 90 на мобильных
- [x] Время расчёта карты < 500ms (сервер: ~50ms расчёт + сеть)
- [x] PWA installable на iOS, Android, Desktop

### Контентные

- [x] 120 эссе (EN) по планетарным позициям (10 планет Sun–Pluto × 12 знаков; North Node и Chiron — Фаза 2)
- [x] Страница «Почему сидерическая» с визуализациями
- [x] Лунный календарь на 12 месяцев вперёд

### Юридические

- [x] Terms of Service опубликован
- [x] Privacy Policy опубликован
- [x] Cookie consent banner работает
- [x] COPPA: проверка возраста 13+ при регистрации
- [x] Disclaimer: astrology ≠ medical/financial advice

### Метрики запуска (через 3 месяца)

| Метрика | Stretch target | Цель | Kill criteria |
|---------|---------------|------|--------------|
| Регистрации | 5,000 | 1,000 | < 500 |
| DAU | 500 | 100 | < 20 |
| D30 Retention | 20% | 15% | < 10% |
| Conversion → Paid | 5% | 3% | < 1% |
| Карт рассчитано | 10,000 | 3,000 | < 500 |
| Viral shares | 1,000 | 200 | 0 за первый месяц |

> **Примечание:** kill criteria включают как органические, так и платные каналы (Meta Ads). Если retention высокий (> 15%), но регистрации низкие (500-1000) — это проблема каналов, не продукта. Скалировать рекламу, не убивать продукт.

---

## Порядок разработки

```
Неделя 1-2:   Инфраструктура
               ├── Next.js + TypeScript + Tailwind + shadcn/ui
               ├── Vercel deploy + Neon PostgreSQL + Drizzle ORM
               ├── Clerk auth
               └── CI/CD (GitHub Actions)

Неделя 3-6:   Core — Астро-движок
               ├── Swiss Ephemeris серверный API (sweph, Node.js)
               ├── API endpoint: /api/chart/calculate
               ├── Расчёт натальной карты (sidereal + tropical)
               ├── UI колеса натальной карты (SVG)
               ├── Тесты: 100+ эталонных карт
               ├── Планетарные часы (real-time)
               └── MCP-сервер: обёртка над API → публикация в Smithery (1 день)

Неделя 5-7:   Контент
               ├── LLM-генерация 120 эссе (Claude API)
               ├── Верификация текстов
               ├── Лунный календарь
               └── Страница «Почему сидерическая»

Неделя 7-8:   Viral Share + Landing
               ├── «Космический паспорт» — share card
               │   (Солнце/Луна/Асц + управитель + элемент + редкость)
               ├── OG image API (@vercel/og): /api/og/passport/[id]
               ├── Share page: /s/[id] (deep link + CTA)
               ├── Web Share API + pre-filled text (EN)
               ├── Fallbacks: copy link, Twitter intent, Telegram share URL
               ├── Download PNG (для Instagram Stories)
               ├── Landing page (hero = ввод даты → результат → share)
               └── Waitlist (email collection)

Неделя 8-10:  Stripe
               ├── Stripe Checkout + подписка (Star tier)
               └── Webhook: subscription lifecycle

Неделя 10-12: PWA + Polish
               ├── PWA manifest (installability only)
               ├── Аналитика (PostHog events)
               ├── Legal docs (ToS, Privacy)
               └── Performance optimization

Неделя 12-14: Верификация + Launch
               ├── LLM-верификация расчётов (сверка с Astro.com)
               ├── Публикация в Reddit/Telegram для фидбэка
               ├── Исправление багов
               ├── Product Hunt подготовка
               └── Запуск 🚀
```

---

## Риски MVP

| Риск | Вероятность | Митигация |
|------|------------|-----------|
| Swiss Ephemeris серверный API медленный | Низкая | sweph Node.js native — расчёт ~50ms. Vercel Fluid Compute переиспользует инстансы |
| Точность расчётов не проходит верификацию | Средняя | Начать с тестов рано, автоматизировать сверку с Astro.com |
| Контент (эссе) недостаточно качественный | Средняя | LLM-верификация + публикация в сидерических сообществах для фидбэка |
| 14 недель не хватит | Средняя | Скоуп уже урезан. Минимум = карта + эссе + landing |
| Нет органического интереса | Средняя | Waitlist до запуска, Reddit/Telegram посев |
