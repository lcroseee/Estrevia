# PWA: стратегия офлайн-доступа

---

## Зачем PWA

| Преимущество | Описание |
|-------------|----------|
| **$0 на мобильный старт** | Нет App Store / Google Play. Нет review процесса. Нет $99/год Apple fee |
| **Установка** | Home screen icon, standalone window, splash screen |
| **Офлайн** | Расчёт карт, чтение эссе, лунный календарь — без интернета |
| **Push-уведомления** | iOS 16.4+, Android, Desktop — через Web Push API |
| **Быстрый старт** | Service Worker кэширует shell — моментальная загрузка |

---

## Что работает офлайн

| Функция | Офлайн | Стратегия кэширования |
|---------|--------|----------------------|
| Натальная карта (сохранённая) | ✅ | IndexedDB: все карты пользователя |
| Новый расчёт карты | ✅ | Swiss Ephemeris WASM (~2MB, кэш при установке) |
| Лунный календарь (текущий месяц) | ✅ | Pre-calculated 30 дней, обновление при подключении |
| Эссе по позициям | ✅ | Service Worker: кэш всех текстов (~5MB) |
| Планетарные часы | ✅ | Расчёт на клиенте через WASM |
| Страница «Почему сидерическая» | ✅ | Service Worker cache |
| UI / shell | ✅ | App shell pattern |
| Real-time NASA/USGS | ❌ | Последние кэшированные + «обновится при подключении» |
| Push-уведомления | ❌ | Требуется сеть |
| AI-генерация | ❌ | Требуется API |
| Регистрация / логин | ❌ | Требуется сеть |

---

## Техническая реализация

### Service Worker (Serwist / next-pwa)

```
Стратегии кэширования:

Cache-First (статика):
  ├── WASM файлы (Swiss Ephemeris)
  ├── Шрифты
  ├── Иконки / глифы
  ├── Эссе (MDX → HTML)
  └── App shell (layout, navigation)

Network-First (динамика):
  ├── API endpoints (NASA, USGS)
  ├── User data
  └── Auth status

Stale-While-Revalidate:
  ├── Лунный календарь
  └── Планетарные позиции (обновляются раз в день)
```

### PWA Manifest

```json
{
  "name": "ESTREVIA — El camino de las estrellas",
  "short_name": "Estrevia",
  "description": "Sidereal astrology meets real astronomy",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0A0A0F",
  "theme_color": "#0A0A0F",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Объём кэша

| Компонент | Размер |
|-----------|--------|
| App shell (HTML/CSS/JS) | ~3MB |
| Swiss Ephemeris WASM | ~2MB |
| Эссе (120 текстов) | ~5MB |
| Шрифты | ~500KB |
| Иконки / глифы | ~200KB |
| Лунный календарь (30 дней) | ~100KB |
| **Итого** | **~11MB** |

---

## Install Prompt

### Когда показываем

- **Автоматический (Chrome):** после 2-го визита, если user engagement criteria met
- **Кастомный:** после первого расчёта карты — «Установите Estrevia для офлайн-доступа»

### Кастомный prompt

```
┌─────────────────────────────────────┐
│  ☆ Установить Estrevia?             │
│                                     │
│  Быстрый доступ с домашнего экрана  │
│  Расчёт карт без интернета          │
│                                     │
│  [Установить]     [Не сейчас]       │
└─────────────────────────────────────┘
```

### Трекинг

- `pwa_prompt_shown` — PostHog event
- `pwa_prompt_accepted` / `pwa_prompt_dismissed`
- `pwa_installed` — `appinstalled` event

---

## Push-уведомления (Фаза 2)

| Тип | Частота | Описание |
|-----|---------|----------|
| Новолуние / Полнолуние | 2× в месяц | «Новолуние в Скорпионе — время трансформации» |
| Значимые транзиты | 1-2× в неделю | «Марс входит в Козерог сегодня» |
| Солнечные вспышки (X-class) | По событию | «X2.5 солнечная вспышка зафиксирована NASA» |
| Напоминание | 1× в неделю (если inactive) | «Ваш лунный день сегодня — 7-й. Что это значит?» |

**Без спама.** Максимум 3-4 push в неделю. Пользователь настраивает в Settings.

---

## Offline UI Indicators

```
Offline:   [🔴 Offline] banner вверху — subtle, не blocking
           NASA/USGS лента: «Последнее обновление: 2 часа назад»
           Расчёт карты: работает нормально (WASM)
           Эссе: работает нормально (кэш)

Restoring: [🟡 Подключение...] — при восстановлении сети
           Background sync: обновление NASA/USGS данных

Online:    Без индикатора (нормальное состояние)
```

---

## Обновление PWA

- Service Worker обновляется в фоне при подключении
- Prompt: «Доступна новая версия. Обновить?» (не принудительно)
- Skipwaiting только после согласия пользователя
