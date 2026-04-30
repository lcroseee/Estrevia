import type { HookTemplate } from '@/shared/types/advertising';

// ---------------------------------------------------------------------------
// Spanish (LATAM) hook templates for Meta Ads
//
// Style rules (feedback_spanish_style memory):
//   - español neutro — neutral Latin American Spanish, no regional slang
//   - tú form for imperatives: Calcula, Descubre, Comparte (not Calcule/Descubra)
//   - Sign names UNTRANSLATED: Aries, Taurus, Gemini, etc.
//   - Planet names TRANSLATED: Sol, Luna, Mercurio, Venus, Marte, Júpiter,
//     Saturno, Urano, Neptuno, Plutón
//
// Policy rules (same as EN):
//   - Third-person / impersonal framing — no "no eres" (no personal claims)
//   - No predictive or fortune-telling language
//   - Scientific claims cite Swiss Ephemeris / precesión astronómica
//
// 3 archetypes, 4-6 variations each → 18 templates total
// ---------------------------------------------------------------------------

export const hooksEs: HookTemplate[] = [
  // ---------------------------------------------------------------------------
  // ARCHETYPE: identity_reveal
  // ---------------------------------------------------------------------------
  {
    id: 'es-identity-reveal-1',
    name: 'Identity Reveal — Zodíaco tropical vs sidéreo (ES)',
    archetype: 'identity_reveal',
    copy_template:
      'La precesión axial de la Tierra ha desplazado la esfera celeste ~24° desde que se codificó el zodíaco tropical hace ~2.000 años.',
    visual_mood: 'revelación cósmica, gradiente oscuro con animación de estrellas',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'sin afirmaciones personales al espectador',
      'sin lenguaje predictivo',
      'sin referencias a la adivinación',
      'citar Swiss Ephemeris si se mencionan datos de precisión',
    ],
  },
  {
    id: 'es-identity-reveal-2',
    name: 'Identity Reveal — La diferencia de 24° (ES)',
    archetype: 'identity_reveal',
    copy_template:
      'El eje de la Tierra se ha desplazado ~24° desde que se codificó la astrología antigua. La mayoría de apps jamás actualizaron ese dato.',
    visual_mood: 'revelación científica, diagrama de precesión estelar animado sobre rueda del zodíaco',
    duration_sec: 20,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'es',
    policy_constraints: [
      'la precesión axial (~24°) es un hecho astronómico verificado',
      'sin afirmaciones personales sobre el espectador',
      'sin adivinación',
    ],
  },
  {
    id: 'es-identity-reveal-3',
    name: 'Identity Reveal — Posiciones reales del cielo (ES)',
    archetype: 'identity_reveal',
    copy_template:
      'La astrología sidérea calcula las posiciones de los planetas según donde aparecen realmente en el cielo esta noche.',
    visual_mood:
      'Fotografía astronómica realista del cielo nocturno profundo. Tres estrellas brillantes blanco-azuladas alineadas en una fila perfectamente recta cerca del centro del encuadre, espaciadas uniformemente, aisladas como puntos discretos de luz contra un cielo oscuro vacío — rodeadas de espacio negativo, sin otras estrellas brillantes adyacentes. Dos planetas reales visualmente distintos en el tercio superior: Saturno con un sistema de anillos pálidos dorados prominentes ligeramente inclinado hacia un lado, y Neptuno como una esfera más pequeña de azul hielo lisa — claramente diferentes en color, tamaño y posición, sin superponerse. Una banda sutil de la Vía Láctea atraviesa la zona superior. Fondo con gradiente azul marino a negro y estrellas tenues dispersas. Profundidad cinematográfica, claridad atmosférica, resolución de observatorio. Espacio negativo vacío en la parte inferior del encuadre para superposición de texto. Composición vertical 9:16. SIN texto, SIN palabras, SIN etiquetas, SIN nombres, SIN títulos, SIN elementos de UI, SIN interfaz de planetario, SIN líneas de conexión, SIN líneas de diagrama, SIN contornos de constelaciones, SIN formas de asterismos, SIN cuadros explicativos, SIN iconos, SIN flechas, SIN cuadrículas.',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'es',
    policy_constraints: [
      'afirmación astronómica factual — aceptable',
      'sin predicciones personales',
      'sin adivinación',
    ],
  },
  {
    id: 'es-identity-reveal-4',
    name: 'Identity Reveal — Comparación de cartas (ES)',
    archetype: 'identity_reveal',
    copy_template:
      'Compara la carta tropical con la sidérea — la diferencia pocas veces es de un solo signo.',
    visual_mood: 'pantalla dividida: carta tropical izquierda, sidérea derecha, posiciones cambiando',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'sin afirmaciones personales sobre el espectador',
      'encuadre comparativo factual — aceptable',
      'sin lenguaje de adivinación',
    ],
  },
  {
    id: 'es-identity-reveal-5',
    name: 'Identity Reveal — Precesión explicada (ES)',
    archetype: 'identity_reveal',
    copy_template:
      'Los astrónomos lo llaman precesión de los equinoccios. Desplaza el zodíaco ~1° cada 72 años.',
    visual_mood: 'documental educativo, esfera celeste con animación de rotación lenta',
    duration_sec: 20,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'es',
    policy_constraints: [
      'afirmación científica factual — citar IAU si se requiere exactitud completa',
      'sin afirmaciones personales de identidad',
      'sin predicciones',
    ],
  },
  {
    id: 'es-identity-reveal-6',
    name: 'Identity Reveal — Signo diferente en sidéreo (ES)',
    archetype: 'identity_reveal',
    copy_template:
      'Aproximadamente el 80% de las personas tiene un signo solar distinto en astrología sidérea al que siempre les dijeron.',
    visual_mood: 'revelación de estadística en pantalla, fondo oscuro, contador animado',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'es',
    policy_constraints: [
      'porcentaje es una estimación empírica aproximada — calificar con "aproximadamente"',
      'sin afirmaciones dirigidas al espectador específico',
      'sin adivinación',
    ],
  },

  // ---------------------------------------------------------------------------
  // ARCHETYPE: authority
  // ---------------------------------------------------------------------------
  {
    id: 'es-authority-1',
    name: 'Authority — Precisión Swiss Ephemeris (ES)',
    archetype: 'authority',
    copy_template:
      'Estrevia calcula posiciones planetarias con Swiss Ephemeris — el mismo conjunto de datos que usan los astrónomos profesionales.',
    visual_mood:
      'Fotografía realista de un observatorio astronómico profesional al anochecer. Un gran telescopio reflector dentro de una cúpula abierta apuntando hacia un campo estelar profundo con la Vía Láctea atravesando el cielo. Silueta de horizonte montañoso debajo. Paleta azul marino y azul acero, claridad atmosférica nítida. Espacio negativo vacío en la parte inferior del encuadre para superposición de texto. Composición vertical 9:16. SIN pantallas, SIN gráficos, SIN cuadros, SIN dashboards, SIN visualizaciones de datos, SIN personas ni figuras humanas, SIN UI científica, SIN salas de control, SIN mapas, SIN etiquetas de texto.',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'citar Swiss Ephemeris (Astrodienst, Zúrich)',
      'sin lenguaje predictivo',
      'sin adivinación',
    ],
  },
  {
    id: 'es-authority-2',
    name: 'Authority — Hecho astronómico (ES)',
    archetype: 'authority',
    copy_template:
      'El zodíaco se desplazó ~24° por la precesión axial de la Tierra. La mayoría de apps de astrología siguen usando posiciones de hace 2.000 años.',
    visual_mood: 'documental, factual, imágenes satelitales con superposición del zodíaco',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'es',
    policy_constraints: [
      'encuadre científico — la precesión axial es astronomía documentada',
      'citar Swiss Ephemeris para afirmaciones de precisión computacional',
      'sin predicciones personales',
    ],
  },
  {
    id: 'es-authority-3',
    name: 'Authority — Estándar Ayanamsa Lahiri (ES)',
    archetype: 'authority',
    copy_template:
      'Estrevia usa el ayanamsa Lahiri — el estándar oficial adoptado por el Gobierno de la India en 1957.',
    visual_mood: 'gravedad histórica, estética de documento + carta estelar, acentos dorados',
    duration_sec: 15,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'es',
    policy_constraints: [
      'la adopción del ayanamsa Lahiri por el gobierno indio es un hecho histórico — aceptable',
      'sin predicciones ni afirmaciones personales sobre el espectador',
    ],
  },
  {
    id: 'es-authority-4',
    name: 'Authority — Precisión ±0,01° (ES)',
    archetype: 'authority',
    copy_template:
      'Posiciones planetarias calculadas con precisión de ±0,01°. La diferencia en el límite de un signo importa.',
    visual_mood: 'estética de ingeniería de precisión, grados y minutos de arco mostrados prominentemente',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'es',
    policy_constraints: [
      '±0,01° de precisión es especificación de Swiss Ephemeris / Moshier — citar en letra pequeña',
      'sin afirmaciones personales sobre el espectador',
      'sin lenguaje de adivinación',
    ],
  },
  {
    id: 'es-authority-5',
    name: 'Authority — Datos solares NASA (ES)',
    archetype: 'authority',
    copy_template:
      'Datos de eventos solares y cósmicos provenientes de NASA DONKI — el mismo feed que usan las agencias espaciales.',
    visual_mood: 'UI oscura estilo NASA, imágenes de llamaradas solares (dominio público), tono de credibilidad',
    duration_sec: 15,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'es',
    policy_constraints: [
      'los datos de la NASA son de dominio público — aceptable hacer referencia',
      'no insinuar que la NASA respalda a Estrevia',
      'sin lenguaje predictivo',
    ],
  },
  {
    id: 'es-authority-6',
    name: 'Authority — Cálculo de nivel profesional (ES)',
    archetype: 'authority',
    copy_template:
      'El mismo software de efemérides que usan investigadores y practicantes tradicionales de Jyotish. Ahora disponible en el móvil.',
    visual_mood: 'estética de oficio y tradición, atlas estelar antiguo superpuesto con UI moderna',
    duration_sec: 20,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'descripción factual del producto — aceptable',
      'sin predicciones personales',
      'sin afirmaciones exclusivas sin fundamento',
    ],
  },

  // ---------------------------------------------------------------------------
  // ARCHETYPE: rarity
  // ---------------------------------------------------------------------------
  {
    id: 'es-rarity-1',
    name: 'Rarity — Combinación Sol-Luna-Ascendente (ES)',
    archetype: 'rarity',
    copy_template:
      '12 signos solares × 12 signos lunares × 12 ascendentes = 1.728 configuraciones distintas. Cada una ocurre en aproximadamente el 0,06% de las cartas natales.',
    visual_mood:
      'Diagrama celeste fotorrealista. Una rueda astrológica circular luminosa renderizada con líneas finas de oro pálido y blanco, suspendida en el centro de un fondo con gradiente cósmico de negro a azul marino profundo. La rueda está dividida en doce sectores iguales en forma de porción de pastel mediante líneas radiales finas, con dos o tres anillos concéntricos formando bordes interior y exterior. Formas simbólicas abstractas curvas y simples (sin letras, sin caracteres, sin escritura legible) en el centro de cada sector. Algunos puntos dorados brillantes pequeños en posiciones variables sobre los anillos interiores sugieren posiciones planetarias. Contraste sutil oro-sobre-oscuro, nitidez de joya, precisión matemática. Halo luminoso suave alrededor de la rueda. Estrellas tenues dispersas en el fondo cósmico. Espacio negativo vacío en la parte inferior del encuadre para superposición de texto. Composición vertical 9:16. SIN texto, SIN palabras, SIN letras, SIN caracteres, SIN etiquetas, SIN nombres, SIN números, SIN dígitos, SIN títulos, SIN elementos de UI, SIN cuadros explicativos, SIN iconos, SIN interfaz moderna, SIN flechas, SIN dashboards de datos, SIN logos, SIN caras, SIN personas.',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'datos de rareza respaldados por cálculo estadístico real en la plataforma',
      'sin lenguaje excluyente',
      'sin predicciones personales',
    ],
  },
  {
    id: 'es-rarity-2',
    name: 'Rarity — 1 de 1.728 combinaciones (ES)',
    archetype: 'rarity',
    copy_template:
      'Existen 1.728 combinaciones posibles de Sol-Luna-Ascendente en astrología sidérea. La mayoría son menos del 1% de la población.',
    visual_mood: 'precisión matemática, cuadrícula estelar con celdas resaltadas, estética de lujo oscura',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'es',
    policy_constraints: [
      '12×12×12 = 1.728 es un hecho matemático — aceptable',
      'la afirmación de distribución ("menos del 1%") es aproximada — calificar apropiadamente',
      'sin afirmaciones personales dirigidas al espectador',
    ],
  },
  {
    id: 'es-rarity-3',
    name: 'Rarity — Pasaporte Cósmico Showcase (ES)',
    archetype: 'rarity',
    copy_template:
      'El Pasaporte Cósmico muestra la combinación sidérea exacta — y qué tan común es en todas las cartas calculadas.',
    visual_mood: 'prueba social, animación de llenado de tarjeta de pasaporte, botón de compartir visible',
    duration_sec: 15,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'es',
    policy_constraints: [
      'descripción del producto — aceptable',
      'porcentaje de rareza extraído de datos en vivo de la plataforma — indicar en descargos',
      'sin adivinación',
    ],
  },
  {
    id: 'es-rarity-4',
    name: 'Rarity — Rareza sidérea vs tropical (ES)',
    archetype: 'rarity',
    copy_template:
      'La astrología tropical distribuye los 12 signos de forma equitativa. En la sidérea, las posiciones se agrupan de otra manera — algunas combinaciones aparecen con mucha menos frecuencia.',
    visual_mood: 'animación de gráfico de distribución, barras de frecuencia irregulares, tono científico',
    duration_sec: 20,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'es',
    policy_constraints: [
      'encuadre estadístico — aceptable cuando se basa en datos de la plataforma',
      'sin afirmaciones personales sobre el espectador',
      'sin predicciones',
    ],
  },
  {
    id: 'es-rarity-5',
    name: 'Rarity — Comparte tu Pasaporte (ES)',
    archetype: 'rarity',
    copy_template:
      'El Pasaporte Cósmico se puede compartir. Calcula, obtén el puntaje de rareza, publícalo.',
    visual_mood: 'enfoque social, animación de hoja para compartir, energía de amigos comparando',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'es',
    policy_constraints: [
      'llamada a la acción del producto — aceptable',
      'sin afirmaciones personales de identidad',
      'sin lenguaje de adivinación',
    ],
  },
  {
    id: 'es-rarity-6',
    name: 'Rarity — Cálculo abierto de rareza (ES)',
    archetype: 'rarity',
    copy_template:
      'Los porcentajes de rareza se calculan con datos reales de Swiss Ephemeris — no son inventados. El código es de código abierto.',
    visual_mood: 'transparencia y confianza, fragmento de código brevemente visible, insignia AGPL',
    duration_sec: 18,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'es',
    policy_constraints: [
      'el código es AGPL-3.0 — afirmación correcta',
      'sin predicciones personales',
      'citar fuente Swiss Ephemeris',
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------

export function getHookTemplateEs(id: string): HookTemplate | undefined {
  return hooksEs.find(h => h.id === id);
}
