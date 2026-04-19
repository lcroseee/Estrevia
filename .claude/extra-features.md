# Estrevia — Промпты для реализации дополнительных фич

> Каждый промпт ниже — самостоятельная задача для Claude Code / Cursor.
> Порядок соответствует приоритету: сначала то, что влияет на монетизацию и рост, потом — расширение функционала.

---

## 1. Paywall-система с Free Trial и Stripe Billing

```
Ты senior full-stack разработчик. Реализуй paywall-систему для Estrevia — астрологической PWA на Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui.

Стек: Stripe Billing, Clerk (auth), PostgreSQL (Neon) + Drizzle ORM.

## Требования

### Планы подписки
- Free: натальная карта (sidereal/tropical), Cosmic Passport, лунная фаза сегодня
- Pro Monthly: $4.99/мес — все эссе, планетарные часы, лунный календарь, расширенная карта
- Pro Annual: $29.99/год — всё то же, пушить как основной ("just $2.50/mo")

### Free Trial
- 3 дня бесплатно при выборе любого Pro плана
- Автоматическое списание после окончания trial
- Email-напоминание за 24 часа до окончания trial (через Stripe webhook → email)
- Возможность отмены trial в любой момент

### Paywall UX
- Paywall появляется ПОСЛЕ первого вау-момента:
  1. Пользователь вводит данные рождения
  2. Видит свою сидерическую карту бесплатно
  3. Видит что его знак отличается от тропического
  4. Нажимает "Читать подробнее" на эссе → paywall
- Paywall — full-screen modal с:
  - Переключатель Monthly / Annual (Annual выбран по умолчанию, с бейджем "Save 50%")
  - Кнопка "Start Free Trial — 3 days free"
  - Мелкий текст: "Cancel anytime. You won't be charged until [дата]"
  - Список преимуществ Pro с иконками

### Техническая реализация
- Stripe Checkout Session для оформления подписки
- Stripe Customer Portal для управления подпиской (отмена, смена плана)
- Webhook endpoint для обработки событий:
  - customer.subscription.created
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.payment_succeeded
  - invoice.payment_failed
  - customer.subscription.trial_will_end (для email-напоминания)
- Таблица subscriptions в PostgreSQL (Drizzle schema):
  - userId (ref к Clerk user)
  - stripeCustomerId
  - stripeSubscriptionId
  - plan ('free' | 'pro_monthly' | 'pro_annual')
  - status ('trialing' | 'active' | 'canceled' | 'past_due')
  - trialEnd (timestamp)
  - currentPeriodEnd (timestamp)
- Middleware для проверки подписки на защищённых роутах
- React hook useSubscription() для условного рендеринга в компонентах

### Важно
- Цены в USD для всех рынков
- Stripe аккаунт — US-based
- Не использовать Stripe Elements для формы оплаты — только Stripe Checkout (hosted page)
- Обработка ошибок: если webhook не доставлен, фоновая синхронизация статуса подписки каждые 6 часов
```

---

## 2. Cosmic Passport — виральная share-карточка

```
Ты senior full-stack разработчик + дизайнер. Реализуй фичу Cosmic Passport для Estrevia — астрологической PWA на Next.js (App Router) + TypeScript + Tailwind CSS.

## Что такое Cosmic Passport
Красивая карточка с астрологическими данными пользователя, которую хочется сохранить и пошарить в Instagram Stories / WhatsApp / Twitter. Главный виральный механизм приложения.

## Содержимое карточки
- Имя пользователя
- Дата, время и место рождения
- Сидерический Sun sign (основной, крупно) с символом знака
- Сидерический Moon sign
- Сидерический Ascendant (Rising)
- Пометка "Sidereal · Lahiri Ayanamsa"
- Если тропический знак отличается — строка "Tropical: [знак]" мелким шрифтом
- QR-код или короткая ссылка на estrevia.com/passport/[userId]
- Брендинг: логотип Estrevia + слоган "El camino de las estrellas"

## Дизайн карточки
- Размер: 1080x1920px (Instagram Stories) — основной формат
- Дополнительный формат: 1080x1080px (квадрат для постов)
- Тёмный фон с градиентом (deep navy → cosmic purple)
- Звёздное поле на фоне (сгенерировать программно, не изображение)
- Символы знаков — SVG, стилизованные под золото/серебро
- Типографика: современная, чистая, контрастная на тёмном фоне
- Карточка должна выглядеть премиально — это главный маркетинговый актив

## Техническая реализация

### Генерация изображения (серверная)
- Использовать @vercel/og (Satori) для генерации PNG на сервере
- API Route: /api/passport/[userId]/image
- Параметры: format=stories|square, lang=en|es
- Кеширование: CDN cache на 24 часа (revalidate при обновлении данных пользователя)
- Fallback: если данные пользователя неполные, показать только Sun sign

### Страница паспорта
- Route: /passport/[userId] — публичная страница (не требует auth)
- Показывает карточку + CTA "Create your Cosmic Passport" для незарегистрированных
- Open Graph meta-теги с изображением карточки (для превью при шеринге ссылки)
- og:image → /api/passport/[userId]/image?format=square
- og:title → "[Имя]'s Cosmic Passport — Estrevia"
- og:description → "Sidereal [знак] · Moon in [знак] · Rising [знак]"

### Шеринг
- Кнопка "Share" → открывает native Web Share API (navigator.share)
- Fallback для десктопа: кнопки Instagram, WhatsApp, Twitter, Copy Link
- Кнопка "Download" → скачивает PNG
- При шеринге в Instagram Stories: формат 1080x1920
- При шеринге в Twitter/WhatsApp: формат 1080x1080

### Виральная петля
- Когда незарегистрированный пользователь открывает /passport/[userId]:
  - Видит чужой паспорт
  - CTA: "Discover your real sign — Create your Cosmic Passport"
  - Кнопка ведёт на главную / регистрацию
  - После регистрации — автоматически генерируется его паспорт

### Аналитика (PostHog)
- Трекать события:
  - passport_generated
  - passport_shared (с параметром platform: instagram|whatsapp|twitter|copy|download)
  - passport_viewed_by_other (когда кто-то открывает чужой паспорт)
  - passport_converted (когда просмотр чужого паспорта → регистрация)
- Считать K-factor: passport_converted / passport_shared

## Локализация
- Два языка: EN и ES
- Язык карточки определяется по настройке пользователя
- Страница /passport/[userId] — язык определяется по Accept-Language браузера посетителя
```

---

## 3. Мультиязычность (EN / ES)

```
Ты senior full-stack разработчик. Добавь полную поддержку двух языков (English и Español) в Estrevia — PWA на Next.js (App Router) + TypeScript.

## Архитектура i18n

### Подход: next-intl
- Использовать библиотеку next-intl (стандарт для App Router)
- Не использовать подпапки /en/, /es/ в URL — язык определяется по настройке пользователя и хранится в cookie
- Дефолтный язык: EN
- Детекция при первом визите: Accept-Language header → если содержит "es" → ES, иначе EN

### Структура переводов
```
/messages
  /en.json    — английские строки
  /es.json    — испанские строки
```

### Что переводить
1. UI-строки (кнопки, лейблы, навигация, ошибки, paywall) — ~70 строк
2. 120 эссе по планетарным позициям — отдельные JSON-файлы:
   ```
   /content/essays/en/sun-in-aries.json
   /content/essays/es/sun-in-aries.json
   ```
3. Cosmic Passport — текст на карточке
4. Email-шаблоны (trial reminder)
5. SEO: meta title, description, og:tags — на языке пользователя
6. Лунный календарь: названия фаз, знаков

### Переключатель языка
- В header/settings: иконка глобуса → dropdown EN / ES
- Сохранять выбор в:
  1. Cookie (для SSR)
  2. Профиль пользователя в БД (если залогинен, через Clerk metadata)
- При смене языка — страница перерендеривается без перезагрузки

### Нюансы испанского перевода
- Использовать нейтральный латиноамериканский испанский (español neutro)
- Без мексиканизмов, аргентинизмов, колумбианизмов
- Формальное обращение "tú" (не "vos", не "usted")
- Астрологические термины: оставить стандартные (Aries = Aries, не переводить названия знаков)

### Важно
- Все строки вынести в JSON — никакого хардкода текста в компонентах
- Эссе загружать лениво (dynamic import по языку)
- Cosmic Passport: язык карточки = язык владельца, язык страницы = язык посетителя
- Clerk UI: использовать встроенную локализацию Clerk для auth-форм
```

---

## 4. Лунный календарь

```
Ты senior full-stack разработчик + астрологический эксперт. Реализуй лунный календарь для Estrevia — PWA на Next.js + TypeScript + Tailwind + shadcn/ui.

Астро-движок: Swiss Ephemeris (sweph, Node.js native), расчёт на сервере.

## Функционал

### Текущая луна (главный экран)
- Текущая лунная фаза с визуализацией (SVG-анимация луны)
- Процент освещённости
- Знак зодиака в котором Луна (sidereal, с переключателем на tropical)
- Время входа Луны в текущий знак и выхода (транзит)
- Void-of-Course периоды (когда Луна не делает аспектов до смены знака)
- Расстояние до Земли (перигей/апогей)
- Время восхода и захода Луны для локации пользователя

### Календарь (месячный вид)
- Сетка на месяц с иконками фаз для каждого дня
- Цветовая кодировка: New Moon, Waxing, Full Moon, Waning
- При нажатии на день — детали: фаза, знак, аспекты, Void-of-Course
- Выделены ключевые даты: New Moon, Full Moon, затмения
- Навигация по месяцам (swipe на мобильном)

### Уведомления (Pro)
- Push-уведомления через Web Push API:
  - За 1 час до New Moon / Full Moon
  - При входе Луны в знак пользователя (Sun sign или Moon sign)
  - Начало/конец Void-of-Course
- Настройка: какие уведомления включить, время "не беспокоить"

## Техническая реализация

### API Routes
- /api/moon/current — текущая фаза, знак, освещённость
- /api/moon/calendar/[year]/[month] — данные на месяц
- /api/moon/void-of-course/[year]/[month] — VOC периоды
- Все расчёты через Swiss Ephemeris на сервере
- Кеширование: ISR с revalidate каждые 15 минут для /current, 24 часа для /calendar

### Визуализация луны
- SVG-компонент MoonPhase с пропсом illumination (0-1) и phase angle
- Анимация: плавный переход между фазами при скролле календаря
- Тёмная тема: луна светится на тёмном фоне

### Локализация
- Названия фаз: EN / ES
- Названия знаков: стандартные (Aries, Taurus...) на обоих языках
- Формат даты: MM/DD для EN, DD/MM для ES
- Время: 12h для EN (US), 24h для ES

### Доступ
- Free: текущая фаза + знак
- Pro: полный календарь, VOC, уведомления, аспекты
```

---

## 5. Планетарные часы (Real-time)

```
Ты senior full-stack разработчик. Реализуй виджет планетарных часов для Estrevia — PWA на Next.js + TypeScript + Tailwind.

Астро-движок: Swiss Ephemeris (sweph, Node.js native).

## Что такое планетарные часы
Древняя система, делящая светлое и тёмное время суток на 12 неравных "часов", каждый управляемый одной из 7 классических планет (Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon) в халдейском порядке.

## Функционал

### Текущий час
- Какая планета правит прямо сейчас
- Символ и цвет планеты
- Время начала и окончания текущего часа
- Прогресс-бар (сколько осталось)
- Следующие 3 планетарных часа

### Таблица на день
- 12 дневных + 12 ночных часов
- Для каждого: планета-управитель, точное время начала/конца
- Текущий час выделен
- Автообновление при переходе к следующему часу

### Расчёт
- Нужны точное время восхода и захода солнца для локации пользователя
- Дневной час = (закат - восход) / 12
- Ночной час = (следующий восход - закат) / 12
- Первый час дня определяется днём недели:
  - Sunday → Sun, Monday → Moon, Tuesday → Mars, Wednesday → Mercury,
    Thursday → Jupiter, Friday → Venus, Saturday → Saturn
- Далее по халдейскому порядку: Saturn → Jupiter → Mars → Sun → Venus → Mercury → Moon → repeat

### Техническая реализация
- API Route: /api/planetary-hours?lat=X&lng=Y&date=YYYY-MM-DD
- Восход/закат рассчитывать через Swiss Ephemeris (swe_rise_trans)
- Геолокация: запросить через browser Geolocation API, сохранить в профиле
- Fallback: ручной ввод города (geocoding через OpenStreetMap Nominatim API)
- Клиентский таймер: обновление текущего часа каждую секунду (requestAnimationFrame)
- Кеширование: данные на день кешируются в localStorage

### UI
- Компактный виджет для dashboard
- Полноэкранный вид с таблицей
- Цветовая схема планет:
  - Saturn: #7C7C7C, Jupiter: #4169E1, Mars: #DC143C,
    Sun: #FFD700, Venus: #32CD32, Mercury: #FFA500, Moon: #C0C0C0

### Доступ
- Free: текущий планетарный час
- Pro: таблица на день, уведомления при смене часа
```

---

## 6. Синастрия (Phase 2)

```
Ты senior full-stack разработчик + астролог. Реализуй модуль синастрии (совместимости) для Estrevia — PWA на Next.js + TypeScript + Tailwind + shadcn/ui.

Астро-движок: Swiss Ephemeris (sweph, Node.js native).

## Что такое синастрия
Сравнение натальных карт двух людей для оценки совместимости. Анализируются аспекты между планетами одного и другого человека.

## Функционал

### Ввод данных
- Пользователь вводит данные второго человека (имя, дата, время, место рождения)
- Или выбирает из сохранённых профилей (Partner, Friend, Family — до 5 на Free, безлимит на Pro)
- Время рождения необязательно — если нет, расчёт без Ascendant и домов

### Совместимость (результат)
- Общий скор совместимости (0-100%) — визуально, круговая диаграмма
- Breakdown по категориям:
  - Emotional Connection (Moon-Moon, Moon-Venus аспекты)
  - Communication (Mercury-Mercury аспекты)
  - Passion (Mars-Venus, Mars-Mars аспекты)
  - Long-term Stability (Saturn аспекты)
  - Growth (Jupiter аспекты)
- Для каждой категории: скор + короткое описание

### Bi-wheel карта
- Две натальные карты наложены друг на друга
- Внутреннее колесо: Person 1, внешнее: Person 2
- Линии аспектов между планетами двух карт:
  - Conjunction (0°) — синий
  - Trine (120°) — зелёный
  - Sextile (60°) — голубой
  - Square (90°) — красный
  - Opposition (180°) — оранжевый
- Орбисы: Conjunction ±8°, Trine ±6°, Square ±6°, Sextile ±4°, Opposition ±8°

### Подробный анализ (Pro)
- Список всех межкарточных аспектов с описаниями
- AI-сгенерированный текст совместимости (Claude API):
  - Промпт: "Given these synastry aspects: [список], write a 300-word compatibility analysis in [en/es]. Focus on practical relationship dynamics, not predictions. Tone: warm, insightful, balanced."
  - Кешировать результат в БД (одна пара = один анализ, regenerate по запросу)

### Шеринг
- "Share Compatibility" — генерирует карточку 1080x1080:
  - Имена обоих + общий скор + breakdown
  - QR/ссылка на estrevia.com/synastry/[id]
- Публичная страница с результатом (без полных данных рождения — только имена и скор)

## Техническая реализация

### Database schema (Drizzle)
- Таблица saved_profiles: userId, name, birthDate, birthTime (nullable), birthPlace, lat, lng
- Таблица synastry_results: userId, profile1Id, profile2Id, aspects (JSONB), scores (JSONB), aiAnalysis (text), lang, createdAt
- Индекс: userId + profile2Id для быстрого поиска

### API Routes
- POST /api/synastry/calculate — принимает данные двух людей, возвращает аспекты и скоры
- POST /api/synastry/analysis — генерирует AI-анализ (Pro only)
- GET /api/synastry/[id] — публичный результат для шеринга

### Расчёт скора
- Каждый аспект имеет вес:
  - Conjunction: +10 (гармоничные планеты) или -5 (сложные)
  - Trine: +8
  - Sextile: +5
  - Square: -6
  - Opposition: -3 (может быть притяжение)
- Нормализация в 0-100% с sigmoid функцией
- Веса по категориям задать в конфиге (не хардкодить)

### Доступ
- Free: 1 синастрия/день, общий скор + breakdown, без AI-анализа
- Pro: безлимит, полный анализ, AI-текст, bi-wheel карта
```

---

## 7. Thoth Tarot (Phase 2)

```
Ты senior full-stack разработчик + эзотерик. Реализуй модуль Thoth Tarot для Estrevia — PWA на Next.js + TypeScript + Tailwind + shadcn/ui.

## Контекст
Таро Тота — колода Алистера Кроули, иллюстрированная Леди Фридой Харрис. 78 карт. Каждая карта связана с Древом Жизни (Каббала), астрологическими соответствиями и еврейскими буквами (система 777).

ВАЖНО: изображения оригинальных карт — под копирайтом. Использовать собственные AI-сгенерированные иллюстрации (Stability AI) или абстрактные SVG-представления.

## Функционал

### Расклады
- Daily Card — одна карта на день
- Three Card Spread — прошлое / настоящее / будущее
- Celtic Cross — 10 карт (Pro)
- Каждый расклад:
  - Анимация перемешивания и вытягивания
  - Карта может выпасть прямо или перевёрнуто (reversed)
  - Значение карты: ключевые слова + развёрнутое описание
  - Связь с натальной картой пользователя (если есть)

### Каталог карт (энциклопедия)
- Все 78 карт с описаниями
- Для каждой карты:
  - Название (EN/ES)
  - Номер и масть (Major Arcana / Wands / Cups / Swords / Disks)
  - Ключевые слова (прямая + перевёрнутая позиция)
  - Астрологическое соответствие (по Кроули):
    - Major Arcana → планеты/знаки
    - Minor Arcana → деканаты
    - Court Cards → элементы
  - Каббалистическое соответствие: путь на Древе Жизни, еврейская буква
  - Соответствие из Liber 777
  - Развёрнутое описание (2-3 абзаца)

### AI-интерпретация расклада (Pro)
- Claude API генерирует интерпретацию всего расклада в контексте:
  - Промпт: "Interpret this Thoth Tarot [spread type] reading: [позиции и карты]. The querent's sidereal Sun is [sign], Moon is [sign]. Provide a cohesive interpretation in [en/es], connecting the cards to each other and to the querent's natal chart. Tone: mystical but grounded, insightful. 400 words max."
- Кешировать НЕ нужно — каждое чтение уникально

### Связь с астрологией
- На странице каждой карты: "This card corresponds to [астро-соответствие]. In your chart, this energy is expressed through your [планета] in [знак]."
- В расклады подтягивать натальные данные пользователя для персонализации

## Техническая реализация

### Data model
```
/content/tarot/
  major-arcana.json    — 22 карты
  wands.json           — 14 карт
  cups.json            — 14 карт
  swords.json          — 14 карт
  disks.json           — 14 карт
```

Каждая карта:
```json
{
  "id": "the-fool",
  "number": 0,
  "name": { "en": "The Fool", "es": "El Loco" },
  "suit": "major",
  "keywords": {
    "upright": { "en": ["innocence", "freedom", "originality"], "es": [...] },
    "reversed": { "en": ["recklessness", "risk", "folly"], "es": [...] }
  },
  "astrology": "Air / Uranus",
  "hebrew_letter": "Aleph",
  "tree_of_life_path": "11 (Kether → Chokmah)",
  "liber_777": { "column": "VI", "value": "Air" },
  "description": { "en": "...", "es": "..." },
  "image": "/tarot/the-fool.svg"
}
```

### Рандомизация
- Использовать crypto.getRandomValues() для честного рандома
- Сохранять Daily Card в БД привязанной к userId + дате (одна карта в день)

### Анимация
- Framer Motion для анимации карт
- Перемешивание: карты двигаются хаотично → собираются в стопку
- Вытягивание: карта поднимается, переворачивается
- Reversed: карта поворачивается на 180° после открытия

### Изображения карт
- Сгенерировать 78 SVG-иллюстраций в абстрактном стиле
- Или: placeholder-дизайн с символом, номером и ключевым словом
- Phase 2.5: заменить на AI-сгенерированные через Stability AI

### Доступ
- Free: Daily Card (1/день), каталог карт (ключевые слова только)
- Pro: все расклады, полные описания, AI-интерпретация, каббалистические соответствия
```

---

## 8. Tree of Life (Каббала) — Phase 2

```
Ты senior full-stack разработчик + эзотерик. Реализуй интерактивную визуализацию Древа Жизни (Tree of Life) для Estrevia — PWA на Next.js + TypeScript + Tailwind.

## Что такое Древо Жизни
Каббалистическая диаграмма из 10 сфирот (сефирот) и 22 путей. Центральная структура в западной эзотерической традиции. Связывает планеты, знаки зодиака, карты Таро Тота и еврейские буквы.

## Источник данных
Liber 777 Алистера Кроули — public domain. Таблица соответствий.

## Функционал

### Интерактивная диаграмма
- SVG-визуализация Древа Жизни
- 10 сфирот как круги с названиями (Hebrew + English + Spanish)
- 22 пути как линии между сфирот
- При нажатии на сфиру:
  - Название (3 языка: Hebrew, EN, ES)
  - Номер (1-10)
  - Планетарное соответствие
  - Цвет (по системе Queen Scale)
  - Описание (2-3 абзаца)
  - Связанные карты Tarot
  - Божественное имя
- При нажатии на путь:
  - Номер (11-32)
  - Еврейская буква
  - Карта Таро Тота
  - Астрологическое соответствие (знак/планета/элемент)
  - Описание

### Персонализация (натальная карта)
- Планеты пользователя подсвечиваются на соответствующих сфирот
  - Например: Sun → Tiphareth (6), Moon → Yesod (9), Mercury → Hod (8) и т.д.
- "Your Tree" — какие сфирот и пути активированы в натальной карте пользователя

### Таблица 777
- Интерактивная таблица соответствий из Liber 777
- Колонки: номер, еврейская буква, путь, знак/планета, карта Таро, цвет, камень, растение, благовоние
- Поиск и фильтрация
- При нажатии на строку — выделение соответствующего пути на Древе

## Техническая реализация

### SVG Древа
- Координаты 10 сфирот (стандартное расположение):
  - Kether (1): top center
  - Chokmah (2): top right
  - Binah (3): top left
  - Chesed (4): middle right
  - Geburah (5): middle left
  - Tiphareth (6): center
  - Netzach (7): lower right
  - Hod (8): lower left
  - Yesod (9): bottom center
  - Malkuth (10): very bottom center
- 22 пути: линии между определёнными парами сфирот
- Responsive: масштабируется под мобильный экран
- Анимация при нажатии: сфира пульсирует, путь подсвечивается

### Data model
```json
{
  "sephiroth": [
    {
      "number": 1,
      "name": { "hebrew": "כתר", "en": "Kether", "es": "Kether" },
      "meaning": { "en": "Crown", "es": "Corona" },
      "planet": "Primum Mobile",
      "color_queen_scale": "#FFFFFF",
      "divine_name": "AHIH",
      "description": { "en": "...", "es": "..." }
    }
  ],
  "paths": [
    {
      "number": 11,
      "connects": [1, 2],
      "hebrew_letter": "Aleph",
      "tarot": "The Fool",
      "astrology": "Air",
      "color": "#FFFF00"
    }
  ]
}
```

### Доступ
- Free: визуализация Древа (без описаний и персонализации)
- Pro: полные описания, персонализация, таблица 777
```

---

## 9. AI-аватар (Phase 2)

```
Ты senior full-stack разработчик. Реализуй генерацию AI-аватаров для Estrevia — PWA на Next.js + TypeScript.

## Концепция
Пользователь получает уникальный аватар, сгенерированный на основе его натальной карты. Стиль: космический/эзотерический, похожий на Cosmic Passport но персонализированный глубже.

## Генерация

### Промпт для Stability AI
Собирается динамически из натальных данных:
```
"Cosmic portrait avatar. [Element of Sun sign] energy.
Colors: [цвета по планетарным соответствиям].
Mood: [keywords по Sun/Moon/Ascendant combination].
Style: ethereal, mystical, digital art, dark background with cosmic elements.
No text. No face. Abstract representation of cosmic energy.
Square format, 512x512."
```

### Маппинг натальных данных → визуальные элементы
- Fire signs (Aries, Leo, Sagittarius) → тёплые цвета, пламя, динамика
- Earth signs (Taurus, Virgo, Capricorn) → зелёные/коричневые, кристаллы, стабильность
- Air signs (Gemini, Libra, Aquarius) → голубые/серебристые, облака, лёгкость
- Water signs (Cancer, Scorpio, Pisces) → синие/фиолетовые, волны, глубина
- Ascendant определяет "внешнюю оболочку" аватара
- Moon определяет "внутреннее свечение"

### Техническая реализация
- API Route: POST /api/avatar/generate
- Вызов Stability AI API (SDXL или SD3)
- Сохранение результата: Vercel Blob Storage или S3
- Одна генерация на пользователя бесплатно, регенерация — Pro
- Аватар используется в профиле, Cosmic Passport, синастрии

### Доступ
- Free: 1 генерация
- Pro: безлимитные регенерации + выбор стиля (cosmic, tarot, geometric, nebula)
```

---

## 10. Push-уведомления

```
Ты senior full-stack разработчик. Реализуй Web Push уведомления для Estrevia — PWA на Next.js.

## Типы уведомлений

### Астрологические (основные)
- Daily horoscope reminder (утро, настраиваемое время)
- New Moon / Full Moon (за 1 час до точного времени)
- Mercury/Venus/Mars Retrograde начало/конец
- Луна входит в знак пользователя (Sun или Moon sign)
- Void-of-Course начало/конец

### Engagement (вторичные)
- "Your Cosmic Passport was viewed by X people" (виральная петля)
- "New: Synastry module is live — check compatibility with your partner"
- Weekly digest: ключевые астро-события недели

## Техническая реализация

### Service Worker
- Файл: /public/sw.js
- Регистрация при первом визите + запрос разрешения
- Обработка push-событий с отображением уведомления
- Click handler: открывает соответствующий раздел приложения

### Backend
- Web Push API (библиотека web-push для Node.js)
- Таблица push_subscriptions: userId, endpoint, p256dh, auth, createdAt
- Таблица notification_preferences: userId, type, enabled, time (для daily)
- Cron job (Vercel Cron): проверяет астро-события каждый час и рассылает

### Настройки пользователя
- Страница /settings/notifications
- Переключатели для каждого типа
- Выбор времени для daily reminder
- "Quiet hours" — не отправлять с X до Y

### Доступ
- Free: daily reminder + New/Full Moon
- Pro: все остальные типы
```

---

## Примечания по использованию промптов

1. **Запускать последовательно**, не параллельно — каждая фича зависит от предыдущей (paywall нужен для всех Pro-фич, i18n нужен для контента)
2. **Тестировать каждую фичу отдельно** перед переходом к следующей
3. **Порядок приоритета:** Paywall → Cosmic Passport → i18n → Лунный календарь → всё остальное
4. **Claude Code** лучше для backend/API/DB — сложная логика, Swiss Ephemeris интеграция
5. **Cursor** лучше для frontend/UI — компоненты, анимации, responsive дизайн
6. **Для эссе и описаний карт Таро** — отдельные промпты на генерацию контента через Claude API, не в рамках кодинга