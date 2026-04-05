# PWA: стратегия

---

## Зачем PWA

| Преимущество | Описание |
|-------------|----------|
| **$0 на мобильный старт** | Нет App Store / Google Play. Нет review процесса. Нет $99/год Apple fee |
| **Установка** | Home screen icon, standalone window, splash screen |
| **Быстрый старт** | Моментальный доступ с домашнего экрана без адресной строки |

---

## PWA Manifest

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

---

## Что работает офлайн: НИЧЕГО

MVP: все функции требуют сетевого подключения. Офлайн-кэширование не реализуется.

---

## Install Prompt

### Когда показываем

- **Автоматический (Chrome):** после 2-го визита, если user engagement criteria met
- **Кастомный:** после первого расчёта карты — «Установите Estrevia для быстрого доступа»

### Кастомный prompt

```
┌─────────────────────────────────────┐
│  ☆ Install Estrevia?                │
│                                     │
│  Quick access from your home screen │
│  Full-screen experience             │
│                                     │
│  [Install]        [Not now]         │
└─────────────────────────────────────┘
```

### Трекинг

- `pwa_prompt_shown` — PostHog event
- `pwa_prompt_accepted` / `pwa_prompt_dismissed`
- `pwa_installed` — `appinstalled` event

---

Phase 2: Service Worker кэширование, push-уведомления — по данным аналитики.
