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
| Ayanamsa переключение | 3× на карту | Lahiri, Fagan-Bradley, Krishnamurti — разные результаты |
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
| API: POST /api/chart/calculate | Полный flow: input → расчёт → response |
| API: GET /api/feed/solar | NASA DONKI integration (mock API) |
| API: GET /api/feed/earthquake | USGS integration (mock API) |
| DB: create/read NatalChart | Prisma queries + encryption |
| DB: create/read User | Clerk webhook → user creation |
| Auth: protected routes | Clerk middleware blocks unauthenticated |
| Rate limiting | Upstash rate limiter enforces limits |

---

## E2E Tests (Playwright)

| Флоу | Шаги |
|------|------|
| Расчёт карты (гость) | Landing → ввод даты → карта показана → toggle sidereal/tropical |
| Регистрация | Карта → «Сохранить» → Clerk signup → карта сохранена |
| Чтение эссе | Карта → клик на планету → эссе открывается → скроллинг |
| Лунный календарь | Навигация → календарь → текущая фаза видна |
| Offline mode | Disconnect → расчёт карты → результат показан |
| PWA install | Prompt shown → install → standalone window |
| Mobile navigation | Bottom tabs → все разделы доступны |
| i18n | Switch EN → ES → UI переведён |

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

## Верификация астрологических расчётов (Beta)

| Метод | Описание | Кто |
|-------|----------|-----|
| Автотесты | 100+ эталонных карт | CI/CD |
| Ручная сверка | 10 карт с Astro.com | Разработчик |
| Beta-тестирование | 50 астрологов проверяют свои карты | Сообщество |
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
| WASM load time | < 1s | Custom metric |
| Chart calculation | < 500ms | Custom metric |
| Bundle size (initial) | < 200KB (gzip) | Bundle analyzer |
