# Real-time Data Feeds: NASA и USGS

---

## Простыми словами

Мы показываем живые данные о том, что происходит в космосе и на Земле: солнечные вспышки, землетрясения, корональные выбросы массы. Данные приходят от NASA и USGS (бесплатно). Наш сервер опрашивает их каждые 5 минут, кэширует, и отдаёт пользователям.

---

## Архитектура

```
┌────────────────┐     ┌────────────────┐
│  NASA DONKI    │     │  USGS          │
│  API           │     │  Earthquake    │
│                │     │  API           │
│ Solar Flares   │     │                │
│ CMEs           │     │ GeoJSON feed   │
│ Geomag Storms  │     │ Real-time      │
└───────┬────────┘     └───────┬────────┘
        │                      │
        │ HTTP GET              │ HTTP GET
        │ (каждые 5 мин)       │ (каждые 5 мин)
        │                      │
        ▼                      ▼
┌──────────────────────────────────────┐
│         Vercel Cron Job              │
│                                      │
│  /api/cron/nasa      /api/cron/usgs  │
│                                      │
│  1. Fetch API                        │
│  2. Parse response                   │
│  3. Transform → unified format       │
│  4. Deduplicate (by event ID)        │
│  5. Save to Redis (TTL 5min)         │
│  6. Save new items to Postgres       │
│                                      │
└──────────────┬───────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌────────┐          ┌──────────┐
│ Redis  │          │ Postgres │
│        │          │          │
│ Latest │          │ History  │
│ 20 items│         │ All items│
│ TTL 5m │          │ Forever  │
└───┬────┘          └──────────┘
    │
    │ GET /api/feed
    │ (из Redis → клиенту)
    ▼
┌──────────┐
│ Браузер  │
│          │
│ Карточки │
│ в ленте  │
└──────────┘
```

---

## Источники данных

### NASA DONKI (Space Weather Database Of Notifications)

```
URL: https://api.nasa.gov/DONKI/FLR
     ?startDate=2026-04-01
     &endDate=2026-04-04
     &api_key=DEMO_KEY

Response:
[
  {
    "flrID": "2026-04-04T12:30:00-FLR-001",
    "instruments": [{"displayName": "GOES-16: EXIS 1.0-8.0A"}],
    "beginTime": "2026-04-04T12:25Z",
    "peakTime": "2026-04-04T12:30Z",
    "endTime": "2026-04-04T12:45Z",
    "classType": "M2.5",
    "sourceLocation": "N15E30",
    "activeRegionNum": 3847
  }
]

Endpoints:
  /DONKI/FLR   → Solar Flares
  /DONKI/CME   → Coronal Mass Ejections
  /DONKI/GST   → Geomagnetic Storms
  /DONKI/HSS   → High Speed Streams

Rate limit: 1000 req/час (по API key)
```

### USGS Earthquake

```
URL: https://earthquake.usgs.gov/earthquakes/
     feed/v1.0/summary/all_day.geojson

Response (GeoJSON):
{
  "features": [
    {
      "properties": {
        "mag": 5.2,
        "place": "28 km SSW of Tokyo, Japan",
        "time": 1712218500000,
        "type": "earthquake",
        "title": "M 5.2 - 28 km SSW of Tokyo"
      },
      "geometry": {
        "coordinates": [139.65, 35.48, 35.0]
      }
    }
  ]
}

Rate limit: нет (public feed)
```

---

## Трансформация в единый формат

```typescript
type FeedItem = {
  id: string                    // уникальный ID события
  source: 'nasa_donki' | 'usgs_earthquake'
  type: 'solar_flare' | 'cme' | 'geomagnetic_storm' | 'earthquake'
  title: string                 // "M2.5 Solar Flare" / "M5.2 - Japan"
  description: string           // развёрнутое описание
  severity: string | null       // "C" / "M" / "X" для вспышек
  magnitude: number | null      // для землетрясений
  lat: number | null            // для землетрясений
  lon: number | null
  eventTime: Date
  rawData: object               // оригинальный JSON
}
```

---

## Отказоустойчивость

```
Запрос от клиента: GET /api/feed

1. Redis жив, данные свежие (< 5 мин)?
   → Отдать из Redis                     ✅ Быстро (~5ms)

2. Redis жив, данные просрочены?
   → Отдать из Redis + пометить stale    ⚠️ Stale but OK
   → Cron обновит при следующем запуске

3. Redis пуст / недоступен?
   → Postgres: SELECT ... ORDER BY       ✅ Медленнее (~50ms)
     event_time DESC LIMIT 20

4. Postgres тоже пуст?
   → { items: [], status: "no_data",     ✅ Graceful
       message: "Обновится при           
        подключении" }
```

---

## Astro-контекст (Фаза 2)

В будущем к каждому событию добавляется астрологическая интерпретация:

```
Солнечная вспышка X1.5 | 4 апреля 2026
└── Астрологический контекст:
    "Вспышка класса X совпадает с Марсом
     в соединении с Ураном — аспект 
     внезапных энергетических выбросов..."
```

Генерация: Claude Haiku по шаблону с текущими транзитами. Кэш в Redis.
