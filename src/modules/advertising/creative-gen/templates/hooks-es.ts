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
    visual_mood:
      'Estudio fotorrealista en primer plano de una lujosa tarjeta de identidad astrológica flotando sola en el espacio cósmico profundo. La tarjeta muestra una rueda circular de carta sidérea trazada con finas líneas de oro pálido y blanco sobre un gradiente azul marino a negro profundo. Doce sectores zodiacales separados por líneas radiales delgadas, dos anillos concéntricos interiores, formas simbólicas abstractas (sin escritura legible) centradas en cada sector, y pequeños puntos dorados brillantes que marcan posiciones planetarias. Un pequeño motivo luminoso de porcentaje en oro en la parte inferior de la tarjeta sugiere rareza. Borde dorado sutil estilo lámina de oro, halo celestial suave alrededor de la tarjeta. Fondo: gradiente cósmico negro a índigo con estrellas dispersas tenues. Espacio negativo vacío en la parte inferior del cuadro para superposición de texto. Composición vertical 9:16. SIN personas, SIN rostros, SIN manos, SIN pantallas de teléfono, SIN dispositivos, SIN elementos de UI, SIN interfaz, SIN íconos, SIN interfaz moderna, SIN flechas, SIN paneles de datos, SIN logos, SIN palabras, SIN letras, SIN caracteres, SIN etiquetas, SIN nombres, SIN números, SIN dígitos, SIN subtítulos.',
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
    visual_mood:
      'Estudio fotorrealista de artefacto celestial. Una sola tarjeta de identidad astrológica luminosa, grande, exhibida sola como pieza de museo, suspendida en el centro del cuadro contra un fondo de gradiente cósmico negro a azul marino con estrellas doradas dispersas. La cara de la tarjeta muestra una rueda circular de carta sidérea en finas líneas de oro pálido y blanco con doce sectores separados por líneas radiales delgadas, dos anillos concéntricos interiores, formas simbólicas abstractas en cada sector, y pequeños puntos dorados brillantes en posiciones planetarias. Un pequeño motivo luminoso de porcentaje en oro cerca del borde inferior de la tarjeta sugiere rareza. Borde dorado sutil estilo lámina, halo de luz suave alrededor de la tarjeta. Un único haz de luz cálida desde la esquina superior izquierda roza la superficie de la tarjeta, evocando la presentación reverente de un objeto sagrado. Espacio negativo vacío en la parte inferior del cuadro para superposición de texto. Composición vertical 9:16. SIN personas, SIN rostros, SIN manos, SIN pantallas de teléfono, SIN dispositivos, SIN elementos de UI, SIN interfaz, SIN íconos, SIN interfaz moderna, SIN flechas, SIN logos, SIN palabras, SIN letras, SIN caracteres, SIN etiquetas, SIN nombres, SIN números, SIN dígitos, SIN subtítulos.',
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
  // ---------------------------------------------------------------------------
  // ARQUETIPO: lead_magnet
  // Hook directo, CTA fuerte, imperativo "tú": calcula, mapea.
  // ---------------------------------------------------------------------------
  {
    id: 'es-lead-magnet-1',
    name: 'Lead Magnet — Carta Sideral Gratis',
    archetype: 'lead_magnet',
    copy_template:
      'Tu carta natal sideral, sin costo. Calculada con precisión védica al ±0.01° contra Swiss Ephemeris. Sin generalizaciones de signo solar.',
    visual_mood:
      'Rueda fotorrealista de carta natal sideral, líneas finas en oro pálido sobre fondo azul marino profundo a negro. Doce sectores, glifos planetarios en grados precisos, líneas radiales finas, estética de placa de observatorio. Halo suave sobre la rueda. Espacio negativo vacío en la parte inferior para overlay del CTA. SIN texto, SIN etiquetas, SIN clipart místico, SIN bolas de cristal. Composición vertical 9:16.',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'afirmación de carta gratuita es veraz al producto — aceptable',
      '±0.01° cita Swiss Ephemeris / Moshier',
      'sin predicciones personales',
      'sin lenguaje adivinatorio',
      'forma "tú" — nunca "usted"',
      'nombres de signos en forma latina (Aries, Taurus, ...) — no traducir',
    ],
  },
  {
    id: 'es-lead-magnet-2',
    name: 'Lead Magnet — Mapea Tu Cielo',
    archetype: 'lead_magnet',
    copy_template:
      'Mapea tu cielo real en 90 segundos. Posiciones siderales, calibradas a donde los planetas están esta noche.',
    visual_mood:
      'Cielo nocturno fotorrealista con banda sutil de la Vía Láctea. Tres planetas visibles con precisión matemática (Saturno con anillos, Júpiter con bandas crema, Marte rojo profundo). Espacio negativo vacío en la parte inferior. SIN UI, SIN texto, SIN dashboards. Composición vertical 9:16.',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1'],
    locale: 'es',
    policy_constraints: [
      'enmarque de acción del producto — aceptable',
      'sin afirmaciones personales sobre el espectador',
      'sin adivinación',
      'forma "tú"',
    ],
  },
  {
    id: 'es-lead-magnet-3',
    name: 'Lead Magnet — No Es Horóscopo',
    archetype: 'lead_magnet',
    copy_template:
      'No es horóscopo. Es tu carta natal real, mapeada al cielo verdadero — no al promedio del calendario.',
    visual_mood:
      'Comparación de pantalla dividida: lado izquierdo un recorte de horóscopo de periódico genérico atenuado; lado derecho una rueda sideral precisa en líneas oro pálido sobre azul marino profundo a negro. Vertical 9:16. SIN texto en la imagen, SIN logos. Parte inferior vacía para overlay del CTA.',
    duration_sec: 18,
    aspect_ratios: ['9:16', '4:5'],
    locale: 'es',
    policy_constraints: [
      'enmarque comparativo es factual — aceptable',
      'no se burla de astrología tropical por nombre (solo contrasta enfoques)',
      'sin afirmaciones personales',
      'forma "tú"',
    ],
  },
  // ---------------------------------------------------------------------------
  // ADICIÓN AL ARQUETIPO: rarity (variante Pasaporte Cósmico)
  // ---------------------------------------------------------------------------
  {
    id: 'es-rarity-7',
    name: 'Rarity — Tu Pasaporte Cósmico',
    archetype: 'rarity',
    copy_template:
      'Tu Pasaporte Cósmico. Sol, Luna y Ascendente en sus signos siderales reales — una tarjeta compartible.',
    visual_mood:
      'Una sola tarjeta luminosa de identidad astrológica centrada, ligeramente inclinada, estética de pase de observatorio antiguo. La cara de la tarjeta muestra una rueda circular de carta sideral en líneas oro pálido con doce sectores, formas simbólicas abstractas (sin escritura legible), pequeños puntos dorados marcando posiciones planetarias. Geometría sutil de nodos del Árbol de la Vida como marca de agua en esquina — NO imágenes del Tarot Thoth de Frieda Harris. Fondo azul marino profundo a negro con estrellas dispersas. SIN bolas de cristal, SIN tarot, SIN clipart místico. SIN texto en la imagen. Composición vertical 9:16.',
    duration_sec: 12,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'descripción de producto — aceptable',
      'geometría del Árbol de la Vida es esquemática simbólica, no Tarot Thoth de Harris (copyright hasta 2064)',
      'sin afirmaciones personales sobre el espectador',
      'sin adivinación',
      'forma "tú"',
      'nombres de signos en forma latina',
    ],
  },
  // ---------------------------------------------------------------------------
  // ARCHETYPE: reciprocity
  // Carta gratuita sin registro — español neutro LATAM, no "usted".
  // ---------------------------------------------------------------------------
  {
    id: 'es-reciprocity-1',
    name: 'Reciprocidad — Carta Gratuita, Sin Registro',
    archetype: 'reciprocity',
    copy_template:
      'Una carta natal sidérea, calculada desde donde los planetas realmente aparecen en el cielo. Gratis, sin registro.',
    visual_mood: 'inviting cosmic gradient with gentle star field, no human figures',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'español neutro LATAM — no "usted"',
      'factual offer — no fortune-telling',
      'landing page must actually deliver free chart',
    ],
  },
  {
    id: 'es-reciprocity-2',
    name: 'Reciprocidad — Efemérides Abiertas',
    archetype: 'reciprocity',
    copy_template:
      'El mismo algoritmo Swiss Ephemeris que usan los astrónomos profesionales — abierto como calculadora de carta gratuita.',
    visual_mood: 'cosmic gradient with subtle astronomical instruments, no faces',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'español neutro LATAM — no "usted"',
      'Swiss Ephemeris is a real library — accurate claim',
      'no fortune-telling',
    ],
  },
  // ---------------------------------------------------------------------------
  // ARCHETYPE: peer_discovery
  // Social proof — gated por PEER_DISCOVERY_ENABLED, español neutro LATAM.
  // ---------------------------------------------------------------------------
  {
    id: 'es-peer-discovery-1',
    name: 'Descubrimiento — Miles de Cartas Sidéreas',
    archetype: 'peer_discovery',
    copy_template:
      'Miles han calculado su carta natal sidérea en las últimas semanas. La mayoría de apps populares siguen usando posiciones tropicales estandarizadas hace más de 2.000 años.',
    visual_mood: 'discovery-revelation gradient with subtle star field, no human faces',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'requires PEER_DISCOVERY_ENABLED=true env var',
      'español neutro LATAM — no "usted"',
      'cantidad cualitativa solamente ("miles") — respaldada por ≥2000 PostHog events',
      'no manipulative scarcity',
    ],
  },
  {
    id: 'es-peer-discovery-2',
    name: 'Descubrimiento — Practicantes Siderales',
    archetype: 'peer_discovery',
    copy_template:
      'Muchos practicantes siderales descubren que su signo solar tropical difiere de la posición calculada esta noche.',
    visual_mood: 'cosmic gradient with subtle constellation outlines',
    duration_sec: 15,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'requires PEER_DISCOVERY_ENABLED=true env var',
      'español neutro LATAM — no "usted"',
      'cualitativo ("muchos") — sin número específico',
      'factual astronomical claim only',
    ],
  },
  // ---------------------------------------------------------------------------
  // ARCHETYPE: accuracy_gap
  // Aversión a la pérdida — deriva tropical como costo, español neutro LATAM.
  // ---------------------------------------------------------------------------
  {
    id: 'es-accuracy-gap-1',
    name: 'Brecha de Precisión — Precesión Axial',
    archetype: 'accuracy_gap',
    copy_template:
      'La precesión axial de ~24° entre la astrología tropical antigua y el cielo de esta noche no ha llegado a la mayoría de apps populares de signo solar.',
    visual_mood: 'historical-to-modern transition; star precession diagram acceptable',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'español neutro LATAM — no "usted"',
      'factual astronomical figure (24°)',
      'no mocking tropical astrology',
    ],
  },
  {
    id: 'es-accuracy-gap-2',
    name: 'Brecha de Precisión — Antes de Galileo',
    archetype: 'accuracy_gap',
    copy_template:
      'Las apps de signo solar tropical fueron estandarizadas antes de Galileo. El cálculo sidéreo usa las estrellas como están esta noche.',
    visual_mood: 'split-screen historical-to-modern transition',
    duration_sec: 18,
    aspect_ratios: ['9:16', '1:1', '4:5'],
    locale: 'es',
    policy_constraints: [
      'español neutro LATAM — no "usted"',
      'factual historical anchor (Galileo)',
      'no mocking tropical astrology',
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------

export function getHookTemplateEs(id: string): HookTemplate | undefined {
  return hooksEs.find(h => h.id === id);
}
