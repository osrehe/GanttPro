# ADR-006 — Render del Gantt en SVG con virtualización y modelo de layout puro

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

La vista Gantt debe dibujar barras, corchetes de resumen, rombos de hito, flechas ortogonales de
dependencia, sombreado de no laborables, línea de "hoy" y baseline fantasma; soportar arrastre con
snap a día hábil, redimensionado, cambio de avance y creación de dependencias desde conectores; y
mantenerse fluida con 1.000 tareas (render inicial < 1,5 s, drag < 16 ms por frame). Además, el
mismo dibujo debe salir en PDF vectorial y en PNG.

Las dos opciones clásicas son SVG (elementos DOM, estilizables con CSS, con eventos por elemento) y
Canvas (un bitmap, hit-testing manual, sin texto seleccionable).

## Decisión

1. **SVG + React** para la línea de tiempo. Cada fila visible es un `<g>` con su barra, etiqueta,
   handles y conectores; las flechas de dependencia van en una capa `<g>` propia.
2. **Virtualización vertical**: solo se montan las filas del viewport más un margen (≈ 40–60 filas
   con altura de fila de 32 px en una pantalla de 1080 px). Las flechas se filtran a las que tocan
   alguna fila visible. Con 1.000 tareas el DOM tiene del orden de 60 filas, no 1.000.
3. **Modelo de layout puro** en `packages/engine/src/layout.ts`: recibe tareas ya programadas, la
   escala (día/semana/mes/trimestre), el ancho por unidad, la altura de fila y el rango visible, y
   devuelve geometría (`x`, `y`, `width`, tipo de barra, puntos de las flechas, columnas de
   cabecera). No conoce React ni el DOM.
4. El mismo modelo alimenta tres consumidores: el componente `Gantt` de la vista web, la exportación
   PNG (serializa el mismo SVG a `canvas` y descarga) y la ruta `/print/gantt` que renderiza páginas
   para el PDF ([ADR-007](ADR-007-pdf-con-puppeteer.md)).
5. Interacción: los eventos de puntero se capturan en el contenedor (`pointerdown` sobre el handle,
   `pointermove`/`pointerup` en el documento); durante el drag se actualiza solo un estado local
   de "previsualización" y se ejecuta el engine en el cliente para mostrar las sucesoras
   desplazadas; al soltar se despacha un único comando al store ([ADR-008](ADR-008-store-unico-y-undo-redo.md)).
6. Accesibilidad: cada barra es focusable (`tabIndex`, `role="button"`, `aria-label` con nombre,
   fechas y avance); las flechas del teclado mueven la tarea un día hábil.

## Consecuencias

Positivas:

- Hit-testing gratis: cada barra, handle y flecha es un elemento con sus propios eventos y estilos
  hover/focus por CSS.
- El texto es texto: seleccionable en pantalla, vectorial en el PDF de Chromium, legible por lectores
  de pantalla.
- Depurar es abrir el inspector; los snapshot tests del layout comparan objetos, no píxeles.
- Un solo código de dibujo para pantalla, PNG y PDF.

Negativas:

- Sin virtualización, 1.000 filas × (barra + etiqueta + handles) serían ~5.000 nodos y el drag se
  arrastraría. La virtualización es obligatoria, no opcional, y complica el scroll sincronizado con
  la tabla (misma fuente de `scrollTop`).
- Las flechas ortogonales que evitan cruzar barras requieren cálculo geométrico propio; en Canvas
  sería igual, así que no es un costo diferencial.
- El sombreado de fines de semana en escala "día" con 2 años visibles genera cientos de `<rect>`; se
  mitiga con un `<pattern>` SVG repetido por semana.

## Alternativas descartadas

- **Canvas 2D.** Rinde mejor con decenas de miles de elementos, pero 1.000 tareas con virtualización
  no lo necesitan; pierde texto vectorial, accesibilidad y hit-testing nativo, y obligaría a un
  segundo renderizador para el PDF.
- **Librería comercial o open source de Gantt (dhtmlx, Bryntum, frappe-gantt, gantt-task-react).**
  Las comerciales tienen licencia; las libres no cubren ancla, tipos SS/FF/SF con lag, corchetes de
  resumen y baseline a la vez, y su modelo de datos chocaría con el engine. El Gantt es el núcleo
  del producto; conviene poseerlo.
- **HTML/CSS con `div` absolutos.** Viable para barras, pero las flechas ortogonales y los rombos
  exigen SVG de todos modos; mezclar ambos complica el zoom.

## Cómo verificarla

- `packages/engine/tests/layout.test.ts` (Paso 3): snapshots de geometría para las cuatro escalas
  y un test de que dos tareas con el mismo `startDate`/`endDate` producen la misma `x`/`width`.
- Test de rendimiento e2e (Paso 7) con `seed-perf`: `performance.now()` antes del montaje y tras el
  primer paint < 1.500 ms; promedio de `requestAnimationFrame` durante un drag de 3 s < 16 ms;
  `document.querySelectorAll("[data-gantt-row]").length` ≤ 80 con 1.000 tareas.
- Auditoría axe (Paso 10): cero violaciones críticas en la vista Gantt; las barras son alcanzables
  con Tab.
