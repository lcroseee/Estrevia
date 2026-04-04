# Безопасность и приватность

---

## Модель угроз

| Угроза | Вероятность | Влияние | Митигация |
|--------|------------|---------|-----------|
| Утечка birth data (PII) | Средняя | Критическое | AES-256 at rest, TLS 1.3, минимизация хранения |
| SQL Injection | Низкая | Критическое | Prisma ORM (parameterized queries), Zod validation |
| XSS | Средняя | Высокое | React (auto-escaping), CSP headers, sanitize UGC |
| CSRF | Низкая | Среднее | SameSite cookies, Clerk handles sessions |
| Brute force auth | Средняя | Среднее | Clerk rate limiting, account lockout |
| DDoS | Средняя | Среднее | Cloudflare, Vercel edge, Upstash rate limiting |
| API abuse (scraping) | Высокая | Низкое | Rate limiting, API keys для тяжёлых endpoint'ов |
| Swiss Ephemeris supply chain | Низкая | Среднее | Pin WASM version, verify checksum |

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
- Ротация: каждые 12 месяцев (с re-encryption migration)
- Никогда не в коде, не в git, не в логах

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
    value: "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.nasa.gov; connect-src 'self' https://api.clerk.com https://*.posthog.com"
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
| GET /api/feed/* | 30 req/мин | Upstash Rate Limit |
| GET /api/essays/* | 60 req/мин | CDN cache |

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
- **Третьи стороны:** Clerk (auth), PostHog (analytics, opt-in), Resend (email)
- **Нет продажи данных.** Никогда.

### Cookie Policy

| Cookie | Тип | Необходимость | Consent |
|--------|-----|--------------|---------|
| Clerk session | Essential | Auth работает | Не требуется |
| Language preference | Essential | UI работает | Не требуется |
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
