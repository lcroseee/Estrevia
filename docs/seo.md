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

### Ключевой принцип

**Каждое эссе = отдельная индексируемая страница.** 120 эссе = 120 посадочных страниц для органического трафика.

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
    alternates: {
      languages: { en: `/en/essays/${params.slug}`, es: `/es/essays/${params.slug}` },
    },
  };
}
```

### Обязательные элементы

| Элемент | Реализация |
|---------|-----------|
| `<title>` | Уникальный на каждой странице, ≤ 60 символов |
| `meta description` | Уникальный, ≤ 155 символов |
| `hreflang` | EN + ES alternate links |
| `canonical` | На каждой странице |
| `og:image` | Динамическая генерация через `next/og` |
| `robots.txt` | Allow all, disallow /api/ |
| `sitemap.xml` | Автоматическая через Next.js |
| Structured data | JSON-LD: Article (эссе), FAQPage (sidereal vs tropical) |

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

```
Pillar: "Sidereal vs Tropical"
  ├── → /essays/sun-in-aries  (linked in text)
  ├── → /essays/moon-in-scorpio
  ├── → /signs/aries
  └── → /chart (CTA: calculate yours)

Essay: "Sun in Sidereal Aries"
  ├── → /signs/aries
  ├── → /planets/sun
  ├── → /sidereal-vs-tropical
  └── → /chart (CTA: calculate yours)
```

---

## Метрики SEO

| Метрика | Инструмент | Цель (6 мес.) |
|---------|-----------|--------------|
| Indexed pages | Google Search Console | 150+ |
| Organic traffic | GSC + PostHog | 5,000 visits/мес |
| Top 10 rankings | GSC | 20+ keywords |
| Avg. position (sidereal) | GSC | < 5 |
| Click-through rate | GSC | > 3% |
| Core Web Vitals | GSC + Lighthouse | All green |

---

## Чего НЕ делать

- ❌ Keyword stuffing
- ❌ Скрытый текст
- ❌ Duplicate content между EN и ES (hreflang решает)
- ❌ Тонкий контент (< 200 слов на страницу)
- ❌ Копирование текстов конкурентов
- ❌ Автоматическая генерация тысяч страниц без value
