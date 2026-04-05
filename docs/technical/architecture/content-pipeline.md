# Content Pipeline: как эссе создаются и доставляются

---

## Простыми словами

У нас 120 комбинаций (10 планет × 12 знаков) + 12 знаков + 10 планет + 12 домов + несколько служебных = **~174 текста (EN)**. Они генерируются Claude API **один раз** до запуска, проверяются, и хранятся как MDX-файлы в репозитории. При открытии страницы — текст уже отрендерен сервером и закэширован на CDN.

---

## Pipeline: от идеи до экрана

```
ГЕНЕРАЦИЯ (разовая, до запуска)
══════════════════════════════

  ┌───────────────┐     ┌────────────────┐     ┌──────────────┐
  │ System Prompt  │────▶│ Claude Sonnet  │────▶│ 120 текстов  │
  │               │     │   4.6          │     │ (EN, ~400    │
  │ "Ты сидерич. │     │               │     │  слов каждый)│
  │  астролог..." │     │ × 120 вызовов │     │             │
  │ + 777 context │     │ ~$2 total     │     └──────┬───────┘
  └───────────────┘     └────────────────┘            │
                                                      │
                                               ┌──────▼───────┐
                                               │ Fact-check    │
                                               │ (Claude Haiku)│
                                               │               │
                                               │ "Проверь 777  │
                                               │  соответствия"│
                                               │               │
                                               │ → PASS (90%)  │
                                               │ → REVIEW (10%)│
                                               └──────┬───────┘
                                                      │
                                               ┌──────▼───────┐
                                               │ Beta review   │
                                               │ 50 астрологов │
                                               │ → Правки      │
                                               └──────┬───────┘
                                                      │
                                               ┌──────▼───────┐
                                               │ MDX файлы     │
                                               │ в репозиторий │
                                               └──────────────┘

ДОСТАВКА (runtime)
══════════════════

  Пользователь: /essays/sun-in-pisces
       │
       ▼
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │ Vercel   │────▶│ Next.js  │────▶│ Браузер  │
  │ CDN      │     │ ISR      │     │          │
  │          │     │          │     │ MDX →    │
  │ Кэш 24ч │     │ MDX →    │     │ React    │
  │ Глобально│     │ HTML     │     │ компонент│
  └──────────┘     └──────────┘     └──────────┘
```

---

## Формат MDX файла

```
content/essays/en/sun-in-pisces.mdx
```

```mdx
---
planet: "sun"
sign: "pisces"
system: "sidereal"
title: "Sun in Sidereal Pisces"
description: "The sidereal Sun in Pisces dissolves the boundaries..."
correspondences_777:
  hebrew_letter: "Qoph"
  tarot: "The Moon (XVIII)"
  path: "29th Path"
  element: "Water"
  color: "Crimson (ultra violet)"
keywords: ["dissolution", "compassion", "transcendence", "illusion"]
last_verified: "2026-04-15"
verified_by: "beta_tester_42"
---

# Sun in Sidereal Pisces

The Sun's journey through sidereal Pisces marks a period of 
dissolution and transcendence...

## Архетипическое значение

[300-500 слов эссе]

## Проявление в жизни

[Конкретные описания]

## Тень и вызов

[Негативные проявления]

## Эзотерическое соответствие

По Liber 777: Qoph (☽), XVIII Аркан The Moon, 29-й путь на Древе Жизни...

## Медитация

[Краткая практика]

---

*Расчёты: Swiss Ephemeris | Ayanamsa: Lahiri*
*Астрология не является медицинским или финансовым советом.*
```

---

## Структура файлов

```
content/
├── LICENSE                    # Proprietary (не AGPL!)
├── essays/
│   └── en/
│       ├── sun-in-aries.mdx
│       ├── sun-in-taurus.mdx
│       ├── ...                # 120 файлов
│       └── pluto-in-pisces.mdx
├── signs/
│   └── en/                    # 12 описаний знаков
├── planets/
│   └── en/                    # 10 описаний планет
└── houses/
    └── en/                    # 12 описаний домов
```

**Всего: ~174 MDX файла (EN only), ~2.5MB контента.**

> Editorial style guide: см. `docs/editorial-style-guide.md`.

---

## Free vs Premium контент

| Контент | Free | Star ($9.99) |
|---------|------|-------------|
| Эссе: Солнце в знаке | ✅ | ✅ |
| Эссе: Луна в знаке | ✅ | ✅ |
| Эссе: Восходящий в знаке | ✅ | ✅ |
| Эссе: остальные 7 планет | Превью (1 абзац) | ✅ Полный текст |
| Описания знаков | ✅ | ✅ |
| Описания планет | ✅ | ✅ |
| Описания домов | ❌ | ✅ |

**Логика:** бесплатно = big three (Солнце, Луна, Восходящий). Это 36 эссе. Достаточно, чтобы показать ценность. Остальные 84 = paywall.

Реализация: MDX frontmatter `access: "free" | "premium"`. Middleware проверяет `user.is_premium`.

---

## Обновление контента

**MVP:** контент = MDX в git. Обновление = PR → merge → auto-deploy. Подходит для 1-2 авторов.

**Фаза 2:** миграция в headless CMS (Sanity или Notion) для:
- Non-dev авторов (астрологи, переводчики)
- Обновления без deploy
- Scheduling (запланированные публикации)
- Preview + approval workflow
