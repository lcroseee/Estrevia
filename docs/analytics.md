# Аналитика и Event Tracking

> Без аналитики Kill Criteria невозможно измерить. PostHog — основной инструмент.

## Инструменты

| Инструмент | Роль | Стоимость |
|-----------|------|-----------|
| **PostHog** | Основная аналитика, A/B тесты, фичефлаги | $0 (до 1M events/мес) |
| **Meta Pixel** | Ретаргетинг, конверсии рекламы | $0 |
| **Google Search Console** | SEO мониторинг | $0 |
| **Sentry** | Error tracking | $0 (free tier) |

---

## Ключевые события (Events)

### Core

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `page_view` | path, referrer, utm_* | Каждая загрузка страницы |
| `chart_calculated` | system (sidereal/tropical), has_time, ayanamsa | Расчёт натальной карты |
| `signup_completed` | method (email/oauth), source, referrer | Регистрация |
| `chart_saved` | system, has_time | Сохранение карты в аккаунт |

### Контент

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `essay_read` | planet, sign, read_time_sec, language | Открытие эссе по позиции |
| `essay_scrolled` | planet, sign, scroll_percent | Прокрутка (25%, 50%, 75%, 100%) |
| `moon_calendar_viewed` | current_phase, date_range | Просмотр лунного календаря |
| `sidereal_explainer_viewed` | source, read_time_sec | Просмотр страницы «Почему сидерическая» |
| `data_feed_viewed` | feed_type (solar/earthquake/weather) | Просмотр ленты NASA/USGS |

### Конверсия

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `premium_clicked` | tier (star/cosmos), source | Клик на подписку |
| `premium_subscribed` | tier, price, currency, period (month/year) | Оплата подписки |
| `premium_cancelled` | tier, reason (если указана), months_active | Отмена подписки |
| `premium_trial_started` | tier | Начало trial (если будет) |

### Engagement

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `share_chart` | method (link/image/social), platform | Шаринг натальной карты |
| `language_switched` | from, to | Переключение языка EN/ES |
| `system_toggled` | from, to (sidereal/tropical) | Переключение системы |
| `pwa_installed` | platform (ios/android/desktop) | Установка PWA |
| `pwa_prompt_shown` | — | Показ промпта установки |
| `pwa_prompt_dismissed` | — | Отклонение промпта |

### Ошибки

| Событие | Свойства | Триггер |
|---------|----------|---------|
| `calculation_error` | error_type, birth_data_hash | Ошибка расчёта карты |
| `api_error` | endpoint, status_code, error_message | Ошибка внешнего API |
| `offline_fallback` | feature, cached_age_sec | Показ кэшированных данных |

---

## Дашборды

### Ежедневный (операционный)

- DAU
- Новые регистрации
- Карт рассчитано (sidereal vs tropical)
- PWA установок
- Ошибки (Sentry alert count)

### Еженедельный (продуктовый)

- Retention cohorts: D1 / D7 / D30
- Funnel: visit → chart → signup → premium
- Top эссе по read time
- Sidereal vs tropical usage ratio
- Share rate (charts shared / charts calculated)

### Ежемесячный (бизнес)

- MRR + MRR growth
- Churn rate
- CAC по каналам (organic vs Meta Ads vs referral)
- LTV/CAC ratio
- Conversion rate по тиерам
- Revenue по подпискам (Star vs Cosmos)

---

## A/B тесты (PostHog Feature Flags)

### Запланированные

| Тест | Варианты | Метрика | Когда |
|------|---------|---------|-------|
| Цена Star | $5.99 vs $9.99 | Conversion rate, MRR | Месяц 1 |
| Paywall position | После 3 vs 5 эссе | Free → Paid conversion | Месяц 1 |
| CTA текст | «Попробовать» vs «Раскрыть карту» vs «Подписаться» | Click rate | Месяц 1 |
| Onboarding flow | С tutorial vs без | D7 retention | Месяц 2 |
| Landing hero | Карта vs космос-визуал vs текст | Signup rate | Месяц 2 |

---

## Privacy-First подход

- PostHog Cloud (EU hosting option) или self-hosted
- **Cookie consent banner** обязателен. PostHog tracking = opt-in
- Meta Pixel = opt-in (отдельный consent)
- Никаких third-party advertising cookies
- Данные аналитики не содержат PII (birth data = hashed)
- Retention: 90 дней для event data, 12 месяцев для aggregates
