# Рендеринг натальной карты: SVG-колесо

> Центральный UI-компонент Estrevia. Колесо — это hub, через который пользователь попадает в контент.

---

## Архитектурное решение

**Клиентский SVG-рендеринг.** Сервер рассчитывает позиции планет и куспиды домов (см. [chart-calculation.md](./chart-calculation.md)), возвращает JSON. Клиент строит SVG-колесо из этих данных.

Почему не серверный рендеринг SVG:
- Интерактивность (тапы, hover, анимации) требует DOM
- SVG рендерится за <50ms — нет смысла в canvas или серверной генерации
- Framer Motion для анимации sidereal/tropical toggle

Почему не D3.js:
- Слишком тяжёлый (~240 KB minified) для одной визуализации
- Нам не нужны data joins, scales, axes — только геометрия круга
- Custom React-компоненты проще поддерживать и типизировать

---

## Тип карты

**Western circular wheel** (круговая западная карта), не Vedic square chart.

12 сегментов по 30° каждый для знаков зодиака. Если известно время рождения — внутреннее кольцо с 12 домами (неравные сегменты, Placidus). Если время неизвестно — упрощённая карта без домов.

---

## Визуальная структура

```
┌─────────────────────────────────────────────┐
│                                             │
│    ┌─── Outer Ring ──────────────────┐      │
│    │  12 знаков зодиака              │      │
│    │  Цвет по стихии (Fire/Earth/    │      │
│    │  Air/Water)                     │      │
│    │  Глифы знаков на границах       │      │
│    │                                 │      │
│    │  ┌─── Middle Ring ──────────┐   │      │
│    │  │  Куспиды домов 1-12      │   │      │
│    │  │  (только если время      │   │      │
│    │  │   рождения известно)     │   │      │
│    │  │                          │   │      │
│    │  │  ┌─── Inner Area ────┐   │   │      │
│    │  │  │  Глифы планет     │   │   │      │
│    │  │  │  на рассчитанных  │   │   │      │
│    │  │  │  позициях         │   │   │      │
│    │  │  │                   │   │   │      │
│    │  │  │  ┌─ Center ───┐   │   │   │      │
│    │  │  │  │ Линии      │   │   │   │      │
│    │  │  │  │ аспектов   │   │   │   │      │
│    │  │  │  └────────────┘   │   │   │      │
│    │  │  └───────────────────┘   │   │      │
│    │  └──────────────────────────┘   │      │
│    └─────────────────────────────────┘      │
│                                             │
└─────────────────────────────────────────────┘
```

### Цвета знаков по стихиям

| Стихия | Знаки | Цвет фона сегмента |
|--------|-------|---------------------|
| Fire | Aries, Leo, Sagittarius | `#2A1A1A` (тёмно-красный) |
| Earth | Taurus, Virgo, Capricorn | `#1A2A1A` (тёмно-зелёный) |
| Air | Gemini, Libra, Aquarius | `#1A1A2A` (тёмно-синий) |
| Water | Cancer, Scorpio, Pisces | `#1A2A2A` (тёмно-бирюзовый) |

Цвета планет — из [docs/design.md](../../design.md).

---

## Responsive-поведение

### Mobile (375px — 767px)

- Колесо занимает 90% ширины экрана (~340px диаметр)
- Под колесом: список позиций планет (скроллируемый)
- Нет sidebar — всё в одну колонку
- Тап по планете → переход к эссе (полноэкранный)

### Tablet (768px — 1023px)

- Колесо: ~500px диаметр
- Справа: sidebar с деталями выбранной планеты
- Тап по планете → sidebar обновляется (без навигации)

### Desktop (1024px+)

- Колесо: ~600px диаметр
- Справа: sidebar + таблица аспектов
- Hover по планете → подсветка аспектов к ней
- Тап → sidebar с эссе (inline preview)

```
Mobile:                Tablet/Desktop:
┌──────────┐           ┌──────────────────────────┐
│  ○ Wheel │           │  ○ Wheel    │  Sidebar   │
│          │           │             │            │
├──────────┤           │             │  Planet:   │
│ Позиции  │           │             │  ☉ Sun     │
│ планет   │           │             │  15°42' ♓  │
│ (список) │           │             │            │
└──────────┘           │             │  Аспекты:  │
                       │             │  △ Moon    │
                       │             │  □ Mars    │
                       └──────────────────────────┘
```

---

## Интерактивность

### Touch targets

Глифы планет должны иметь минимальную tap area **44×44px** (Apple HIG), даже если визуальный размер глифа меньше. Реализация: невидимый `<rect>` или увеличенный `pointer-events` area вокруг каждого `<PlanetGlyph>`.

### Press feedback

При тапе на глиф планеты — subtle scale animation: `scale(0.95)` → `scale(1.0)` за 150ms. Это даёт тактильную обратную связь без задержки навигации.

### Анимации

- **Entrance:** stagger-анимация появления планет при первом рендере — 30-50ms задержка между каждой планетой (Sun первый, Chiron последний)
- **Все анимации interruptible:** тап пользователя отменяет текущую анимацию и немедленно применяет конечное состояние
- **Sidereal/tropical toggle:** spring physics для вращения колеса (`spring({ stiffness: 300, damping: 25 })`), не linear/ease
- `prefers-reduced-motion`: отключить stagger и spring, применять мгновенные state changes

### Тап / клик

| Элемент | Действие |
|---------|----------|
| Планета | Navigate к эссе по позиции (например, Sun in Pisces → `/essays/sun-in-pisces`) |
| Знак (сегмент) | Navigate к описанию знака (`/signs/pisces`) |
| Дом | Tooltip с описанием дома |
| Линия аспекта | Tooltip с типом аспекта и орбисом |

### Long press / hover

- Планета: tooltip с точными координатами — `"☉ Sun 15°42'18" Pisces (sidereal)"`
- Показываем: градус, минута, ретроградность, скорость

### Sidereal/Tropical toggle

Переключатель над колесом. При переключении:

1. Вся карта **поворачивается** на ~24° (ayanamsa offset) с анимацией
2. Позиции планет пересчитываются (простое вычитание offset, без запроса к серверу)
3. Подписи знаков обновляются
4. Анимация: Framer Motion, `rotate` transition, 600ms ease-in-out

```typescript
// Визуальный offset — без нового API-запроса
const displayLongitude = mode === "sidereal"
  ? tropicalLongitude - ayanamsaOffset
  : tropicalLongitude;
```

---

## Обработка коллизий планет

Когда несколько планет находятся в пределах 5° друг от друга (conjunction), их глифы перекрываются.

**Алгоритм:**

1. Сортируем планеты по ecliptic longitude
2. Для каждой пары: если расстояние < 5° (порог в пикселях зависит от размера колеса)
3. Разводим глифы радиально — ближе к центру / дальше от центра
4. Рисуем тонкую линию от смещённого глифа к его реальной позиции на колесе

```
Без коллизии:        С коллизией (♃ и ♄ в 2° друг от друга):

    ☉                     ☉
    ♃                     ♃ ─── (линия к точке на колесе)
                          ♄ ─── (смещён радиально)
    ♄
```

Micro-layout: force-directed positioning. Итеративно раздвигаем перекрывающиеся глифы до минимального зазора в 4px.

---

## Индикатор ретроградности

Ретроградные планеты обозначаются символом **Rx** рядом с глифом:

```
♂Rx    — Mars retrograde
♄Rx    — Saturn retrograde
```

Визуально: `Rx` в уменьшенном размере (0.6em), чуть правее и ниже глифа планеты. Цвет — `#8888A0` (muted text).

Ретроградность определяется по `speed < 0` в ответе Swiss Ephemeris.

---

## Линии аспектов

Линии рисуются в центральной области колеса, соединяя позиции двух планет.

### Цвета по типу аспекта

| Аспект | Угол | Цвет | Стиль линии |
|--------|------|------|-------------|
| Conjunction | 0° | `#D4A942` (gold) | Solid, 2px |
| Opposition | 180° | `#C04040` (red) | Solid, 2px |
| Trine | 120° | `#4080C0` (blue) | Solid, 1.5px |
| Square | 90° | `#C04040` (red) | Dashed, 1.5px |
| Sextile | 60° | `#40A060` (green) | Dotted, 1px |

### Opacity по точности орбиса

Чем точнее аспект (меньше орбис), тем ярче линия:

```typescript
const opacity = 1 - (orbDegrees / maxOrb); // 0.0 → 1.0
// Пример: точный trine (orb 0.5°) → opacity 0.94
//         широкий trine (orb 7°) → opacity 0.13
```

MVP показывает только **major аспекты** (5 типов выше). Minor аспекты (quincunx, semi-sextile и др.) — Phase 2.

---

## Accessibility (WCAG 2.1 AA)

### aria-labels на SVG-элементах

Каждый интерактивный элемент SVG имеет `aria-label`:

```tsx
<g role="button" aria-label="Sun at 15 degrees 42 minutes Pisces, sidereal">
  <SunGlyph />
</g>

<line aria-label="Trine aspect between Sun and Moon, orb 2.3 degrees" />

<g aria-label="Pisces sign segment, water element">
  <SignSegment sign="pisces" />
</g>
```

### Текстовая таблица-fallback

Под SVG-колесом — `<table>` с полными данными. Визуально скрыта (`sr-only`), доступна screen readers:

```tsx
<table className="sr-only" aria-label="Natal chart positions">
  <caption>Sidereal natal chart calculated for March 15, 1990, 14:30, Moscow</caption>
  <thead>
    <tr><th>Planet</th><th>Sign</th><th>Degree</th><th>House</th><th>Retrograde</th></tr>
  </thead>
  <tbody>
    <tr><td>Sun</td><td>Pisces</td><td>15°42'</td><td>10</td><td>No</td></tr>
    <tr><td>Moon</td><td>Cancer</td><td>22°08'</td><td>3</td><td>No</td></tr>
    {/* ... */}
  </tbody>
</table>
```

### Keyboard navigation

- `Tab` — переход между планетами (в порядке: Sun → Moon → Mercury → ... → Chiron)
- `Enter` — открыть эссе / описание
- `Escape` — закрыть tooltip
- Focus ring: 2px `#D4A942` (gold) outline на активном элементе

---

## Карта без времени рождения

Когда время неизвестно:

- **Показываем:** внешнее кольцо знаков + планеты на позициях (полдень UTC)
- **Не показываем:** дома, куспиды, ASC/MC
- **Предупреждение:** banner сверху — «Время рождения не указано. Дома и Асцендент недоступны. Позиция Луны может отличаться до ±6°.»
- Колесо визуально проще — нет внутреннего кольца домов

---

## React-компоненты

```
<ChartWheel>                    — Корневой SVG-контейнер, responsive sizing
  ├── <SignRing>                — 12 сегментов внешнего кольца
  │     └── <SignSegment>       — Один знак: фон + глиф + градусная разметка
  ├── <HouseRing>               — 12 домов среднего кольца (optional)
  │     └── <HouseCusp>         — Линия куспида + номер дома
  ├── <PlanetLayer>             — Слой глифов планет с collision handling
  │     └── <PlanetGlyph>       — Один глиф: символ + Rx + collision offset line
  ├── <AspectLayer>             — Линии аспектов в центре
  │     └── <AspectLine>        — Одна линия: цвет + opacity + dash pattern
  └── <ChartAccessibilityTable> — sr-only текстовая таблица
```

Все компоненты — чистые React + SVG. Без внешних chart-библиотек. Типизация через TypeScript.

---

## Performance

| Метрика | Целевое значение |
|---------|-----------------|
| SVG render time | < 50ms |
| Toggle animation | 60fps (Framer Motion) |
| Interaction response (tap) | < 100ms |
| Bundle size (chart module) | < 30 KB gzipped |

Canvas fallback не нужен — SVG с 12 знаками, 12 планетами и ~20 аспектными линиями не создаёт performance-проблем ни на одном современном устройстве.
