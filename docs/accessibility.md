# Доступность (Accessibility / a11y)

> Астрологическая карта — визуально-тяжёлый контент. Тем важнее сделать его доступным.

---

## Стандарт

**WCAG 2.1 Level AA** — минимальный стандарт для MVP.

---

## Ключевые требования

### Натальная карта (SVG)

Карта — самый сложный UI элемент для доступности.

| Требование | Реализация |
|-----------|-----------|
| Screen reader | `aria-label` на каждой планете: «Солнце в 15° Рыб» |
| Табличный fallback | Под картой — текстовая таблица позиций (скрыта визуально, доступна для SR) |
| Keyboard navigation | Tab через планеты на колесе, Enter открывает эссе |
| Фокус | Видимый focus ring на интерактивных элементах |
| Zoom | Карта масштабируется без потери информации (SVG = вектор) |

### Цвета

| Требование | Реализация |
|-----------|-----------|
| Контраст текст/фон | ≥ 4.5:1 (AA). #F0F0F5 на #0A0A0F = 16:1 ✅ |
| Контраст secondary | ≥ 3:1. #8888A0 на #0A0A0F = 5.2:1 ✅ |
| Планетарные цвета | Не полагаться только на цвет — добавлять глифы / labels |
| Стихии | Огонь/Земля/Воздух/Вода различимы не только цветом |
| Color blind safe | Проверять через Stark / Sim Daltonism |

### Типографика

| Требование | Реализация |
|-----------|-----------|
| Минимальный размер | 16px body, 14px captions |
| Line height | ≥ 1.5 для body text |
| Астрологические глифы | Дублировать текстом (♈ + «Aries») для screen readers |
| User zoom | Не блокировать pinch-to-zoom (`user-scalable=yes`) |

### Навигация

| Требование | Реализация |
|-----------|-----------|
| Keyboard | Все интерактивные элементы доступны через Tab |
| Skip links | «Skip to main content» в начале страницы |
| Focus order | Логичный порядок Tab: nav → main → aside |
| ARIA landmarks | `<main>`, `<nav>`, `<aside>`, `role="complementary"` |
| Page titles | Уникальный `<title>` на каждой странице |

### Формы

| Требование | Реализация |
|-----------|-----------|
| Labels | Каждый input имеет `<label>` (visible, не placeholder-only) |
| Errors | Ошибки связаны с полем через `aria-describedby` |
| Focus management | При ошибке submit — auto-focus на первое невалидное поле |
| Autocomplete | `autocomplete` атрибуты для даты, города, email |
| Date input | Поддержка native date picker + ручной ввод |

### Иерархия заголовков

| Требование | Реализация |
|-----------|-----------|
| Последовательность | h1 → h2 → h3 → ... без пропусков уровней (например, нельзя h1 → h3) |
| Один h1 | Каждая страница имеет ровно один `<h1>` с primary keyword |

### ARIA Live Regions

| Требование | Реализация |
|-----------|-----------|
| Результат расчёта | `aria-live="polite"` на контейнере с результатами карты |
| Ошибки форм | `aria-live="assertive"` на блоке ошибок |
| Toast-уведомления | `role="status"` + `aria-live="polite"` |
| Создание паспорта | Screen reader announcement: «Cosmic Passport created» |

### Escape Routes

| Требование | Реализация |
|-----------|-----------|
| Модалки | Видимая кнопка закрытия (X) + `Escape` |
| Sheets / drawers | Видимая кнопка закрытия + свайп вниз (mobile) |
| Tooltips | `Escape` для закрытия, автоматическое закрытие при потере фокуса |

### Медиа

| Требование | Реализация |
|-----------|-----------|
| NASA звуки (Фаза 2) | Кнопка play/pause, не autoplay |
| Анимации (`prefers-reduced-motion`) | При `reduce`: отключить все non-essential анимации (stagger, spring physics, parallax). Оставить только функциональные state changes (opacity toggle, instant position change). Без этого медиа-запроса анимации работают нормально. |
| Dark/Light theme | Respect `prefers-color-scheme` (default dark, но light доступен) |

---

## Тестирование a11y

| Инструмент | Когда | Что проверяет |
|-----------|-------|--------------|
| **axe-core** (Playwright plugin) | CI, каждый PR | WCAG 2.1 AA violations |
| **Lighthouse Accessibility** | CI, каждый деплой | Score ≥ 90 |
| **Keyboard testing** | Ручное, перед релизом | Все flows проходимы без мыши |
| **VoiceOver (macOS)** | Ручное, перед релизом | Screen reader experience |
| **Stark** (Figma/Browser) | При дизайне | Color contrast, color blindness |

---

## Приоритеты для MVP

| Приоритет | Что | Сложность |
|-----------|-----|-----------|
| **Высокий** | Контраст текста, labels на формах, page titles | Низкая |
| **Высокий** | Keyboard navigation (tab, enter, escape) | Средняя |
| **Высокий** | Screen reader: таблица позиций как альтернатива колесу | Средняя |
| **Средний** | ARIA landmarks, skip links | Низкая |
| **Средний** | `prefers-reduced-motion` | Низкая |
| **Низкий** | Light theme | Средняя (отдельная палитра) |
| **Низкий** | Full VoiceOver optimization 3D (Фаза 2) | Высокая |
