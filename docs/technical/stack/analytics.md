# Аналитика: PostHog

## Что это простыми словами

PostHog — это «всё в одном» для понимания, что делают пользователи: какие страницы смотрят, куда кликают, где уходят, какие фичи используют. Плюс: A/B тесты (какая цена лучше: $5.99 или $9.99?), feature flags (включить фичу для 10% пользователей), session replay (посмотреть видео действий пользователя).

---

## Почему PostHog

| Причина | Для Estrevia |
|---------|-------------|
| **Всё в одном** | Analytics + A/B тесты + Feature flags + Session replay. Не нужны 4 отдельных сервиса |
| **Open source** | Можно self-host для полного контроля данных (GDPR) |
| **Free tier** | 1M events/мес бесплатно. Для MVP — на год+ |
| **A/B тесты** | «$5.99 vs $9.99» — ключевой тест первого месяца |
| **Developer-friendly** | API-first, хорошие SDK для Next.js |

---

## Альтернативы

| Сервис | Плюсы | Минусы | Цена |
|--------|-------|--------|------|
| **Mixpanel** | Лучший UI для PM'ов, мощная сегментация | Cloud-only, дороже, pricing по MTU | Free 20M events/мес |
| **Amplitude** | Глубокая аналитика, governance | Cloud-only, сложнее, enterprise-oriented | Free 50K MTU/мес |
| **Plausible** | Простой, privacy-first, EU-hosted | Только page analytics, нет A/B тестов, нет feature flags | $9+/мес |
| **Google Analytics** | Бесплатно, мощный | Privacy кошмар. GDPR проблемы. Нет A/B тестов | $0 |

### Почему не Google Analytics

GA4 = данные пользователей уходят в Google. Для платформы с birth data (PII) и анти-алгоритмическим позиционированием — **использование Google Analytics = лицемерие**.

---

## Вердикт

**PostHog = идеальный match.** All-in-one, open source, бесплатный до 1M events. A/B тесты для ценообразования — критическая функция для первого месяца.
