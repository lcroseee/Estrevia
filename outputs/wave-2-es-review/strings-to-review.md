# Wave 2 ES Strings Review

**Purpose:** Single document collecting every new ES string introduced by Wave 2 (including this closeout) for native LATAM review.

**Style guide:** español neutro LATAM, `tú` form, sign names untranslated, planet names translated (`Marte`, `Luna`, `Saturno`).

**Workflow:**
1. Read each row
2. Write `ok` in the `Your decision` column to accept as-is
3. Or write `→ rewrite to: <new text>` to change

When done, save this file and reply with "ES review done — apply via Edit". Claude will apply changes via Edit tool from `→ rewrite to:` decisions in one commit.

---

## chart-keywords.ts (72 entries — 36 ES rows below)

Source: `src/shared/lib/chart-keywords.ts`

### Aries
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| aries.sun | the unspent Mars-impulse — a fire that needs to be aimed, not numbed | el impulso marciano no gastado — un fuego que pide dirección, no anestesia | "marciano" is a common astro adjective in ES but also means "Martian alien" in casual speech; alt "el impulso de Marte sin gastar"? | |
| aries.moon | feelings as flares — true while burning, gone before naming | sentimientos como llamaradas — verdaderos al arder, idos antes de nombrarse | clean | |
| aries.asc | the body that gets there first, then asks where "there" was | el cuerpo que llega primero, y luego pregunta a dónde llegó | clean | |

### Taurus
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| taurus.sun | Venus-craft slowed to handwork — value found by staying with the same thing | Venus-oficio en cámara lenta — el valor está en quedarse con lo mismo | "Venus-oficio" is a coined compound; verify register feels right in LATAM | |
| taurus.moon | feelings that settle in the bones — slow to arrive, slow to leave | sentimientos que se asientan en los huesos — lentos al llegar, lentos al irse | clean | |
| taurus.asc | a calm presence the world reads as "this one will not be rushed" | una presencia calma que el mundo lee como "a éste no se le apura" | "apurar" is the correct LATAM verb for "rush"; "éste" → confirm gender-neutral approach or use "a esta persona no se le apura" | |

### Gemini
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| gemini.sun | Mercury-thread weaving — identity that needs at least two angles to feel real | hilo mercurial — una identidad que necesita al menos dos ángulos para sentirse real | 85 chars (>80 EN limit, within 90 ES limit); "mercurial" in LATAM ES also means "moody/volatile" — intended double-meaning or prefer "hilo de Mercurio"? | |
| gemini.moon | feelings translated before they are felt — words first, weight later | sentimientos traducidos antes de sentirse — palabras primero, peso después | clean | |
| gemini.asc | a quick conversational surface that is also the doorway, not the room | una superficie conversadora rápida que también es la puerta, no la sala | "conversadora" (fem.) modifies "superficie" (fem.) — grammatically correct; clean | |

### Cancer
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| cancer.sun | the chandra-line — identity that takes its color from whom you protect | la línea chandra — identidad que toma su color de a quién proteges | "chandra" left untranslated (Sanskrit term, same as EN); clean | |
| cancer.moon | the Moon at home — the tide that knows itself by what it shelters | la Luna en su casa — la marea que se reconoce por lo que ampara | "ampara" = shelters/protects; in LATAM "amparar" is formal-legal register; alt "la marea que se reconoce por lo que cobija"? | |
| cancer.asc | a soft outer shell the world reads correctly only after time | una cáscara externa suave que el mundo lee bien sólo con tiempo | "cáscara" is colloquially "skin/shell" in LATAM; confirm vs. "envoltura" or "corteza" for tone | |

### Leo
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| leo.sun | Sun in own dignity — warmth that performs, then forgets it performed | Sol en su propia dignidad — calidez que actúa y luego olvida que actuó | clean | |
| leo.moon | feelings that want a witness — bright in company, harder alone | sentimientos que quieren testigo — brillantes en compañía, más difíciles a solas | clean | |
| leo.asc | presence that arrives before the introduction does | una presencia que llega antes que la presentación | clean | |

### Virgo
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| virgo.sun | Mercury-craft turned inward — identity built by noticing what others miss | oficio mercurial hacia adentro — identidad armada notando lo que otros no ven | "armada" (built/assembled) is vivid; in MX/AR "armada" also evokes military; alt "construida" if too martial | |
| virgo.moon | feelings sorted before they are felt — useful, sometimes too useful | sentimientos ordenados antes de sentirse — útiles, a veces demasiado | clean | |
| virgo.asc | a composed surface that registers the room before the room registers it | una superficie compuesta que registra la sala antes de que la sala la registre | clean | |

### Libra
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| libra.sun | Venus in the kendra of others — identity calibrated against another face | Venus en la kendra del otro — identidad calibrada frente a otro rostro | "kendra" left untranslated (Sanskrit astro term); consistent with EN; clean | |
| libra.moon | feelings that need symmetry — uneasy in rooms with no balance | sentimientos que necesitan simetría — inquietos en salas sin equilibrio | clean | |
| libra.asc | a poised presence that asks the room to meet it halfway | una presencia serena que pide a la sala encontrarse a medio camino | clean | |

### Scorpio
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| scorpio.sun | Mars-water — identity that knows what it does not say | Marte-agua — identidad que sabe lo que no dice | "Marte-agua" is a coined compound; Marte translated correctly; clean | |
| scorpio.moon | feelings as undertow — quiet on the surface, structural below | sentimientos como resaca — quietos en la superficie, estructurales abajo | "resaca" in LATAM ES primarily means "hangover" (not undertow/riptide); alt "corriente subterránea", "resaca de mar", or "bajo resaca"? Flag HIGH priority | |
| scorpio.asc | a still presence others sense before they place it | una presencia inmóvil que otros sienten antes de ubicarla | clean | |

### Sagittarius
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| sagittarius.sun | Jupiter-grace at speed — identity that needs distance to see itself | gracia de Júpiter en movimiento — identidad que necesita distancia para verse | clean | |
| sagittarius.moon | feelings that travel — restless in small rooms, settled on long horizons | sentimientos que viajan — inquietos en salas pequeñas, asentados en horizontes largos | 82 chars (within 90 ES limit); clean | |
| sagittarius.asc | an open presence that does not yet know the local customs | una presencia abierta que aún no conoce las costumbres locales | clean | |

### Capricorn
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| capricorn.sun | the long-game Sun — slow to claim its own brightness | el Sol de largo plazo — lento para reclamar su propio brillo | clean | |
| capricorn.moon | feelings filed under "later" — patient, structural, often heavy | sentimientos archivados como "después" — pacientes, estructurales, a veces pesados | 82 chars (within 90 ES limit); clean | |
| capricorn.asc | the saturnine doorway through which strangers first feel your weight | la puerta saturnina por la cual los extraños sienten primero tu peso | "saturnina" is used in literary ES for "gloomy/Saturnian"; confirm desired tone vs. "de Saturno" | |

### Aquarius
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| aquarius.sun | Saturn-of-systems — identity built by the rules you choose to keep | Saturno de los sistemas — identidad armada con las reglas que eliges mantener | same "armada" note as virgo.sun; also "sistemas" is broad — clean otherwise | |
| aquarius.moon | feelings observed from one step back — true but rarely loud | sentimientos observados desde un paso atrás — verdaderos pero rara vez ruidosos | clean | |
| aquarius.asc | a presence that signals "I belong nowhere by default" — read as cool | una presencia que señala "no pertenezco a ningún lugar por defecto" — leído como frío | 85 chars (within 90 ES limit); "leído como frío" is masculine singular — gendered self-description; if persona is feminine, "leída como fría" would be correct; flag for founder decision on gender strategy | |

### Pisces
| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| pisces.sun | the dissolved self — boundary becomes the edge of the tide | el yo disuelto — la frontera se vuelve el borde de la marea | clean | |
| pisces.moon | feelings as ocean — yours and not-yours, indistinguishable | sentimientos como océano — tuyos y no-tuyos, indistinguibles | clean | |
| pisces.asc | a soft transparent presence others project their wishes onto | una presencia suave y transparente sobre la cual otros proyectan sus deseos | "transparente" in LATAM colloquial can read as "see-through clothing"; in this poetic register risk is low but alt "diáfana" or "translúcida" if preferred | |

---

## SaturnWeeklyEmail.tsx

Source: `src/emails/SaturnWeeklyEmail.tsx`

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| preview | A weekly note from Estrevia about Saturn. | Una nota semanal de Estrevia sobre Saturno. | clean | |
| heading | A weekly note about Saturn | Una nota semanal sobre Saturno | clean | |
| body1 | Sade-sati is the seven-and-a-half-year Saturn passage that visits every chart in three phases: twelfth-house preparation, first-house stripping-down, second-house rebuild of what matters. Whether you are inside it now or watching its memory, Saturn's task does not change — to build the structure your future self will rest on. | Sade-sati es el tránsito saturnino de siete años y medio que visita toda carta en tres fases: preparación en la casa doce, desmonte de identidad en la primera, reconstrucción de valores en la segunda. Estés dentro ahora o viendo su memoria, la tarea de Saturno no cambia — construir la estructura sobre la cual tu yo futuro descansará. | "desmonte de identidad" is vivid; "desmonte" in MX = clearing land; in this metaphor works as dismantling — confirm register; "viendo su memoria" = watching its memory (abstract) — confirm intended meaning | |
| body2 | Step back and notice: what would you keep building if no one were watching? Saturn's question is rarely the urgent one — it is the slow one that compounds. | Da un paso atrás y observa: ¿qué seguirías construyendo si nadie te mirara? La pregunta de Saturno rara vez es la urgente — es la lenta, la que compone. | "la que compone" = "the one that compounds/composes" — in LATAM "componer" leans toward "to fix/compose music"; EN "compounds" = accumulates; alt "la que se acumula" or "la que sedimenta" for clearer meaning | |
| cta | Open your chart | Abre tu carta | clean | |

---

## SynastryTeaserEmail.tsx

Source: `src/emails/SynastryTeaserEmail.tsx`

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| preview | Compare your chart with someone you love — free synastry reading. | Compara tu carta con alguien que amas — lectura de sinastría gratis. | clean | |
| heading | Want to see your compatibility? | ¿Quieres ver tu compatibilidad? | clean | |
| body1 | Synastry is what we have not yet shown you — the chart comparison between two people. It's the oldest use of astrology, the one you actually do with friends: comparing where your Mars sits next to theirs, where your Moons echo or argue. | La sinastría es lo que aún no te hemos mostrado — la comparación entre dos cartas. Es el uso más antiguo de la astrología, el que de hecho haces con tus amistades: ver dónde tu Marte queda junto al suyo, dónde tus Lunas se hacen eco o discuten. | "tus amistades" is neutral LATAM for "friends" (vs. "amigos" which defaults masculine); clean | |
| body2 | Add a partner, friend, or family member's birth data and Estrevia will calculate the synastry free. No card, no nudge: just one more pattern to look at. | Agrega los datos de nacimiento de una pareja, amistad o familiar y Estrevia calculará la sinastría gratis. Sin tarjeta, sin presión: solo un patrón más para observar. | "Sin presión" replaces EN "no nudge" — clean functional equivalent | |
| cta | Open synastry | Abrir sinastría | clean | |

---

## MiniReadingEmail.tsx

Source: `src/emails/MiniReadingEmail.tsx` — shipped in Wave 2 commit `49b7463`.

This email's ES strings are **template scaffolding only** — the actual content is pulled dynamically from `chart-keywords.ts` (reviewed in the table above). The fixed strings in this file are:

| key | EN | ES (Claude draft) | Note | Your decision |
|---|---|---|---|---|
| HEADING.es | Your sidereal mini-reading | Tu mini-lectura sideral | clean | |
| PREVIEW.es | A short reading from your sidereal chart — Sun, Moon, and Ascendant. | Una lectura corta de tu carta sideral — Sol, Luna y Ascendente. | clean | |
| CTA.es | See your full chart | Ver tu carta completa | clean | |
| LINE_BUILDERS.es.sun prefix | Your Sun in | Tu Sol en | clean | |
| LINE_BUILDERS.es.sun middle | suggests | sugiere | clean | |
| LINE_BUILDERS.es.moon prefix | Your Moon in | Tu Luna en | clean | |
| LINE_BUILDERS.es.moon middle | reveals | revela | clean | |
| LINE_BUILDERS.es.asc prefix | Your Ascendant in | Tu Ascendente en | clean | |
| LINE_BUILDERS.es.asc middle | shapes how others see you: | moldea cómo te ven los demás: | clean | |

All dynamic content (sign keywords) is covered by the `chart-keywords.ts` table above.

---

## Pricing i18n (Wave 2 L3-B)

`src/i18n/messages/es.json` does not exist in this repo — pricing strings are rendered directly in the component. Refer to commits `747f88d` (L3-B: prominent 42% savings text, Annual mode) — the savings text is English-only in the component. No ES strings added to a separate i18n file during Wave 2.

**Out of scope for this review.** If pricing copy needs ES translation, raise as a separate task.

---

## Submission

When all `Your decision` cells are filled, save this file and reply "ES review done — apply via Edit". Claude will apply each `→ rewrite to: ...` to the source file in a single commit.
