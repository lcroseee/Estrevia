# Стратегия тестирования

---

## Принципы

1. **Астрономическая точность — критична.** Ошибка в 0.1° = потеря доверия целевой аудитории. Расчёты покрываются тестами в первую очередь.
2. **Автотесты в CI.** Каждый PR проходит тесты перед мержем.
3. **Без перфекционизма.** MVP-уровень: покрываем core logic и critical paths, не каждый компонент.

---

## Пирамида тестов

```
        ┌───────────┐
        │   E2E     │  5-10 тестов (критические user flows)
        │ Playwright │
        ├───────────┤
        │Integration│  20-30 тестов (API routes, DB queries)
        │  Vitest   │
        ├───────────┤
        │   Unit    │  100+ тестов (astro calculations, utils)
        │  Vitest   │
        └───────────┘
```

---

## Unit Tests (Vitest)

### Астро-движок — приоритет #1

| Тест-кейс | Количество | Что проверяем |
|-----------|-----------|---------------|
| Эталонные натальные карты | 100+ | Позиции планет ±0.01° (сверка с Astro.com, Solar Fire) |
| Ayanamsa (Lahiri) | 1× на карту (MVP) | Lahiri only. Фаза 2: Fagan-Bradley, Krishnamurti |
| Sidereal vs Tropical | 10+ | Разница = ayanamsa offset для каждой планеты |
| Ретроградность | 20+ | Корректное определение ретроградных планет |
| Дома (Placidus, Whole Sign) | 10+ | Правильные куспиды при известном времени |
| Аспекты | 20+ | Конъюнкция, оппозиция, трин, квадрат, секстиль |
| Лунные фазы | 12+ | Одна на каждый месяц, сверка с timeanddate.com |
| Планетарные часы | 7+ | Один на каждый день недели, корректный управитель |
| Edge cases | 10+ | Полярные координаты, дата смены знака, смена ayanamsa |

### Формат эталонных тестов

```typescript
// tests/astro/natal-chart.test.ts
describe('Natal Chart Calculation', () => {
  test('Aleister Crowley birth chart (known reference)', () => {
    const chart = calculateChart({
      date: '1875-10-12',
      time: '23:42',
      lat: 51.5074,  // Leamington Spa
      lon: -1.5365,
      system: 'sidereal',
      ayanamsa: 'lahiri',
    });
    
    // Reference: verified against Jagannatha Hora
    expect(chart.sun.absoluteDegree).toBeCloseTo(178.23, 1); // ±0.01°
    expect(chart.sun.sign).toBe('virgo');
    expect(chart.moon.sign).toBe('pisces');
    // ...
  });
});
```

### Утилиты

| Тест | Что проверяем |
|------|---------------|
| Конвертация координат | DMS ↔ decimal |
| Timezone resolution | IANA timezone для даты + координат |
| Date parsing | Разные форматы дат |
| Encryption helpers | Encrypt/decrypt round-trip |
| Zod schemas | Валидация input данных |

---

## Integration Tests (Vitest)

| Тест | Что проверяем |
|------|---------------|
| API: POST /api/chart/calculate | Полный flow: input → Swiss Ephemeris → response (серверный расчёт) |
| API: POST /api/chart/save | Auth → encrypt birth data → Drizzle transaction |
| API: GET /api/og/passport/:id | OG image generation (@vercel/og) → PNG 1200×630 |
| API: POST /api/stripe/checkout | Stripe session creation → redirect URL returned |
| API: POST /api/webhooks/stripe | Signature verification → user premium status updated |
| DB: create/read NatalChart | Drizzle queries + encryption round-trip |
| DB: create/read CosmicPassport | Drizzle queries + view_count increment |
| DB: create/read User | Drizzle queries + Clerk webhook → user creation |
| Auth: protected routes | Clerk middleware blocks unauthenticated |
| Rate limiting | Upstash rate limiter enforces limits |
| Encryption | encrypt() → decrypt() round-trip for birth data fields |

---

## E2E Tests (Playwright)

| Флоу | Шаги |
|------|------|
| Расчёт карты (гость) | Landing → ввод даты → POST /api/chart/calculate → карта показана → toggle sidereal/tropical |
| Cosmic Passport share | Карта → «Поделиться» → карточка создана → /s/[id] открывается → CTA видно |
| Viral loop | /s/[id] → ввод даты на share page → новый расчёт → новый share |
| Регистрация | Карта → «Сохранить» → Clerk signup → карта сохранена |
| Чтение эссе | Карта → клик на планету → эссе открывается → мини-калькулятор работает |
| Лунный календарь | Навигация → календарь → текущая фаза видна |
| Stripe checkout | Premium CTA → Stripe Checkout → redirect back → is_premium=true |
| PWA | Manifest loads, install prompt shown |
| Mobile navigation | Bottom tabs → все разделы доступны |

---

## CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
```

### Pipeline правила

- PR не мержится без зелёных тестов
- Астро-тесты (100+) запускаются при каждом push
- E2E запускается на main и PR'ах
- Lighthouse CI (performance ≥ 90) на каждом деплое

---

## UX-тестирование

### Автоматизированное (E2E / Playwright)

| Тест | Что проверяем |
|------|---------------|
| Touch target size | Все интерактивные элементы >= 44×44px (проверка через `boundingBox()`) |
| `prefers-reduced-motion` | При эмуляции `reduce` — нет CSS transitions > 0ms, нет Framer Motion анимаций |
| Контраст тёмной темы | Primary text >= 4.5:1, secondary >= 3:1 (через axe-core) |
| Form validation UX | Inline ошибки появляются на blur, фокус переходит на первое невалидное поле при submit |
| Empty states | Все пустые состояния имеют CTA (нет сохранённых карт, город не найден, нет результатов) |
| Keyboard navigation | Tab через все интерактивные элементы, Enter активирует, Escape закрывает модалки |

### Ручное (перед релизом)

| Тест | Что проверяем |
|------|---------------|
| Mobile 375px | Нет горизонтального скролла, контент не обрезан, bottom nav корректен |
| VoiceOver / TalkBack | Screen reader корректно читает карту через таблицу-fallback |
| Slow network (3G) | Skeleton screens появляются, UI не блокируется |
| Reduced motion | Анимации отключены, UI функционален |

---

## Верификация астрологических расчётов (Beta)

| Метод | Описание | Кто |
|-------|----------|-----|
| Автотесты | 100+ эталонных карт (серверный API) | CI/CD |
| LLM-верификация | Claude сверяет расчёты с эталонными данными Astro.com | Автоматически |
| Ручная сверка | 10 карт с Astro.com | Разработчик |
| Community фидбэк | Публикация в Reddit/Telegram сидерических сообществ | До запуска |
| Форма обратной связи | «Результат отличается от ожидаемого?» | В UI |
| Прозрачность | «Swiss Ephemeris v2.10 \| Lahiri» в UI | Автоматически |

---

## Performance Budget

| Метрика | Цель | Инструмент |
|---------|------|-----------|
| Lighthouse Performance | ≥ 90 | Lighthouse CI |
| First Contentful Paint | < 1.5s | Web Vitals |
| Largest Contentful Paint | < 2.5s | Web Vitals |
| Time to Interactive | < 3.5s | Web Vitals |
| Cumulative Layout Shift | < 0.1 | Web Vitals |
| Chart API response | < 500ms (server calculation + network) | Custom metric |
| Bundle size (initial) | < 200KB (gzip) | Bundle analyzer |
