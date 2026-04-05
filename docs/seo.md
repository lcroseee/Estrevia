# SEO Стратегия

> Астрология — поисковый рынок. Люди гуглят «my natal chart», «sidereal vs tropical», «moon in scorpio meaning». Органический трафик = бесплатные пользователи.

---

## Целевые ключевые слова

### Высокий приоритет (MVP)

| Кластер | Ключевые слова | Объём (мес.) | Конкуренция |
|---------|---------------|-------------|-------------|
| Сидерическая карта | sidereal natal chart, sidereal birth chart calculator, sidereal astrology chart | 5K-15K | Низкая-средняя |
| Sidereal vs tropical | sidereal vs tropical astrology, what is sidereal astrology, true zodiac sign | 10K-30K | Средняя |
| Лунный календарь | moon phase today, moon calendar, what sign is the moon in | 50K-100K | Высокая |
| Позиции планет | moon in scorpio, sun in pisces sidereal, saturn in aquarius meaning | 5K-20K (каждый) | Средняя |

### Средний приоритет (Фаза 2)

| Кластер | Ключевые слова | Объём |
|---------|---------------|-------|
| Совместимость | astrology compatibility, synastry chart, zodiac compatibility | 50K-100K |
| Эзотерика | tree of life astrology, kabbalah zodiac, 777 correspondences | 1K-5K |
| Планетарные часы | planetary hours today, what planetary hour is it | 5K-10K |

---

## Структура страниц (SEO-оптимизированная)

### Статические страницы (ISR / SSG)

| URL | Title | Описание |
|-----|-------|----------|
| `/` | ESTREVIA — Sidereal Astrology & Real Astronomy | Landing page, hero + калькулятор |
| `/sidereal-vs-tropical` | Sidereal vs Tropical Astrology: What's the Difference? | Образовательная long-form страница |
| `/moon-calendar` | Moon Calendar 2026 — Current Phase & Sign | Лунный календарь (обновляется ISR) |
| `/planetary-hours` | Planetary Hours Today — Real-Time Calculator | Планетарные часы |
| `/essays/sun-in-aries` | Sun in Sidereal Aries — Meaning & Interpretation | 120 страниц эссе |
| `/signs/aries` | Aries in Sidereal Astrology | 12 страниц знаков |
| `/planets/saturn` | Saturn in Sidereal Astrology | 10 страниц планет |
| `/s/[id]` | [Name]'s Real Sign is ♓ Pisces — Find Yours | Viral share page. Dynamic OG image. Noindex (не индексировать, это user-generated) |

### Ключевой принцип

**Каждое эссе = отдельная индексируемая страница.** 120 эссе = 120 посадочных страниц для органического трафика.

### Таблицы эфемерид на страницах эссе

Каждая страница эссе содержит **таблицу эфемерид**: даты входа/выхода планеты в сидерический знак на 5 лет. Эти данные рассчитываются через Swiss Ephemeris.

**Pipeline:**
1. **Build-time скрипт** (`scripts/generate-ephemeris-tables.ts`): при сборке вызывает sweph для каждой комбинации планета × знак, генерирует JSON с датами переходов
2. Результат кэшируется в `src/modules/esoteric/data/ephemeris-tables.json` (~50KB)
3. Пересчёт: раз в год (или при обновлении sweph) — даты переходов не меняются часто
4. Страницы эссе импортируют JSON статически — **нет серверного вызова при ISR revalidation**

> Это важно для SEO: таблицы эфемерид = уникальные данные, которые Google индексирует. Structured data (table markup) повышает шансы на featured snippet.

---

## Техническая SEO

### Next.js Metadata API

```typescript
// app/essays/[slug]/page.tsx
export async function generateMetadata({ params }) {
  const essay = getEssay(params.slug);
  return {
    title: `${essay.planet} in Sidereal ${essay.sign} — ESTREVIA`,
    description: essay.excerpt,
    openGraph: {
      title: essay.title,
      description: essay.excerpt,
      images: [{ url: `/og/essay/${params.slug}` }],
    },
    // alternates: Фаза 2 (ES переводы)
    // languages: { en: `/en/essays/${params.slug}`, es: `/es/essays/${params.slug}` },
  };
}
```

### Обязательные элементы

| Элемент | Реализация |
|---------|-----------|
| `<title>` | Уникальный на каждой странице, ≤ 60 символов |
| `meta description` | Уникальный, ≤ 155 символов |
| `hreflang` | EN only (MVP). EN + ES — Фаза 2 |
| `canonical` | На каждой странице |
| `og:image` | Динамическая генерация через `next/og` |
| `robots.txt` | Конфигурация ниже |
| `sitemap.xml` | Автоматическая через Next.js |
| Structured data | JSON-LD: типы ниже в секции Schema Markup |

### Schema Markup (JSON-LD)

Каждая страница содержит structured data соответствующего типа:

| Тип Schema | Где используется | Описание |
|------------|-----------------|----------|
| `Article` | Страницы эссе (`/essays/[slug]`) | Контент эссе: автор, дата, описание |
| `FAQPage` | Эссе + pillar pages | FAQ блок внизу каждой страницы |
| `HowTo` | `/guide/sidereal-astrology` | "How to read your natal chart" |
| `SoftwareApplication` | Landing page (`/`) | Estrevia как PWA: категория, рейтинг, ОС |
| `Organization` | Все страницы (через layout) | Estrevia: логотип, URL, social links |

На страницах эссе: `Article` + `FAQPage` совмещённые. На pillar pages: `Article` + `FAQPage` + `HowTo`.

### robots.txt

```
User-agent: *
Disallow: /api/
Disallow: /s/          # share pages (noindex already, but block crawl too)
Allow: /api/og/         # allow OG image crawling
Sitemap: https://estrevia.app/sitemap.xml
```

Share-страницы `/s/[id]` — user-generated контент, не для индексации. Но OG-картинки должны быть доступны краулерам для превью в мессенджерах.

### Canonical Tags

| Тип страницы | Canonical | Поведение |
|-------------|-----------|-----------|
| Эссе | `https://estrevia.app/essays/[slug]` | Self-referencing canonical |
| Знаки | `https://estrevia.app/signs/[sign]` | Self-referencing canonical |
| Share pages | Нет canonical | `noindex, nofollow` (мета-тег) |
| Все остальные | Self-referencing | URL без query parameters |

**Правило:** URL parameters не должны создавать дубликаты. Если есть параметры фильтрации/сортировки — canonical указывает на чистый URL без параметров.

### Image SEO

- **OG-картинки:** описательный alt text (например, «Sun in Sidereal Pisces — natal chart interpretation»), размеры `1200×630` объявлены в meta тегах
- **Chart SVG:** `aria-label` на каждом элементе (уже специфицировано в [accessibility.md](./accessibility.md) и [chart-rendering.md](./technical/architecture/chart-rendering.md))
- **Все изображения:** `loading="lazy"` кроме above-the-fold, `width`/`height` указаны для предотвращения CLS

### Open Graph Images (динамические)

Для каждого эссе — генерировать OG-картинку через `next/og`:

```
┌─────────────────────────────────┐
│  ☀ Sun in Sidereal Aries       │
│                                 │
│  ♈ 15°42'                      │
│                                 │
│  ESTREVIA                       │
└─────────────────────────────────┘
```

Тёмный фон, планетарный цвет, глиф — consistent branding в социальных шарах.

---

## Featured Snippet оптимизация

Цель: попасть в featured snippet по запросам «What does [planet] in [sign] mean in sidereal astrology?»

| Элемент | Требование |
|---------|-----------|
| Первый абзац | Прямой ответ на вопрос (40-60 слов), без вводных фраз |
| Таблица сравнения | Sidereal vs Tropical даты для каждого знака (Google любит таблицы) |
| FAQ | 3-5 вопросов внизу pillar pages (увеличивает шанс на People Also Ask) |
| Числа и даты | Конкретные градусы, даты переходов — AI и Google цитируют факты |

---

## Topic Cluster стратегия

```
Pillar: "Sidereal Astrology Guide" (/guide/sidereal-astrology)
├── Cluster: "Sun in [each sign]" (12 pages)
├── Cluster: "Moon in [each sign]" (12 pages)
├── Cluster: "[Planet] in [sign]" (grouped by planet)
├── Cluster: "Sidereal vs Tropical [sign]" (12 pages)
└── Cluster: "What is [concept]" (ayanamsa, houses, aspects)
```

Каждая cluster page ссылается на pillar, pillar ссылается на все cluster pages. Это создаёт topical authority в глазах Google.

---

## Контент-стратегия для SEO

### Pillar Pages (длинные)

| Страница | Слов | Тип |
|----------|------|-----|
| Sidereal vs Tropical | 3,000-5,000 | Образовательная, FAQ |
| What is Sidereal Astrology | 2,000-3,000 | Образовательная |
| Moon Calendar Guide | 2,000 | Утилитарная |

### Cluster Pages (короткие)

| Тип | Количество | Слов каждая |
|-----|-----------|-------------|
| Эссе по позициям | 120 | 300-500 |
| Описания знаков | 12 | 500-800 |
| Описания планет | 10 | 500-800 |
| Описания домов | 12 | 300-500 |

### Internal Linking

**Правило: 3-5 внутренних ссылок на каждое эссе.** Ссылки должны быть контекстуальными (в тексте), не списком внизу.

```
Pillar: "Sidereal vs Tropical"
  ├── → /essays/sun-in-aries  (linked in text)
  ├── → /essays/moon-in-scorpio
  ├── → /signs/aries
  └── → /chart (CTA: calculate yours)

Essay: "Sun in Sidereal Aries"
  ├── → /signs/aries              (страница знака)
  ├── → /planets/sun              (страница планеты)
  ├── → /sidereal-vs-tropical     (pillar page)
  ├── → /essays/moon-in-aries     (тот же знак, другая планета)
  └── → /chart (CTA: calculate yours)
```

| Тип страницы | Ссылается на | Количество |
|-------------|-------------|-----------|
| Эссе | Страница знака + страница планеты + pillar + related essays (тот же знак или планета) | 3-5 |
| Страница знака | Все 10 эссе для этого знака + pillar | 10-12 |
| Страница планеты | Все 12 эссе для этой планеты + pillar | 12-14 |
| Pillar | Все cluster pages + CTA | Все |

---

## AEO (AI Engine Optimization)

> **AEO в 2026 — это как SEO в 2010. First movers в нише владеют ей годами.** В сидерической астрологии структурированного контента почти нет — окно возможностей открыто.

### Что это

Оптимизация контента для цитирования AI-движками (ChatGPT, Perplexity, Claude, Google AI Overviews). Когда пользователь спрашивает "what is sidereal astrology" — AI цитирует estrevia.app как источник.

### Почему это работает для Estrevia

- Сидерическая ниша = почти zero structured content
- У нас уникальные данные (Swiss Ephemeris расчёты, 777 correspondences)
- 120 страниц эссе покрывают 120 конкретных вопросов ("Sun in sidereal Pisces meaning")
- AI парсит таблицы, FAQ, schema markup — всё это у нас есть

### Топ-20 вопросов аудитории (целевые запросы для AI-цитирования)

| Вопрос | Наша страница |
|--------|--------------|
| What is sidereal astrology? | `/sidereal-vs-tropical` |
| What's my real zodiac sign? | `/` (landing + calculator) |
| Sidereal vs tropical which is more accurate? | `/sidereal-vs-tropical` |
| What is Sun/Moon in sidereal [sign]? | `/essays/[planet]-in-[sign]` (×120) |
| What are planetary hours? | `/planetary-hours` |
| What sign is the Moon in today? | `/moon-today` |
| What is the precession of equinoxes? | `/sidereal-vs-tropical` |
| What is Lahiri ayanamsa? | `/sidereal-vs-tropical` (FAQ) |
| What is 777 in Thelema? | `/essays/...` (correspondences block) |
| Is Vedic astrology sidereal? | `/sidereal-vs-tropical` (FAQ) |

### Формат контента для AI-цитирования

**Каждое эссе должно следовать AEO-формату:**

1. **Первый абзац = прямой ответ.** Не "In this article we will explore..." а конкретный факт:
   > "Sun in sidereal Pisces (March 15 — April 13) indicates intuitive, empathetic nature with strong connection to collective unconscious. This differs from tropical Pisces (Feb 19 — Mar 20) by ~24° due to the precession of equinoxes."

2. **FAQ блок** (3-5 вопросов) внизу каждой страницы с JSON-LD FAQPage schema

3. **Таблицы сравнения** — AI парсит таблицы лучше чем прозу:
   > | System | Pisces dates | Sun enters |
   > | Tropical | Feb 19 — Mar 20 | Vernal equinox-based |
   > | Sidereal (Lahiri) | Mar 15 — Apr 13 | Fixed star-based |

4. **Конкретные числа и даты** — AI цитирует факты, не мнения

### Schema markup (JSON-LD)

На каждой странице эссе:

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What does Sun in sidereal Pisces mean?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sun in sidereal Pisces (March 15 — April 13) indicates..."
      }
    },
    {
      "@type": "Question",
      "name": "Is sidereal Pisces the same as tropical Pisces?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Sidereal Pisces is shifted ~24° from tropical due to precession..."
      }
    }
  ]
}
```

На pillar pages (`/sidereal-vs-tropical`): `Article` + `FAQPage` + `HowTo` schema.

### Мониторинг AI-цитирования

| Метод | Частота | Что проверяем |
|-------|---------|--------------|
| Ручной тест: ChatGPT/Perplexity | 2× в месяц | Спрашиваем топ-10 вопросов, проверяем цитируют ли estrevia.app |
| Otterly.ai | Ежедневно (если бюджет) | Автоматический мониторинг AI-цитирования по ключевым запросам |
| Google Search Console | Еженедельно | Трафик с AI Overviews (source = "discover" / "ai-overview") |

### Правила генерации эссе (Claude API prompt)

При генерации 120 эссе через Claude API, system prompt должен включать:

```
Format rules:
1. First paragraph: direct answer to "What does [planet] in sidereal [sign] mean?"
   — include specific dates, degrees, factual claims
   — no filler ("In this article...", "Let's explore...")
2. Include comparison table: tropical vs sidereal dates for this sign
3. Include 777 correspondences: Tarot, Hebrew letter, Color, Stone
4. End with FAQ block: 3-5 questions with concise answers
5. Total length: 300-500 words (concise, not padded)
```

---

## Programmatic SEO

> **Принцип:** Google наказывает AI-текст без уникальной ценности. Наша защита — каждая страница содержит реальные астрономические расчёты (Swiss Ephemeris) + интерактивный калькулятор + 777 correspondences. AI-текст = дополнение (30% страницы), а не основа.

### Что делает страницу «helpful» для Google

Каждая страница эссе (`/essays/sun-in-pisces`) содержит не только текст, но и:

1. **Мини-калькулятор** — "Is YOUR Sun in sidereal Pisces?" → ввод даты → мгновенный ответ (тот же `/api/chart/calculate`)
2. **Таблица эфемерид** — даты входа/выхода планеты в знак на 5 лет (рассчитаны Swiss Ephemeris, этих данных нет на других сайтах)
3. **Сравнение tropical vs sidereal** — "Tropical Pisces: Feb 19 — Mar 20. Sidereal Pisces: Mar 15 — Apr 13"
4. **777 Correspondences** — Tarot, Hebrew letter, Color, Stone (уникальные данные из 777 PD)
5. **Cosmic Passport CTA** — "Get your full Cosmic Passport →"

AI-текст (эссе) дополняет данные, а не заменяет их. Страница полезна даже без эссе.

### Фазированный рост (правило: не масштабировать пока не проиндексировано)

| Фаза | Страницы | Условие запуска | Мониторинг |
|------|----------|-----------------|-----------|
| **MVP** | **~150** | Запуск продукта | GSC: indexation rate, impressions |
| | 120 эссе (planet×sign) + калькулятор на каждой | | |
| | 12 страниц знаков | | |
| | 12 "sidereal vs tropical [sign]" | | |
| | 3 pillar pages + landing | | |
| **Месяц 3-4** | **+1** | indexation > 80% | GSC: organic traffic growth |
| | `/moon-today` — обновляется ежедневно (ISR) | | |
| | Высокий volume: "what sign is the moon in" (50K-100K/мес) | | |
| **Месяц 4-6** | **+78** | indexation > 80%, organic > 2K/мес | GSC: каннибализация |
| | Compatibility pages (Фаза 2, после синастрии) | | |
| | "[sign1] and [sign2] compatibility sidereal" | | |
| **Месяц 6+** | **+500** | indexation > 80%, organic > 5K/мес | GSC: thin content warnings |
| | Planetary hours × city (топ-500 городов) | | |
| | Каждая страница с уникальными sunrise/sunset расчётами | | |

**Правило:** не добавлять новый слой страниц, пока предыдущий не показал > 80% indexation в Google Search Console.

### Риски

| Риск | Митигация |
|------|-----------|
| Google deindexes thin pages | Начать с 150, мониторить GSC. Если indexation < 50% — усилить контент, уменьшить количество |
| AI-текст одинаковый между страницами | Каждое эссе генерируется с уникальным промптом. Проверка: similarity score < 30% между эссе |
| Каннибализация ключевых слов | Чёткая URL-иерархия: `/essays/` для позиций, `/signs/` для знаков, `/compatibility/` для синастрии |
| Город-страницы без трафика | Начать с 50 крупнейших, мониторить CTR, масштабировать только прибыльные |

---

## Метрики SEO

| Метрика | Инструмент | Цель (6 мес.) |
|---------|-----------|--------------|
| Indexed pages | Google Search Console | 150+ (MVP), 250+ (с compatibility) |
| Indexation rate | GSC | > 80% (порог для масштабирования) |
| Organic traffic | GSC + PostHog | 5,000 visits/мес |
| Top 10 rankings | GSC | 20+ keywords |
| Avg. position (sidereal) | GSC | < 5 |
| Click-through rate | GSC | > 3% |
| Core Web Vitals | GSC + Lighthouse | All green |

---

## Чего НЕ делать

- ❌ Keyword stuffing
- ❌ Скрытый текст
- ❌ Duplicate content между языковыми версиями (Phase 2: hreflang решает)
- ❌ Тонкий контент (< 200 слов на страницу)
- ❌ Копирование текстов конкурентов
- ❌ Автоматическая генерация сотен страниц без валидации indexation предыдущих
- ❌ Запуск 500+ страниц на свежем домене с нуля — масштабировать постепенно
- ❌ Страницы где AI-текст = основное содержание (должен быть калькулятор + данные)
