# ADR-003 — Semántica de planificación v1

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

La spec original describía dependencias FS/SS/FF/SF con lag y reprogramación automática, pero no
definía qué ocurre en los casos que deciden si el motor es predecible: ¿qué pasa al arrastrar una
tarea que tiene predecesoras? ¿Y al quitar la dependencia después? ¿Puede una tarea resumen ser
predecesora? ¿El esfuerzo cambia la duración? Sin respuestas cerradas, el undo/redo
([ADR-008](ADR-008-store-unico-y-undo-redo.md)) no puede ser determinista y cada pantalla inventaría
su propia regla.

## Decisión

### Tareas hoja: ancla e inicio calculado

- Toda tarea es auto-programada "lo antes posible" (ASAP). No existen en v1 restricciones tipo
  "debe empezar el" ni "no terminar después de".
- Cada tarea hoja guarda `anchorDate`: la intención del usuario, equivalente a "no empezar antes
  de". Es el único dato de fecha que el usuario edita directamente.
- `startDate` y `endDate` son derivados y los calcula el engine:
  - `startDate = max(anchorDate, fecha derivada de cada predecesora)`.
  - `endDate = addWorkingDays(startDate, durationDays − 1)` para `durationDays ≥ 1`; una tarea de
    1 día empieza y termina el mismo día hábil.
  - Si `anchorDate` cae en día no laborable, se desplaza al siguiente día hábil.
- Arrastrar una barra en el Gantt o editar "Inicio" en la tabla modifica `anchorDate`. Si la tarea
  tiene predecesoras que la empujan más allá del ancla, `startDate` no cambia y la UI lo informa.
- Quitar una dependencia recalcula `startDate` con las predecesoras restantes; sin predecesoras,
  la tarea vuelve a su `anchorDate`. Así, crear y quitar una dependencia es reversible sin guardar
  estado adicional.

### Dependencias

- Tipos y fórmula de la fecha derivada, con `P` predecesora, `S` sucesora y `lag = lagDays` en días
  hábiles (negativo = adelanto):
  - `FS`: `S.start ≥ addWorkingDays(P.end, 1 + lag)`
  - `SS`: `S.start ≥ addWorkingDays(P.start, lag)`
  - `FF`: `S.end ≥ addWorkingDays(P.end, lag)` → `S.start = addWorkingDays(S.end, −(durationDays − 1))`
  - `SF`: `S.end ≥ addWorkingDays(P.start, lag − 1)`
- Los ciclos se rechazan. `detectCycle` devuelve el ciclo como lista ordenada de `wbsCode`
  (`["1.2", "1.3", "2.1", "1.2"]`) para que el mensaje de error sea legible: "La dependencia crearía
  un ciclo: 1.2 → 1.3 → 2.1 → 1.2".
- Una dependencia entre tareas del mismo par (`predecessorId`, `successorId`) es única.

### Hitos

- `isMilestone = true` implica `durationDays = 0` y `startDate = endDate`. Un hito como
  predecesora FS empuja a la sucesora a empezar el día hábil siguiente al hito.

### Tareas resumen

- `isSummary` es derivado: verdadero si la tarea tiene hijos. Sus `startDate` (mínimo de hijos),
  `endDate` (máximo de hijos), `durationDays` (días hábiles entre ambos) y `progressPct` se
  calculan por rollup y la API rechaza editarlos.
- `progressPct` del resumen es un promedio ponderado de los hijos directos según
  `Project.progressWeighting`: por `durationDays` (default; los hitos pesan 0 y no participan) o por
  `effortHours` (los hijos sin esfuerzo pesan 0). Si todos los pesos son 0, el avance es el promedio
  simple.
- **Las tareas resumen no pueden ser predecesoras ni sucesoras.** Motivo: las fechas del resumen
  dependen de sus hijos (rollup) y una dependencia haría que los hijos dependieran del resumen; el
  grafo tendría un ciclo implícito que no aparece en `Dependency` y el orden topológico dejaría de
  estar definido. MS Project lo permite con reglas especiales que confunden incluso a usuarios
  expertos. En v1 la API responde `VALIDATION` con el mensaje "Las tareas resumen no admiten
  dependencias; enlaza las subtareas". Al indentar una tarea bajo otra que tiene dependencias, la
  operación se rechaza hasta que el usuario las mueva o elimine.

### Esfuerzo y costo

- `durationDays` es fijo y lo decide el usuario. `effortHours` es informativo: no modifica la
  duración ni se recalcula al cambiar asignaciones (no hay "effort-driven scheduling").
- Horas asignadas de una asignación = `durationDays × Calendar.hoursPerDay × allocationPct / 100`,
  usando el calendario base del proyecto.
- Costo de la asignación = horas asignadas × `Resource.rate`, en `Resource.rateCurrency`; la
  conversión UF ↔ CLP para mostrar usa `Setting.ufValue`.

## Consecuencias

Positivas:

- Todo cambio es una función pura de (`anchorDate`, `durationDays`, dependencias, calendario). El
  engine es determinista y el undo es la reaplicación del comando inverso.
- El usuario tiene un solo concepto que aprender: "el inicio que pediste" versus "el inicio
  resultante".
- Los rollups y el CPM no necesitan casos especiales para resúmenes.

Negativas:

- No se pueden modelar restricciones duras ("debe terminar el 30-11") ni tareas manuales. Se
  documenta como limitación y queda en `docs/backlog.md` para v2.
- Prohibir dependencias sobre resúmenes obliga a enlazar subtareas; la importación desde MS Project
  (Paso 9) debe convertir dependencias de resúmenes en dependencias sobre la primera/última hoja y
  advertirlo en la previsualización.
- El esfuerzo no dirige la duración; quien venga de MS Project con tareas "por esfuerzo" notará la
  diferencia. Es intencional: simplifica el modelo mental y el motor.

## Alternativas descartadas

- **Guardar solo `startDate` editable y recalcular sobre él.** Al quitar una dependencia la tarea se
  quedaría donde la empujaron, y el undo de "crear dependencia" tendría que recordar el inicio previo
  de cada sucesora afectada.
- **Constraint types de MS Project (ASAP, SNET, MSO, FNLT…).** Ocho tipos con interacciones sutiles;
  el ancla cubre el 95 % de los usos con un solo concepto.
- **Permitir dependencias sobre resúmenes con propagación a hijos.** Requiere un grafo expandido y
  reglas de conflicto que ni MS Project resuelve de forma intuitiva.

## Cómo verificarla

- Tests del engine (Paso 2): "quitar dependencia vuelve al ancla", "tarea con ancla anterior a la
  predecesora empieza tras la predecesora", "lag negativo", "hito como predecesora", "dependencia
  sobre resumen rechazada", "ciclo A→B→C→A devuelve los `wbsCode` en orden".
- Test de integración (Paso 5): `PATCH /api/tasks/:id` con `startDate` en el cuerpo responde
  `VALIDATION` porque es un campo derivado; con `anchorDate` responde `{ task, affected }`.
- Property test (Paso 7): 50 operaciones aleatorias seguidas de sus inversas devuelven exactamente el
  mismo plan.
