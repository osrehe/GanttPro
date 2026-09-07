# ADR-007 — PDF con Puppeteer sobre la ruta interna `/print/gantt`

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

La exportación a PDF debe ser vectorial (texto seleccionable), paginar un Gantt que no cabe en una
hoja dividiéndolo en páginas horizontales y verticales, repetir la tabla WBS a la izquierda de cada
página, numerar "Página X de Y", y ofrecer opciones (orientación, tamaño A4/A3/Carta, rango de
fechas, escala, columnas, ruta crítica, baseline, leyenda, logo). La spec original dejaba abierta la
elección entre `@react-pdf/renderer` y Puppeteer.

El destino de despliegue es un servidor Docker propio ([ADR-004](ADR-004-postgres-unico-y-despliegue-docker.md)),
así que un Chromium headless en la imagen es viable. El Gantt se dibuja en SVG con un modelo de
layout puro ([ADR-006](ADR-006-render-del-gantt-en-svg.md)).

## Decisión

1. **Ruta interna `/print/gantt`** (`src/app/print/gantt/page.tsx`): una página de Next.js, sin
   layout de aplicación, que recibe por query string `projectId` y las opciones de exportación, y
   renderiza **páginas explícitas**: para cada combinación (bloque de filas × tramo de línea de
   tiempo) un `<section class="page">` con tamaño físico exacto (por ejemplo `297mm × 210mm` para A4
   horizontal), la tabla WBS del bloque a la izquierda, el tramo del Gantt a la derecha, encabezado
   (nombre del proyecto, fecha de estado, logo opcional) y pie ("Página X de Y", fecha de
   generación). La paginación la calcula el servidor con el modelo de layout: filas por página según
   la altura útil, columnas de tiempo por página según el ancho útil menos el de la tabla.
2. **Puppeteer** en el Route Handler `POST /api/projects/:id/export/pdf`: abre `/print/gantt?…` con
   una cookie de sesión interna de un solo uso, espera a `document.fonts.ready` y al marcador
   `data-print-ready`, y llama a `page.pdf({ format, landscape, printBackground: true,
preferCSSPageSize: true })`. El resultado se envía como `application/pdf`.
3. La ruta `/print/gantt` reutiliza los mismos componentes SVG del Gantt y la misma tabla; no hay
   segundo código de dibujo. Los estilos de impresión (`@page`, `break-after: page`) viven en un
   CSS propio.
4. La imagen Docker de producción instala Chromium del sistema y configura
   `PUPPETEER_EXECUTABLE_PATH`; en desarrollo Puppeteer descarga su propio Chromium. Un solo
   navegador se mantiene abierto y se reutiliza entre exportaciones; se cierra tras 5 minutos de
   inactividad.
5. La misma ruta sirve para la exportación **PNG** de una sola página cuando el usuario elige "imagen".

## Consecuencias

Positivas:

- Fidelidad absoluta: el PDF es exactamente lo que se ve en pantalla, con las mismas fuentes, colores
  y flechas.
- Texto vectorial y seleccionable; `pdf-parse` extrae "1.1" en el test de aceptación del Paso 9.
- Cero duplicación de renderizado: cualquier mejora del Gantt aparece en el PDF sin trabajo extra.
- Encabezados, pies y saltos de página se controlan con HTML/CSS, que ya se domina.

Negativas:

- La imagen de producción crece (~300 MB por Chromium) y consume ~150 MB de RAM por navegador
  abierto. Aceptable en un VPS; se documenta el requisito mínimo (1 GB RAM).
- Una exportación de un proyecto de 1.000 tareas puede tardar varios segundos; el botón muestra
  progreso y el handler tiene timeout de 60 s.
- La ruta de impresión debe estar protegida: solo Puppeteer, con la cookie interna, puede abrirla; no
  aparece en la navegación.
- Puppeteer en Windows (desarrollo) descarga Chromium en `npm install`; en CI se cachea.

## Alternativas descartadas

- **`@react-pdf/renderer`.** Genera PDF sin navegador, pero con sus propias primitivas (`View`,
  `Text`, `Svg`): habría que reescribir el Gantt y la tabla y mantener dos renderizadores que
  divergen. Sería la elección obligada en serverless, que no es el caso.
- **`window.print()` en el navegador del usuario.** Depende del navegador y de sus diálogos; no
  permite paginación controlada ni generar el archivo desde el servidor para adjuntar o archivar.
- **Rasterizar el SVG a imagen y meterla en un PDF (jsPDF).** Viola el requisito de texto
  seleccionable y produce archivos enormes.

## Cómo verificarla

- Test del Paso 9: `POST /api/projects/:seedId/export/pdf` con A4 horizontal devuelve un PDF cuyo
  número de páginas coincide con el calculado por el modelo de layout y del que `pdf-parse` extrae el
  texto "1.1" y "Página 1 de".
- `GET /print/gantt` sin la cookie interna responde 403.
- En el Paso 11, el contenedor de producción genera el PDF del seed sin error
  (`docker compose -f docker-compose.prod.yml exec app node scripts/smoke-pdf.mjs`).
