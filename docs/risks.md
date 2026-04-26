# Риски и Kill Criteria

## Ключевые риски

| # | Риск | Вероятн. | Влияние | Митигация |
|---|------|----------|---------|-----------|
| 1 | **Рынок слишком нишевой** | Средняя | Критическое | MVP валидация до инвестиций. Kill criteria через 3 мес. |
| 2 | **Co-Star скопирует сидерическую** | Низкая | Среднее | Moat = эзотерика + community + глубина. Co-Star «попсовый» |
| 3 | **Техническая сложность** | Высокая | Среднее | Модульность. Постепенный релиз. Swiss Ephemeris решает core |
| 4 | **Бурн-аут фаундера** | Высокая | Критическое | Жёсткий MVP scope. Поиск ко-фаундера. Не строить всё сразу |
| 5 | **Лицензия контента** | Средняя | Среднее | Только PD для MVP. Ранние переговоры с авторами для Фазы 2 |
| 6 | **Swiss Ephemeris серверный API медленный** | Низкая | Среднее | sweph Node.js native — расчёт ~50ms. Vercel Fluid Compute переиспользует инстансы |
| 7 | **Solo-разработчик: burnout** | Средняя | Высокое | AI-assisted development (Claude Code) значительно снижает риск. Жёсткий MVP scope. Итеративный подход |
| 8 | **Meta Ads не конвертят** | Средняя | Среднее | Organic first. Reddit/TikTok как основной канал |
| 9 | **OTO предъявит претензии по PD текстам** | Низкая | Высокое | Использовать только тексты до 1929. Юрист на retainer |
| 10 | **Точность расчётов вызовет споры** | Средняя | Высокое | 100+ автотестов. LLM-верификация. Community фидбэк (Reddit/Telegram). Прозрачность источника |
| 11 | **Cold start убивает онбординг** | Средняя | Высокое | Neon wake-up (~1s) + Drizzle (7KB, минимальный cold start). Митигация: warm-up ping при загрузке Landing, анимация расчёта. Vercel Fluid Compute переиспользует инстансы |
| 12 | **Placidus ломается на полярных широтах** | Низкая | Среднее | Placidus не работает > 66.5° (Мурман��к, Исландия, Тромсё). Fallback: Whole Sign houses + UI-предупреждение |
| 14 | **Abuse: scraping, CDN spam, offensive display_name** | Средняя | Низкое | Rate limiting, display_name sanitization, CDN cache limits. См. security.md |
| 15 | **Ключ шифрования утерян/удалён** | Низкая | Критическое | Все зашифрованные данные нечитаемы. Бэкап ключа в 1Password/vault. Проверка: weekly backup verification |

---

## Kill Criteria (когда остановиться)

> Честность с собой — ключ к успеху. Kill criteria — не провал, а данные для пивота.

Если через **3 месяца после запуска MVP**:

| Сигнал | Порог | Что означает |
|--------|-------|-------------|
| D30 retention < 10% | Критический | Продукт не держит людей. Нет core value |
| < 500 регистраций | Критический | Нет достаточного интереса (включая платные каналы). 500 за 3 мес. — минимальный порог |
| Conversion < 1% | Критический | Люди не готовы платить за это |
| NPS < 20 | Серьёзный | Продукт не вызывает энтузиазма |
| 0 виральных shares з�� первый месяц | Серьёзный | Viral loop не работает ��� нужно пересмотреть share UX |

> **Примечание к kill criteria:** Цель — 5,000 регистраций за 3 месяц��, но это амбициозный сценарий. Реалистичная цель — 1,000. Kill criteria привязан к минимуму (500) с учётом как органических, так и платных каналов (Meta Ads). Если регистрац��и 300-1000, но retention > 20% — продукт нужен, проблема в каналах привлечения, не в продукте.

### Варианты при провале Kill Criteria

| Если... | Возможный пивот |
|---------|----------------|
| Retention низкий, но регистрации высокие | Проблема в onboarding. Упростить первый опыт |
| Регистрации низкие, но retention высокий | Проблема в marketing. Сменить каналы/messaging |
| Всё низкое | Продукт не нужен в таком виде. Пивот на B2B (API для астрологов) или education |
| Conversion низкий, но engagement высокий | Ценность есть, но не в premium. Пересмотреть что за paywall |

---

## Операционные риски

| Риск | Митигация |
|------|-----------|
| **Vercel downtime** | Статичные страницы через CDN. Мониторинг через PostHog + Sentry |
| **Neon PostgreSQL data loss** | Ежедневные бэкапы. Point-in-time recovery |
| **Claude API unavailable** | Контент pre-generated и кэширован. API нужен только для нового контента |
| **NASA API deprecated** | Кэш последних данных. Альтернативные источники (ESA) |
| **AGPL violation (Swiss Ephemeris)** | Код Estrevia открыт под AGPL-3.0 — полностью совместим с лицензией Swiss Ephemeris |
| **DDoS / abuse** | Cloudflare DNS + protection. Rate limiting (Upstash) |

---

## Мониторинг рисков

| Метрика | Инструмент | Порог тревоги |
|---------|-----------|--------------|
| Uptime | Vercel + Better Uptime | < 99.5% |
| Error rate | PostHog + Sentry | > 1% requests |
| Расчёт точность | CI/CD тесты | Любое отклонение > 0.01° |
| Churn rate | PostHog cohorts | > 15% monthly |
| CAC | PostHog + Meta Ads Manager | > LTV/3 |
| Burn rate | Spreadsheet | > 2× MRR |

---

## Bandwidth протокол: что выкидываем при перегрузе

> Соло-фаундер имеет 40-60 продуктивных часов/неделю. Полный backlog (продукт + контент + agent build + content marketing + customer ops) превышает это. Когда bandwidth crunch — следующий приоритет:

### Priority order (top → cut last)

1. **Продукт MVP** — без него нет бизнеса
2. **Customer support** — без него churn убьёт всё
3. **Advertising agent (build phase)** — 2 недели один раз, потом autonomous
4. **120 эссе (контент)** — Claude-assisted, batch-able
5. **Founder ops** (legal, finance) — batch monthly, 1 day/мес
6. **Reddit engagement** — 1 hr/нед минимум
7. **Influencer outreach** — batch 1 утро/нед
8. **TikTok organic** (1/день per `marketing.md`) — **первое на сокращение** до 3/нед
9. **Twitter/X** — на паузу до Phase 2

### Triggers сокращения

| Симптом | Что выкидываем |
|---------|---------------|
| Sleep < 6 hr/ночь стабильно | TikTok → 1/нед, Reddit → 1/2 нед |
| Не успеваем код-ревью продукта | Influencer outreach на паузу |
| Customer support backlog > 24h | TikTok stop, agent работает на pre-rolled креативах |
| Burnout signals (irritability, brain fog) | Forced 2-day break, no exceptions |

### Что НЕ сокращаем никогда

- Customer support response (даже если 24h delay — отвечать)
- Sleep < 6 hrs (неустойчиво на горизонте недель)
- Health (exercise, food)

### Recovery math

- 1 burnout-driven crash = 7-14 days lost
- 1 preventive break (Sunday-Monday off) = 2 days но prevents crash
- Prevention wins математически

См. также Risk #4 «Бурн-аут фаундера» и Risk #7 «Solo-разработчик: burnout» выше — этот протокол их operational митигация.
