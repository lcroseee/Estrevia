export type SignKey =
  | 'aries' | 'taurus' | 'gemini' | 'cancer'
  | 'leo' | 'virgo' | 'libra' | 'scorpio'
  | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export type Locale = 'en' | 'es';

export interface SignKeywords {
  sun: string;
  moon: string;
  asc: string;
}

/**
 * Static keyword map for the T+14d mini-reading email template.
 *
 * Each entry is a short noun-phrase that fits into the template:
 *   "Your Sun in {sign} suggests {sun}."
 *   "Your Moon in {sign} reveals {moon}."
 *   "Your Ascendant in {sign} shapes how others see you: {asc}."
 *
 * Founder content commitment: 12 × 3 × 2 = 72 strings. Engineer placeholders
 * below pass tests but are intentionally generic; founder iterates content
 * with authentic Vedic-astrology phrasing before deploy.
 */
export const SIGN_KEYWORDS: Record<Locale, Record<SignKey, SignKeywords>> = {
  en: {
    aries: {
      sun: 'the unspent Mars-impulse — a fire that needs to be aimed, not numbed',
      moon: 'feelings as flares — true while burning, gone before naming',
      asc: 'the body that gets there first, then asks where "there" was',
    },
    taurus: {
      sun: 'Venus-craft slowed to handwork — value found by staying with the same thing',
      moon: 'feelings that settle in the bones — slow to arrive, slow to leave',
      asc: 'a calm presence the world reads as "this one will not be rushed"',
    },
    gemini: {
      sun: 'Mercury-thread weaving — identity that needs at least two angles to feel real',
      moon: 'feelings translated before they are felt — words first, weight later',
      asc: 'a quick conversational surface that is also the doorway, not the room',
    },
    cancer: {
      sun: 'the chandra-line — identity that takes its color from whom you protect',
      moon: 'the Moon at home — the tide that knows itself by what it shelters',
      asc: 'a soft outer shell the world reads correctly only after time',
    },
    leo: {
      sun: 'Sun in own dignity — warmth that performs, then forgets it performed',
      moon: 'feelings that want a witness — bright in company, harder alone',
      asc: 'presence that arrives before the introduction does',
    },
    virgo: {
      sun: 'Mercury-craft turned inward — identity built by noticing what others miss',
      moon: 'feelings sorted before they are felt — useful, sometimes too useful',
      asc: 'a composed surface that registers the room before the room registers it',
    },
    libra: {
      sun: 'Venus in the kendra of others — identity calibrated against another face',
      moon: 'feelings that need symmetry — uneasy in rooms with no balance',
      asc: 'a poised presence that asks the room to meet it halfway',
    },
    scorpio: {
      sun: 'Mars-water — identity that knows what it does not say',
      moon: 'feelings as undertow — quiet on the surface, structural below',
      asc: 'a still presence others sense before they place it',
    },
    sagittarius: {
      sun: 'Jupiter-grace at speed — identity that needs distance to see itself',
      moon: 'feelings that travel — restless in small rooms, settled on long horizons',
      asc: 'an open presence that does not yet know the local customs',
    },
    capricorn: {
      sun: 'the long-game Sun — slow to claim its own brightness',
      moon: 'feelings filed under "later" — patient, structural, often heavy',
      asc: 'the saturnine doorway through which strangers first feel your weight',
    },
    aquarius: {
      sun: 'Saturn-of-systems — identity built by the rules you choose to keep',
      moon: 'feelings observed from one step back — true but rarely loud',
      asc: 'a presence that signals "I belong nowhere by default" — read as cool',
    },
    pisces: {
      sun: 'the dissolved self — boundary becomes the edge of the tide',
      moon: 'feelings as ocean — yours and not-yours, indistinguishable',
      asc: 'a soft transparent presence others project their wishes onto',
    },
  },
  es: {
    aries: {
      sun: 'el impulso marciano no gastado — un fuego que pide dirección, no anestesia',
      moon: 'sentimientos como llamaradas — verdaderos al arder, idos antes de nombrarse',
      asc: 'el cuerpo que llega primero, y luego pregunta a dónde llegó',
    },
    taurus: {
      sun: 'Venus-oficio en cámara lenta — el valor está en quedarse con lo mismo',
      moon: 'sentimientos que se asientan en los huesos — lentos al llegar, lentos al irse',
      asc: 'una presencia calma que el mundo lee como "a éste no se le apura"',
    },
    gemini: {
      sun: 'hilo mercurial — una identidad que necesita al menos dos ángulos para sentirse real',
      moon: 'sentimientos traducidos antes de sentirse — palabras primero, peso después',
      asc: 'una superficie conversadora rápida que también es la puerta, no la sala',
    },
    cancer: {
      sun: 'la línea chandra — identidad que toma su color de a quién proteges',
      moon: 'la Luna en su casa — la marea que se reconoce por lo que ampara',
      asc: 'una cáscara externa suave que el mundo lee bien sólo con tiempo',
    },
    leo: {
      sun: 'Sol en su propia dignidad — calidez que actúa y luego olvida que actuó',
      moon: 'sentimientos que quieren testigo — brillantes en compañía, más difíciles a solas',
      asc: 'una presencia que llega antes que la presentación',
    },
    virgo: {
      sun: 'oficio mercurial hacia adentro — identidad armada notando lo que otros no ven',
      moon: 'sentimientos ordenados antes de sentirse — útiles, a veces demasiado',
      asc: 'una superficie compuesta que registra la sala antes de que la sala la registre',
    },
    libra: {
      sun: 'Venus en la kendra del otro — identidad calibrada frente a otro rostro',
      moon: 'sentimientos que necesitan simetría — inquietos en salas sin equilibrio',
      asc: 'una presencia serena que pide a la sala encontrarse a medio camino',
    },
    scorpio: {
      sun: 'Marte-agua — identidad que sabe lo que no dice',
      moon: 'sentimientos como resaca — quietos en la superficie, estructurales abajo',
      asc: 'una presencia inmóvil que otros sienten antes de ubicarla',
    },
    sagittarius: {
      sun: 'gracia de Júpiter en movimiento — identidad que necesita distancia para verse',
      moon: 'sentimientos que viajan — inquietos en salas pequeñas, asentados en horizontes largos',
      asc: 'una presencia abierta que aún no conoce las costumbres locales',
    },
    capricorn: {
      sun: 'el Sol de largo plazo — lento para reclamar su propio brillo',
      moon: 'sentimientos archivados como "después" — pacientes, estructurales, a veces pesados',
      asc: 'la puerta saturnina por la cual los extraños sienten primero tu peso',
    },
    aquarius: {
      sun: 'Saturno de los sistemas — identidad armada con las reglas que eliges mantener',
      moon: 'sentimientos observados desde un paso atrás — verdaderos pero rara vez ruidosos',
      asc: 'una presencia que señala "no pertenezco a ningún lugar por defecto" — leído como frío',
    },
    pisces: {
      sun: 'el yo disuelto — la frontera se vuelve el borde de la marea',
      moon: 'sentimientos como océano — tuyos y no-tuyos, indistinguibles',
      asc: 'una presencia suave y transparente sobre la cual otros proyectan sus deseos',
    },
  },
};

export function getSignKeywords(
  locale: Locale,
  sign: SignKey,
  placement: keyof SignKeywords,
): string {
  return SIGN_KEYWORDS[locale][sign][placement];
}
