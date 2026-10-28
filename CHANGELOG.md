# Registro de cambios

Todos los cambios relevantes del proyecto se documentan en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
proyecto usa [versionado semántico](https://semver.org/lang/es/).

## 1.1.0 - 2026-10-27

### Agregado
- **Traducción automática del diccionario Strong (griego/hebreo) al español.**
  Nuevo interruptor opcional «Traducir al español» junto al botón *Buscar* del
  diccionario, en *Notas de estudio* y *Preparación de sermones*.
  - Viene desactivado por defecto; al activarlo traduce del inglés al español los
    campos *Origen*, *Definición* y *KJV traduce como*. El código, el lema, la
    transliteración y la pronunciación se conservan sin traducir.
  - Activarlo o desactivarlo cambia la entrada mostrada al instante, sin repetir la
    búsqueda.
  - La preferencia se recuerda entre sesiones y las traducciones se guardan en
    memoria por código durante la sesión.
  - Se indica «Traducción automática del inglés» bajo la entrada traducida. Si la
    traducción falla, se mantiene el texto original y se muestra un aviso.
- **«RV1909 traduce como» en el diccionario Strong**, debajo de *KJV traduce como*:
  lista las palabras con que la Reina Valera 1909 traduce cada número Strong y cuántas
  veces aparece cada una (p. ej. G26: amor (71), caridad (43), amado (1), convites (1)).
  - Los datos se obtienen de bibliaparalela.com (versión en español de BibleHub) a
    través del nuevo endpoint `GET /api/bible/strongs/{código}/rv1909`, y se guardan en
    caché (`strongs-rv1909.json`) para consultarlos sin conexión.
  - No se incluye el uso en RV1960 ni LBLA: ambas versiones tienen derechos de autor y
    no existe una fuente pública con su etiquetado Strong.
- **Nueva versión bíblica: Reina Valera 1909 (RV1909)**, Antiguo y Nuevo Testamento,
  obtenida de getbible.net (`valera`). Disponible en los selectores de versión de
  *Notas de estudio* y *Preparación de sermones* y en su caché sin conexión.
  El proyecto pasa de 17 a 18 versiones.

### Cambiado
- La página de inicio muestra ahora **todas las versiones disponibles** (antes solo
  8), agrupadas en español, inglés, griego y hebreo. El contador de versiones se
  calcula a partir de la lista en lugar de un valor fijo.
- Corregido el nombre de LBLA en la página de inicio, que figuraba como
  «La Biblia de las Américas (RV1995)».
- La traducción por lotes del cliente (`_btTranslateTexts`) acepta ahora el idioma de
  origen; los comentarios bíblicos siguen usando la detección automática.

## 1.0.0 - 2026-10-26

### Agregado
- Primera versión de escritorio en Python (Windows y macOS): notas de estudio,
  preparación de sermones, 17 versiones bíblicas, concordancia Strong, comentarios
  bíblicos con traducción, corrector ortográfico, exportación a PDF y generador de
  video.
