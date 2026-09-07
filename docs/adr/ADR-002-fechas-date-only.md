# ADR-002 — Fechas de plan date-only

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

Las fechas de una carta Gantt son días, no instantes: una tarea "empieza el 14-09-2026", no "a las
00:00 hora de Santiago". Los errores clásicos de este dominio vienen de mezclar fechas con zonas
horarias: una tarea guardada como `2026-09-14T00:00:00-03:00` se muestra como 13 de septiembre en un
servidor en UTC, un `new Date("2026-09-14")` se interpreta en UTC pero `new Date(2026, 8, 14)` en
hora local, y el cambio de horario de verano en Chile (primer sábado de septiembre y de abril)
produce días de 23 o 25 horas que rompen cualquier aritmética basada en milisegundos.

Además, el engine debe ejecutar `addWorkingDays` y `workingDaysBetween` millones de veces al
reprogramar 1.000 tareas; construir objetos `Date` en cada llamada sería lento e innecesario.

## Decisión

1. Toda fecha de plan (`Task.anchorDate`, `startDate`, `endDate`, `Holiday.date`,
   `Project.startDate`, `Project.statusDate`, `BaselineTask.startDate`/`endDate`) es date-only.
   - En Postgres: tipo `DATE` (`@db.Date` en Prisma). Nunca `TIMESTAMP` para fechas de plan.
   - En la API, el store y el engine: string ISO `YYYY-MM-DD` (tipo `IsoDate` en
     `packages/engine/src/dates.ts`).
   - En la UI se muestra con el formato configurado en `Setting.dateFormat` (por defecto
     `dd-mm-yyyy`); el formato es solo presentación.
2. La aritmética se hace en "epoch day": días enteros desde 1970-01-01, calculados con `Date.UTC`
   (determinista, sin DST). Las utilidades son `toEpochDay`, `fromEpochDay`, `addDays`, `diffDays`,
   `dayOfWeek`, `compareIsoDates`, `minIsoDate`, `maxIsoDate`, `isIsoDate` y `assertIsoDate`.
3. Prohibido en todo el repositorio para fechas de plan: `new Date()` local, `Date#getDate`,
   `getMonth`, `setDate`, `toLocaleDateString` para calcular, y librerías de fechas (date-fns, dayjs,
   luxon) como dependencia del engine. Las marcas técnicas (`createdAt`, `updatedAt`) sí son
   `TIMESTAMPTZ` y se manejan como `Date` normales.
4. El engine precomputa, por calendario y rango del proyecto, un índice `epochDay → ordinal de día
hábil` (y su inverso). Con él, `addWorkingDays(date, n)` es una suma sobre el ordinal y
   `workingDaysBetween(a, b)` una resta: O(1) dentro del rango, O(n) solo al construir el índice.
5. Los tests corren con `TZ=UTC` (`cross-env TZ=UTC vitest run`) para que cualquier dependencia
   accidental de la zona horaria local se manifieste en CI (Ubuntu, UTC) igual que en Windows.

## Consecuencias

Positivas:

- Las fechas son idénticas en Postgres, en el servidor, en el navegador y en el Excel exportado.
- El DST chileno es irrelevante: no hay horas.
- El scheduling de 1.000 tareas cabe en el presupuesto de 50 ms del Paso 2 porque no construye
  objetos `Date`.
- Las fechas son comparables y ordenables como strings (`"2026-09-14" < "2026-10-01"`), lo que
  simplifica índices y consultas.

Negativas:

- Prisma devuelve las columnas `DATE` como `Date` a medianoche UTC; los adaptadores en `src/lib`
  deben convertirlas a `YYYY-MM-DD` con `toISOString().slice(0, 10)` y nunca con métodos locales.
  Es un punto único de conversión, pero hay que respetarlo.
- No se soportan tareas con horas (por ejemplo, "reunión de 9:00 a 11:00"). Es una limitación
  deliberada de v1: la unidad mínima de planificación es el día hábil.
- Los formularios deben validar con `isIsoDate` antes de enviar; un `2026-02-30` se rechaza con un
  mensaje en español en lugar de convertirse silenciosamente en 2 de marzo.

## Alternativas descartadas

- **`DateTime` en Prisma y `Date` en todo el código.** Es lo que produce los errores de "un día
  menos" al cambiar de zona horaria y obliga a normalizar a medianoche en cada capa.
- **`Temporal.PlainDate`.** Es exactamente el modelo correcto, pero en septiembre de 2026 aún
  requiere polyfill en Node 22 y en algunos navegadores; el polyfill pesa más que todo el engine. Se
  reconsiderará cuando sea nativo: la migración sería mecánica porque el tipo `IsoDate` ya aísla la
  representación.
- **date-fns con `UTCDate`.** Funciona, pero introduce una dependencia en el engine y objetos `Date`
  en el camino caliente del scheduling.

## Cómo verificarla

- `packages/engine/tests/dates.test.ts` cubre inversión `toEpochDay`/`fromEpochDay`, años bisiestos,
  fechas inválidas y días de la semana; debe pasar con `TZ=UTC` y también con
  `cross-env TZ=America/Santiago vitest run --project engine`.
- `grep -rn "new Date(" packages/engine/src` debe devolver solo las dos apariciones controladas de
  `dates.ts` (`Date.UTC` en `isIsoDate` y `fromEpochDay`).
- En el Paso 4, `prisma/schema.prisma` debe declarar `@db.Date` en todos los campos listados en el
  punto 1; se revisa en la aceptación del paso.
