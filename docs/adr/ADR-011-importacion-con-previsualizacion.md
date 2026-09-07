# ADR-011 — Importación con previsualización y validación por fila

- **Estado:** Aceptada
- **Fecha:** 2026-09-07

## Contexto

El Paso 9 exige importar planes desde Excel/CSV (con plantilla descargable) y desde Microsoft
Project. Un plan importado toca todas las entidades del proyecto (jerarquía WBS, dependencias con
tipo y desfase, recursos y asignaciones) y cualquier inconsistencia se propaga al motor de
planificación: una dependencia hacia una tarea resumen, un ciclo o un salto en la jerarquía
producirían un proyecto que el engine no puede programar ([ADR-003](ADR-003-semantica-de-planificacion.md)).

Microsoft Project tiene dos formatos: el binario `.mpp` (sin librería libre confiable en Node) y el
XML MSPDI, que Project exporta desde "Guardar como" y que es el formato documentado por Microsoft.

## Decisión

1. **Dos fases: previsualizar y luego importar.** `POST /api/import/preview` recibe el archivo
   (multipart) y devuelve un `ImportPreview` (`{ plan, issues, counts }`) sin tocar la base de
   datos. `POST /api/import` recibe el **plan ya normalizado** en JSON y lo persiste. El usuario ve
   los errores por fila antes de decidir; el servidor nunca confía en el plan que recibe y vuelve a
   validarlo con la misma función (`validatePlan`) antes de escribir.
2. **Un solo modelo intermedio** (`ImportedPlan` en `src/lib/import/types.ts`) al que convergen los
   tres parsers (CSV, XLSX, MSPDI). Toda la validación y toda la escritura ocurren sobre él, así que
   agregar un formato nuevo es escribir solo un parser.
3. **Errores y avisos por fila** (`ImportIssue` con `row`, `column`, `severity`, `message` en
   español). Un `error` bloquea la importación; un `warning` (por ejemplo, un recurso mencionado que
   no está declarado y se creará vacío) no. Se validan: nombre vacío, duración inválida, fecha
   inválida, avance fuera de 0–100, sintaxis de predecesoras, WBS inexistente, autodependencia,
   dependencia sobre resumen, ciclo, saltos y duplicados en la jerarquía.
4. **La plantilla es la misma tabla que exporta el Excel.** Las nueve primeras columnas de la hoja
   `Tareas` que genera la exportación (`WBS`, `Nombre`, `Duración (días)`, `Inicio`, `Hito`,
   `Avance %`, `Predecesoras`, `Recursos`, `Notas`) son exactamente las que lee el importador, con
   sinónimos aceptados en la cabecera. Exportar e importar es un round-trip; las columnas extra se
   ignoran.
5. **MS Project: solo MSPDI (XML).** Se mapea `OutlineNumber`/`OutlineLevel` a la jerarquía,
   `PredecessorLink` a dependencias (tipo y `LinkLag` a días hábiles) y `Assignments` a asignaciones.
   El `.mpp` binario queda fuera de la v1 y se documenta el paso "Guardar como XML" en el manual.
6. **Las fechas importadas son anclas, no resultados.** Cada tarea hoja se crea con su `anchorDate` y
   el proyecto se reprograma con el engine (`rescheduleProject`) al final de la transacción, de modo
   que las fechas finales las decide siempre el motor y no el archivo de origen.
7. La importación se registra en el historial como una sola entrada `IMPORT`.

## Consecuencias

Positivas:

- El usuario corrige su archivo con mensajes concretos ("fila 12: la tarea 3.4 no existe") en vez de
  recibir un fallo genérico.
- Un plan importado siempre es programable: las mismas reglas del dominio se aplican en la
  importación y en la edición manual.
- La validación vive en código puro y se prueba con tests unitarios, sin base de datos.

Negativas:

- El archivo se parsea dos veces (previsualización y confirmación revalidan), a cambio de no
  confiar en el cliente. Para 5.000 tareas el costo es de milisegundos.
- El plan viaja completo por la red en el segundo POST; se limita a 5.000 tareas.
- MSPDI no trae calendarios por recurso ni restricciones complejas: se importa lo que el modelo v1
  entiende y el resto se descarta en silencio (documentado en el manual).

## Alternativas descartadas

- **Importar en un solo POST del archivo.** Simplifica el cliente pero impide mostrar la
  previsualización, que es un requisito explícito.
- **Guardar el archivo en el servidor entre las dos fases.** Obligaría a almacenamiento temporal y
  limpieza; el plan normalizado es más pequeño que el archivo y ya está validado.
- **Leer `.mpp` con una librería de terceros.** Las disponibles en Node son incompletas o de pago;
  MSPDI cubre el caso de uso real (exportar desde Project) sin dependencias frágiles.

## Cómo verificarla

- Tests unitarios de `rows.ts` (una prueba por regla de validación), `csv.ts`, `excel.ts` y
  `mspdi.ts`.
- Round-trip de la plantilla: `buildImportTemplate()` → xlsx → `excelToPreview()` sin errores.
- `fixtures/msproject-sample.xml` se importa sin perder ninguna dependencia (test de integración).
- e2e: importar un CSV crea el proyecto con la jerarquía y las fechas que calcula el engine; un CSV
  con errores deshabilita el botón Importar.
