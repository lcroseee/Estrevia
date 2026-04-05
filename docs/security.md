# Безопасность и приватность

---

## Модель угроз

| Угроза | Вероятность | Влияние | Митигация |
|--------|------------|---------|-----------|
| Утечка birth data (PII) | Средняя | Критическое | AES-256 at rest, TLS 1.3, минимизация хранения |
| SQL Injection | Низкая | Критическое | Drizzle ORM (parameterized queries), Zod validation |
| XSS | Средняя | Высокое | React (auto-escaping), CSP headers, sanitize UGC |
| CSRF | Низкая | Среднее | SameSite cookies, Clerk handles sessions |
| Brute force auth | Средняя | Среднее | Clerk rate limiting, account lockout |
| DDoS | Средняя | Среднее | Cloudflare, Vercel edge, Upstash rate limiting |
| API abuse (scraping) | Высокая | Низкое | Rate limiting, API keys для тяжёлых endpoint'ов |
| Swiss Ephemeris supply chain | Низкая | Среднее | Pin sweph version in package.json, verify in CI |

---

## Шифрование

### At Rest (AES-256-GCM)

| Данные | Зашифровано | Где хранится |
|--------|-------------|-------------|
| Birth date | ✅ | Neon PostgreSQL |
| Birth time | ✅ | Neon PostgreSQL |
| Birth location | ✅ | Neon PostgreSQL |
| Birth coordinates | ✅ | Neon PostgreSQL |
| Email | ✅ (Clerk + наша копия) | Clerk + Neon |
| Password | ✅ (Clerk manages) | Clerk (bcrypt/argon2) |
| Calculated positions | ❌ (не PII) | Neon PostgreSQL |
| Essay content | ❌ (публичный) | Git repo / CDN |
| Analytics events | ❌ (анонимизированы) | PostHog Cloud |

### In Transit

- TLS 1.3 на всех соединениях
- HSTS header (Strict-Transport-Security)
- Vercel обеспечивает TLS автоматически

### Ключи шифрования

- Хранятся в Vercel Environment Variables (encrypted at rest)
- MVP: явные вызовы `encrypt()`/`decrypt()` в API routes
- Фаза 2: Drizzle middleware + ротация ключей каждые 12 месяцев
- Никогда не в коде, не в git, не в логах

**Экстренная ротация ключей (MVP):** Скрипт re-encryption подготовить заранее. При компрометации: новый ключ → скрипт `decrypt(old) → encrypt(new)` по всем записям → замена env var → верификация. Подробности — в `docs/data-model.md`.

**Бэкап ключа шифрования:**
- Копия ключа хранится в менеджере паролей (1Password vault) — НЕ только в Vercel env
- Если Vercel env var случайно удалён — все зашифрованные данные нечитаемы без бэкапа
- Проверка: при первом деплое убедиться, что бэкап в vault совпадает с env var
- Документировать в README для team: «Перед удалением env vars — проверь vault»

---

## Защита от abuse

### Content moderation

| Поле | Риск | Митигация |
|------|------|-----------|
| `display_name` в CosmicPassport | Offensive/spam текст в share cards | Sanitize: strip HTML, max 50 chars, blocklist слов. Серверная валидация в `/api/passport` |
| Share cards (CDN) | Массовое создание карточек = CDN bloat | Rate limit на создание passport: 5/мин guest, 20/мин auth. Cache eviction для старых (> 90 дней, 0 views) |
| `/api/chart/calculate` | Scraping всех комбинаций дат | Rate limit 10 req/мин guest. IP-based + fingerprint. Для массового доступа — будущий платный API (Фаза 3) |

### Waitlist email spam

- Zod validation: формат email
- Rate limit: 5 req/мин на `/api/waitlist`
- Нет двойной подписки (409 Conflict при повторе)

---

## Аутентификация (Clerk)

| Функция | Реализация |
|---------|-----------|
| Email + password | Clerk built-in |
| OAuth (Google, Apple, GitHub) | Clerk built-in |
| Magic links | Clerk built-in |
| MFA (2FA) | Clerk built-in (TOTP) |
| Session management | Clerk JWT, short-lived tokens |
| Account lockout | After 5 failed attempts |
| Password requirements | Min 8 chars, breach detection |

### Авторизация

| Роль | Доступ |
|------|--------|
| Guest | Расчёт карты, базовые эссе, NASA лента |
| User (Free) | + сохранение карты, лунный календарь |
| User (Star) | + все эссе, транзиты, синастрия |
| User (Cosmos) | + 3D, музыка, каналы, дневник снов |
| Admin | + управление контентом, модерация |

---

## HTTP Security Headers

```typescript
// next.config.ts
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.nasa.gov; connect-src 'self' https://api.clerk.com https://*.clerk.accounts.dev https://*.posthog.com"
    // Note: removed 'unsafe-eval' from script-src — Next.js production does not need it.
    // 'unsafe-inline' in style-src is required for shadcn/ui inline styles.
    // If Next.js dev mode needs it — use a separate development-only CSP.
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];
```

---

## Rate Limiting

| Endpoint | Лимит | Инструмент |
|----------|-------|-----------|
| POST /api/chart/calculate | 10 req/мин (guest), 60 req/мин (auth) | Upstash Rate Limit |
| POST /api/auth/* | 5 req/мин | Clerk built-in |
| GET /api/essays/* | 60 req/мин | CDN cache |

> **Upstash free tier = 10K commands/day.** При ~100+ DAU с rate limiting это кончится быстро. План: MVP на free tier, при росте → Upstash Pay-as-you-go ($0.2/100K commands). Альтернатива: перенести rate limiting в Vercel middleware с in-memory Map (без Redis).

---

## GDPR / CCPA Compliance

### Права пользователя

| Право | Реализация | Срок |
|-------|-----------|------|
| Право на доступ (Data Export) | Settings → Export My Data (JSON) | 72 часа |
| Право на удаление | Settings → Delete Account | Hard delete в 30 дней |
| Право на исправление | Settings → Edit Profile | Мгновенно |
| Право на переносимость | Export в JSON формате | 72 часа |
| Право отозвать согласие | Cookie banner → Manage | Мгновенно |

### Обработка данных

- **Минимизация:** собираем только необходимое (birth data для расчёта, email для auth)
- **Целесообразность:** birth data используется только для астрологических расчётов
- **Хранение:** US (Vercel/Neon, AWS us-east)
- **Третьи стороны:** Clerk (auth), PostHog (**Cloud EU** — `eu.posthog.com`, analytics, opt-in), Resend (email)

> **Важно:** при регистрации PostHog выбрать **EU Cloud** (eu.posthog.com), не US. EU Cloud хранит данные в ЕС, что необходимо для GDPR compliance без дополнительных механизмов передачи данных (SCCs).
- **Нет продажи данных.** Никогда.

### Cookie Policy

| Cookie | Тип | Необходимость | Consent |
|--------|-----|--------------|---------|
| Clerk session | Essential | Auth работает | Не требуется |
| Theme preference | Essential | UI работает | Не требуется |
| PostHog analytics | Performance | Аналитика | **Opt-in** |
| Meta Pixel | Marketing | Ретаргетинг | **Opt-in** |

---

## Бэкапы и восстановление

| Что | Частота | Retention | Шифрование |
|-----|---------|-----------|-----------|
| PostgreSQL (Neon) | Continuous (WAL) | 7 дней (free), 30 дней (pro) | ✅ |
| Vercel Blob | Redundant storage | Built-in | ✅ |
| Git repo | Every push | Infinite (GitHub) | ✅ (SSH) |
| Environment variables | Manual export | N/A | ✅ (Vercel) |

### Disaster Recovery

- **RTO (Recovery Time Objective):** < 1 час (Neon point-in-time restore)
- **RPO (Recovery Point Objective):** < 5 минут (continuous WAL archiving)

---

## Инцидент-менеджмент

| Severity | Описание | Response time |
|----------|----------|--------------|
| P0 | Data breach, полный outage | Немедленно. Уведомление пользователей в 72 часа (GDPR) |
| P1 | Partial outage, ошибки расчётов | < 4 часа |
| P2 | Degraded performance, API failures | < 24 часа |
| P3 | Minor bugs, UI issues | Next sprint |
