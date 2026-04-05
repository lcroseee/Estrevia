# Редакционный гайд: 120 эссе по планетам в знаках

> Стиль, тон, структура и правила для генерации эссе (Claude API) и человеческой редактуры.

---

## Тон и голос

### Тон

**Авторитетный, но доступный.** Как знающий друг, который разбирается в предмете — не академическая статья, не мистический предсказатель. Уверенный, но не догматичный.

| Правильно | Неправильно |
|-----------|-------------|
| Конкретные проявления | Абстрактные размышления |
| «You absorb the emotional atmosphere» | «You might be a very empathetic person» |
| Прямые утверждения | Извинения за астрологию |
| Современные примеры | Архаичный язык |

### Голос

- **Second person** («you»), **present tense**
- Прямое обращение к читателю
- Активный залог, не пассивный

```
Good: "Sun in sidereal Pisces dissolves the boundary between self and other."
Bad:  "The boundary between self and other is often dissolved when the Sun is placed in Pisces."
```

---

## Структура каждого эссе

**Объём:** 300–500 слов. Не короче, не длиннее.

### 1. Opening (1–2 предложения)

Прямое утверждение: что значит это размещение. **Это AEO-параграф** — AI-ассистенты (ChatGPT, Perplexity, Claude) будут цитировать именно его. Должен быть самодостаточным ответом на вопрос «What does [Planet] in [Sign] mean in sidereal astrology?»

```
Good: "Sun in sidereal Pisces dissolves the boundary between self and other. 
       You absorb the emotional atmosphere of any room you enter."

Bad:  "In this article, we will explore what it means to have your Sun 
       in the sign of Pisces according to the sidereal zodiac system."
```

### 2. Archetypal meaning (1–2 параграфа)

Мифология, символизм, традиция. Откуда этот архетип — какой миф, какой бог, какая идея стоит за знаком и планетой в этом знаке.

### 3. Manifestation in life (1–2 параграфа)

Конкретные, узнаваемые примеры. Как это проявляется в карьере, отношениях, повседневной жизни. Читатель должен узнать себя (или кого-то знакомого).

```
Good: "You're the person friends call at 2 AM — not because you have answers, 
       but because you make the unbearable feel bearable."

Bad:  "People with this placement tend to be caring and supportive of others."
```

### 4. Shadow / Challenge (1 параграф)

Негативное проявление, зона роста. Каждое размещение имеет теневую сторону. Не пугать — показывать путь трансформации.

```
Good: "The shadow here is dissolution — losing yourself in others' needs 
       until you forget what you actually want."

Bad:  "Unfortunately, this placement can sometimes cause problems in your life."
```

### 5. Esoteric correspondence (1 параграф)

777 reference: Hebrew letter, Tarot trump, Path on Tree of Life, Element/Planet. Кратко — для тех, кто знает. Не объяснять Каббалу с нуля.

```
Good: "Per Liber 777: Pisces corresponds to the Hebrew letter Qoph (ק), 
       the Moon trump in the Thoth Tarot, and the 29th Path connecting 
       Netzach to Malkuth. The path of corporeal intelligence — 
       spirit descending fully into matter."

Bad:  "The Kabbalah, which is an ancient Jewish mystical tradition, 
       assigns to each zodiac sign a Hebrew letter..."
```

### 6. Disclaimer footer

**Автоматически вставляется React-компонентом** в конце каждого эссе. Не включать в MDX-файл.

Текст disclaimer:

> Astrology is a symbolic language, not a predictive science. This content is for educational and entertainment purposes only and should not be considered medical, financial, or legal advice.

---

## Правила терминологии

### Используем

| Термин | Вместо |
|--------|--------|
| natal chart | birth chart |
| sidereal | sideral, Sidereal (mid-sentence) |
| placement | position (для planet-in-sign) |
| Sun, Moon, Mercury... | sun, moon, mercury (всегда с заглавной) |
| Aries, Taurus, Pisces... | aries, taurus, pisces (всегда с заглавной) |
| houses (lowercase) | Houses (mid-sentence) |
| retrograde | Retrograde (mid-sentence) |
| natal chart (first mention) | chart (допустимо в последующих упоминаниях) |

### Outer planets: Uranus, Neptune, Pluto

Эти планеты — **generational**. Они проводят 7–20+ лет в одном знаке. Каждое эссе про outer planet должно:

1. **Сместить тон** с личного («you tend to...») на коллективный («your generation carries...»)
2. **Указать годы** нахождения в знаке: «Pluto in sidereal Scorpio (1984–2000): your generation...»
3. **Тизануть house placement** для персонализации: «The house Pluto occupies in your chart shows where this generational force plays out personally.» (premium content, Phase 2)

---

## Что запрещено

Эти правила — жёсткие. Нарушение = редактура / регенерация.

### Категорически нельзя

- **Fortune-telling:** «you will», «fate», «destiny», «what awaits you»
- **Медицинский / финансовый совет:** «this placement affects your health», «good for investments»
- **Абсолютизм:** «always», «never», «all Pisces are...», «every person with this placement...»
- **Fluff:** «in this cosmic dance of the universe...», «the stars whisper...», «the celestial tapestry...»
- **Извинения за астрологию:** «some believe that...», «according to astrologers...», «whether you believe or not...»
- **Сравнение sidereal vs tropical** в каждом эссе (есть отдельная страница для этого)
- **Копирование Eshelman:** писать оригинальные интерпретации, ссылаясь на его работы как источник вдохновения, но не воспроизводя текст

### Нежелательно

- Чрезмерная мифология (>2 предложений на одну мифологическую отсылку)
- Списки качеств («people with this placement are: creative, sensitive, intuitive...»)
- Cliches («the universe has a plan», «everything happens for a reason»)
- Hedging каждого утверждения («may», «might», «could possibly»)

---

## Примеры: хорошо vs плохо

### Sun in sidereal Pisces — хороший opening

> Sun in sidereal Pisces dissolves the boundary between self and other. You absorb the emotional atmosphere of any room you enter — not by choice, but by constitution. Where other placements build walls, yours has membranes.

### Sun in sidereal Pisces — плохой opening

> If your Sun is in Pisces according to the sidereal zodiac system, you might find that you are a very empathetic person who feels things deeply. Many astrologers believe that this placement gives people a strong connection to their emotions and the emotions of others.

### Mars in sidereal Aries — хороший shadow

> The shadow is combustion. You start fast, burn hot, and sometimes reduce relationships to scorched earth before you've noticed the fire. Learning to channel this heat — not suppress it — is the work.

### Mars in sidereal Aries — плохой shadow

> On the negative side, you might sometimes act impulsively and make decisions that you later regret. It is important to think before you act and consider the consequences of your actions.

---

## Формат 777 Correspondences

Всегда указываем:
- **Hebrew letter** (символ + название)
- **Tarot trump** (из Thoth Tarot — НЕ Rider-Waite)
- **Path number** на Tree of Life
- **Element** или **ruling Planet**

Источник: «Per Liber 777» (public domain, 1909 edition — Equinox Vol. I No. 8).

**Объём:** 2–3 предложения максимум. Это для практиков — не нужно объяснять, что такое Tree of Life.

```
Good: "Per Liber 777: Aries corresponds to the Hebrew letter Heh (ה), 
       the Emperor trump, and the 15th Path connecting Chokmah to 
       Tiphareth. The constituting intelligence — raw creative force 
       channeled through structure."

Bad:  "In the Kabbalistic tradition, which maps spiritual concepts onto 
       a diagram called the Tree of Life, the sign of Aries is associated 
       with the Hebrew letter Heh. The Tree of Life consists of ten 
       spheres called Sephiroth, connected by 22 paths..."
```

---

## System prompt для Claude API

При генерации эссе через Claude API использовать следующий system prompt:

```
You are a sidereal astrologer writing for Estrevia. Your knowledge draws from 
the Western sidereal tradition (Fagan, Bradley, Eshelman) and Thelemic/Qabalistic 
correspondences (Crowley's 777, public domain 1909 edition).

Write in second person, present tense. Be authoritative but warm.
No fortune-telling. No fluff. Concrete manifestations over abstractions.
Each essay: 300-500 words. 

Structure:
1. Opening (1-2 sentences): Direct meaning. This paragraph will be cited by AI assistants.
2. Archetypal meaning (1-2 paragraphs): Mythology, symbolism.
3. Life manifestation (1-2 paragraphs): Concrete examples in career, relationships, daily life.
4. Shadow/Challenge (1 paragraph): Negative expression, growth path.
5. 777 Correspondence (1 paragraph): Hebrew letter, Thoth Tarot trump, Tree of Life path. Brief.

Terminology: "natal chart" (not "birth chart"), "placement" (not "position" for planet-in-sign).
Planet names capitalized. Sign names capitalized. "houses" lowercase.

DO NOT use: fortune-telling language, medical/financial advice, absolutism ("always", "never"),
fluff phrases, apologies for astrology, sidereal-vs-tropical comparisons.

For outer planets (Uranus, Neptune, Pluto): shift to generational tone, include years 
in sign, tease house placement for personalization.
```

---

## Чеклист ревью эссе

Перед публикацией каждое эссе проходит проверку:

- [ ] Объём 300–500 слов
- [ ] Opening — самодостаточный ответ на «What does X in Y mean?»
- [ ] Second person, present tense
- [ ] Нет fortune-telling, fluff, absolutism, hedging
- [ ] Нет медицинского/финансового совета
- [ ] 777 correspondence присутствует и корректна
- [ ] Терминология по гайду (natal chart, placement, capitalization)
- [ ] Для outer planets: generational tone + годы в знаке
- [ ] Нет копирования Eshelman / copyright material
- [ ] Проверка фактов: знак соответствует стихии, Tarot trump корректен
- [ ] Disclaimer не включён в MDX (вставляется компонентом)
