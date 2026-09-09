# Especificación funcional — GanttPro

Versión 1 (2026-09-06). Casos de uso con criterios de aceptación en formato Dado / Cuando /
Entonces. Los nombres de entidades y campos son los de `modelo-datos.md`; las decisiones de
arquitectura están en `arquitectura.md` y `../adr/`. La matriz caso de uso ↔ paso del plan está en
`plan-de-pasos.md`.

## Alcance

GanttPro permite planificar y hacer seguimiento de proyectos mediante una estructura de desglose
del trabajo (WBS) con jerarquía ilimitada, dependencias entre tareas con reprogramación automática,
recursos con detección de sobreasignación, líneas base, ruta crítica, vistas Tabla, Gantt y
Recursos, exportación a Excel, PDF y PNG, importación desde Excel/CSV y MS Project XML, usuarios
con roles por proyecto, colaboración simultánea, comentarios e historial de cambios.

Fuera de alcance en v1: tareas con programación manual o restricciones distintas de "no empezar
antes de" (`anchorDate`), dependencias hacia o desde tareas resumen, planificación dirigida por
esfuerzo, calendarios por tarea, multi-proyecto, integración con APIs externas de valor UF y
notificaciones en tiempo real por SSE.

## Glosario

| Término                 | Definición                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WBS                     | Estructura jerárquica de tareas. Cada tarea tiene un `wbsCode` ("1", "1.1", "1.1.2") derivado de su posición.                                                             |
| Tarea hoja              | Tarea sin hijos. Tiene `anchorDate`, `durationDays` y `progressPct` editables.                                                                                            |
| Tarea resumen           | Tarea con hijos (`isSummary = true`). Sus fechas, duración y avance se derivan de sus descendientes; no admite dependencias ni asignaciones.                              |
| Hito                    | Tarea hoja con `isMilestone = true` y `durationDays = 0`; `startDate = endDate`.                                                                                          |
| Ancla (`anchorDate`)    | Intención del usuario para una tarea hoja: la fecha antes de la cual no debe empezar. El inicio real es el máximo entre el ancla y la fecha derivada de sus predecesoras. |
| Día hábil               | Día incluido en `Calendar.workingDays` y que no es `Holiday`. Toda duración, lag y holgura se expresa en días hábiles.                                                    |
| Lag / lead              | `Dependency.lagDays`: desfase en días hábiles entre predecesora y sucesora. Positivo = lag (espera); negativo = lead (adelanto).                                          |
| Reprogramación          | Recalculo de `startDate`/`endDate` de las sucesoras (y de los resúmenes) tras un cambio.                                                                                  |
| Ruta crítica            | Conjunto de tareas con holgura total 0 (`isCritical = true`); cualquier atraso en ellas atrasa el fin del proyecto.                                                       |
| Holgura total / libre   | `totalFloatDays`: días hábiles que una tarea puede atrasarse sin mover el fin del proyecto. `freeFloatDays`: sin mover el inicio temprano de ninguna sucesora.            |
| Línea base (`Baseline`) | Fotografía con nombre y fecha de `startDate`, `endDate`, `durationDays` y `progressPct` de todas las tareas (`BaselineTask`), para comparar plan vs. real.                |
| Fecha de estado         | `Project.statusDate`: fecha de corte para calcular avance esperado y atraso. Si es nula se usa la fecha de hoy.                                                           |
| Sobreasignación         | Un `Resource` cuya suma de horas asignadas en un día supera `capacityHoursPerDay`.                                                                                        |
| Calendario de ejemplo   | En los escenarios de este documento: lunes a viernes, 8 h/día, feriados 18-09-2026 (viernes) y 19-09-2026 (sábado). El lunes 07-09-2026 es día hábil.                     |

Convención de fechas en los escenarios: se escriben `dd-mm-yyyy` como en la UI; la API y el engine
las transportan como `YYYY-MM-DD`. La duración cuenta el día de inicio: una tarea de 5 días que
empieza el lunes 07-09-2026 termina el viernes 11-09-2026.

---

## Proyectos

### UC-01 — Crear proyecto

**Actor:** usuario autenticado · **Rol mínimo:** cualquier usuario (queda como `ADMIN` del proyecto creado) · **Paso del plan:** 6

Crea un `Project` con su `Calendar` base y registra al creador como `ProjectMember` con rol `ADMIN`.

**Reglas:**

- `name` obligatorio, 1–120 caracteres. `startDate` obligatoria; por defecto, hoy.
- Se crea un `Calendar` con `workingDays = [1,2,3,4,5]` y `hoursPerDay = 8`, sin feriados, y se
  asigna a `Project.calendarId`.
- `status = ACTIVE`, `progressWeighting = DURATION`, `statusDate` nula.
- Se registra `AuditLog` con `action = CREATE`.

**Criterios de aceptación:**

- Dado un usuario autenticado en la página de proyectos, cuando completa nombre "Portal clientes" y
  fecha de inicio 07-09-2026 y confirma, entonces el proyecto aparece en la lista con 0 tareas, 0 %
  de avance, estado "Activo", y el usuario figura como administrador.
- Dado el formulario de creación, cuando el nombre está vacío, entonces el botón de confirmar está
  deshabilitado y se muestra "El nombre es obligatorio".

### UC-02 — Duplicar proyecto

**Actor:** miembro del proyecto · **Rol mínimo:** `ADMIN` del proyecto origen · **Paso del plan:** 6

Crea una copia completa del proyecto: calendario y feriados, tareas con su jerarquía, dependencias,
recursos y asignaciones. No copia baselines, comentarios, historial ni enlaces compartidos.

**Reglas:**

- El nombre por defecto es "Copia de {nombre}"; el usuario puede cambiarlo y elegir una nueva
  `startDate`. Si la cambia, todas las `anchorDate` se desplazan la misma cantidad de días hábiles y
  se reprograma el proyecto completo.
- `progressPct` de todas las tareas queda en 0 si el usuario marca "Reiniciar avance" (por defecto
  activado).
- Los `wbsCode` se conservan idénticos.
- El duplicador queda como `ADMIN` del nuevo proyecto; el resto de miembros no se copia.

**Criterios de aceptación:**

- Dado el proyecto seed con 40 tareas y 25 dependencias, cuando el administrador lo duplica con
  "Reiniciar avance" y la misma fecha de inicio, entonces el nuevo proyecto tiene 40 tareas con los
  mismos `wbsCode`, `startDate` y `endDate`, 25 dependencias, `progressPct = 0` en todas y ninguna
  baseline.
- Dado el mismo proyecto, cuando se duplica con una `startDate` 5 días hábiles posterior, entonces
  cada tarea hoja tiene un `anchorDate` 5 días hábiles posterior al original y las fechas de todas las
  tareas se desplazan respetando feriados.

### UC-03 — Archivar y restaurar proyecto

**Actor:** administrador del proyecto · **Rol mínimo:** `ADMIN` · **Paso del plan:** 6

Un proyecto archivado (`status = ARCHIVED`, `archivedAt` no nulo) queda en solo lectura y sale de la
lista principal. Se puede restaurar.

**Reglas:**

- Toda mutación sobre un proyecto archivado responde `409 CONFLICT` con mensaje "El proyecto está
  archivado".
- Los enlaces compartidos siguen funcionando en lectura.
- Se registra `AuditLog` (`UPDATE` de `Project.status`).

**Criterios de aceptación:**

- Dado un proyecto activo, cuando el administrador lo archiva, entonces desaparece de la lista por
  defecto, aparece con el filtro "Archivados" y en su vista Tabla todos los controles de edición están
  deshabilitados.
- Dado un proyecto archivado, cuando un `EDITOR` intenta `PATCH /api/tasks/:id`, entonces recibe
  `409` con código `CONFLICT`.
- Dado un proyecto archivado, cuando el administrador lo restaura, entonces vuelve a `ACTIVE` y la
  edición queda habilitada.

### UC-39 — Eliminar un proyecto definitivamente

**Actor:** administrador del proyecto · **Rol mínimo:** `ADMIN` · **Paso del plan:** 12

Borra un proyecto y todo lo que cuelga de él. Es irreversible: para quitar un proyecto de la vista
sin perderlo está archivar (UC-03).

**Reglas:**

- Solo un administrador del proyecto puede eliminarlo. Un editor o un lector reciben `403`.
- El diálogo exige escribir el nombre exacto del proyecto y muestra qué se va a borrar (tareas,
  dependencias, recursos, asignaciones, líneas base, comentarios, enlaces compartidos y el historial
  de cambios). El botón de confirmación está deshabilitado hasta que el nombre coincide.
- El borrado ocurre en una transacción y arrastra en cascada todo lo del proyecto. Los enlaces
  compartidos dejan de resolver y muestran "El enlace no está disponible".
- El `AuditLog` del proyecto desaparece con él, así que la eliminación se anota en
  `ProjectDeletion`: nombre, quién, cuándo y cuántas tareas, dependencias y recursos tenía. Ese
  registro no se borra y es lo que permite responder "¿qué pasó con el proyecto X?".
- Antes de borrar se ofrece descargar el libro Excel del proyecto (UC-26) desde el mismo diálogo,
  para que quede una copia fuera de la aplicación.
- Un proyecto archivado también se puede eliminar; no hace falta restaurarlo antes.

**Criterios de aceptación:**

- Dado un proyecto con tareas, cuando el administrador escribe su nombre y confirma, entonces el
  proyecto desaparece del listado, `GET /api/projects/:id` responde `403` y queda una fila en
  `ProjectDeletion` con el nombre, el usuario y los conteos.
- Dado el diálogo abierto, cuando el nombre escrito no coincide exactamente, entonces el botón
  Eliminar sigue deshabilitado.
- Dado un proyecto con un enlace de solo lectura activo, cuando se elimina, entonces ese enlace
  responde con el aviso de enlace no disponible.
- Dado un editor del proyecto, cuando llama a `DELETE /api/projects/:id`, entonces recibe `403`
  con código `FORBIDDEN` y el proyecto sigue existiendo.

### UC-04 — Configurar calendario laboral y feriados

**Actor:** administrador del proyecto · **Rol mínimo:** `ADMIN` · **Paso del plan:** 10 (UI) · engine en Paso 2

Edita `Calendar.workingDays`, `Calendar.hoursPerDay` y la lista de `Holiday` del calendario base
del proyecto. Permite cargar los feriados de Chile de un año desde el catálogo estático incluido en
la aplicación.

**Reglas:**

- `workingDays` no puede quedar vacío. `hoursPerDay` entre 1 y 24.
- Feriados únicos por fecha en el calendario; los que caen en día no laborable se guardan igual (no
  afectan el cálculo).
- Cargar feriados de un año agrega los que falten y no duplica los existentes.
- Cambiar el calendario reprograma el proyecto completo y devuelve las tareas afectadas.

**Criterios de aceptación:**

- Dado el calendario del proyecto sin feriados y una tarea de 5 días con `anchorDate` 14-09-2026,
  cuando el administrador agrega el feriado 18-09-2026, entonces la tarea pasa de terminar el
  18-09-2026 a terminar el 21-09-2026 y la respuesta incluye esa tarea como afectada.
- Dado el calendario sin feriados de 2026, cuando el administrador pulsa "Cargar feriados de Chile
  2026", entonces se agregan los feriados legales de 2026 (incluidos 01-01, 18-09, 19-09, 25-12) y una
  segunda carga no crea duplicados.
- Dado el formulario del calendario, cuando se desmarcan todos los días de la semana, entonces no se
  puede guardar y se muestra "Debe haber al menos un día laborable".

---

## Tareas y WBS

### UC-05 — Crear tarea, subtarea e hito

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 6 · engine en Paso 2

Crea una `Task` hoja como hermana de la tarea seleccionada, como hija de ella, o como hito.

**Reglas:**

- "Nueva tarea" inserta debajo de la seleccionada, al mismo nivel (`parentId` igual, `orderIndex`
  siguiente; los hermanos posteriores se desplazan). Sin selección, se agrega al final del nivel raíz.
- "Nueva subtarea" inserta como último hijo de la seleccionada. Si la seleccionada era hoja, se
  convierte en resumen; si tenía dependencias o asignaciones, la acción se rechaza con
  `422 VALIDATION` y el mensaje "La tarea {wbsCode} tiene dependencias o asignaciones; quítalas antes
  de agregarle subtareas" (la UI ofrece quitarlas y continuar).
- Valores por defecto: `name = "Nueva tarea"`, `durationDays = 1`, `progressPct = 0`,
  `status = NOT_STARTED`, `priority = MEDIUM`, `anchorDate` = `startDate` de la tarea seleccionada
  (o `Project.startDate` si no hay selección).
- "Nuevo hito": `isMilestone = true`, `durationDays = 0`, `name = "Nuevo hito"`.
- Todos los `wbsCode` afectados se recalculan y se devuelven en la respuesta.

**Criterios de aceptación:**

- Dado un proyecto vacío con `startDate` 07-09-2026, cuando el editor pulsa "Nueva tarea" tres veces,
  entonces existen las tareas 1, 2 y 3, cada una con `anchorDate`, `startDate` y `endDate`
  07-09-2026 y `durationDays = 1`.
- Dado la tarea 2 seleccionada, cuando el editor pulsa "Nueva subtarea", entonces se crea la tarea
  2.1, la tarea 2 pasa a `isSummary = true` y la tarea 3 conserva su código.
- Dado la tarea 3 seleccionada, cuando el editor pulsa "Nuevo hito", entonces se crea la tarea 4 con
  `isMilestone = true`, `durationDays = 0` y `startDate = endDate`.

### UC-06 — Editar campos de una tarea

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 6 · API en Paso 5

Modifica los campos editables de una tarea desde la tabla o el panel de detalle:
`name`, `description`, `anchorDate`, `durationDays`, `effortHours`, `progressPct`, `status`,
`priority`, `color`, `isMilestone`, `notes`.

**Reglas:**

- En una tarea resumen solo son editables `name`, `description`, `priority`, `color` y `notes`.
- `durationDays` ≥ 1 salvo hito (= 0). Marcar `isMilestone` fuerza `durationDays = 0`;
  desmarcarlo fija `durationDays = 1`.
- `progressPct` 0–100. Cambiarlo actualiza `status` automáticamente (0 → `NOT_STARTED`, 1–99 →
  `IN_PROGRESS`, 100 → `DONE`) salvo que el estado sea `ON_HOLD` o `CANCELLED`.
- Editar `startDate` o `endDate` desde la UI se traduce a: `startDate` → nuevo `anchorDate`;
  `endDate` → nuevo `durationDays` calculado en días hábiles desde `startDate`.
- La respuesta de `PATCH /api/tasks/:id` incluye la tarea y todas las tareas afectadas por la
  reprogramación; la UI las resalta durante 1 segundo.
- Cada edición genera un `AuditLog` con `before`/`after` del campo.

**Criterios de aceptación:**

- Dado la tarea 1 con `startDate` 07-09-2026 y `durationDays = 5`, cuando el editor escribe
  21-09-2026 en la columna Fin, entonces `durationDays` pasa a 10 (los días hábiles del 07-09 al
  21-09, sin el feriado 18-09).
- Dado la tarea 1 con `progressPct = 0`, cuando el editor ingresa 50, entonces `status` pasa a
  `IN_PROGRESS`; cuando ingresa 100, pasa a `DONE`.
- Dado una tarea resumen, cuando el editor intenta escribir en la columna Duración, entonces la
  celda no entra en modo edición y el tooltip indica "Calculado a partir de las subtareas".
- Dado una edición de `durationDays` en la tarea 1 con una sucesora, cuando la API responde, entonces
  la respuesta contiene la sucesora en `affected` y su fila se resalta.

### UC-07 — Indentar, desindentar y reordenar tareas (renumeración WBS)

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 6 · engine en Paso 2 · API en Paso 5

Cambia la posición de una tarea en el WBS con Tab / Shift+Tab y mover arriba/abajo, o arrastrando
la fila. Toda la operación se resuelve con `POST /api/tasks/:id/move`, que devuelve todas las
tareas del proyecto con sus `wbsCode` recalculados.

**Reglas:**

- Indentar: la tarea pasa a ser el último hijo de su hermano anterior. Sin hermano anterior no se
  puede indentar. Si el hermano anterior tiene dependencias o asignaciones, se rechaza con
  `422 VALIDATION` (mismo mensaje de UC-05).
- Desindentar: la tarea pasa a ser hermana de su padre, inmediatamente después de él. Los hermanos
  que estaban después de la tarea pasan a ser sus hijos (comportamiento de MS Project). Una tarea de
  nivel raíz no se puede desindentar.
- Mover arriba/abajo intercambia `orderIndex` con el hermano adyacente. La tarea se mueve con todo su
  subárbol.
- Una tarea no puede moverse bajo uno de sus descendientes.
- Las dependencias y asignaciones de las tareas movidas se conservan; se reprograma el proyecto
  porque el rollup de los resúmenes cambia.
- Si un padre se queda sin hijos vuelve a ser hoja: `isSummary = false`, `anchorDate` = su
  `startDate` anterior, `durationDays` = su duración anterior.

**Criterios de aceptación:**

- Dado un proyecto con las tareas A, B y C al nivel raíz (1, 2, 3), cuando el editor selecciona B y
  pulsa Tab, entonces los códigos son A = 1, B = 1.1, C = 2 y A pasa a ser resumen.
- Dado el estado anterior, cuando el editor selecciona C y pulsa Tab, entonces los códigos son
  A = 1, B = 1.1, C = 1.2.
- Dado el estado anterior, cuando el editor selecciona B y pulsa Shift+Tab, entonces B pasa al nivel
  raíz después de A y C pasa a ser hija de B: A = 1, B = 2, C = 2.1; A vuelve a ser hoja con su
  `anchorDate` original.
- Dado un proyecto con 1, 1.1, 1.2, 2, cuando el editor mueve la tarea 1 hacia abajo, entonces los
  códigos son 1 (antes 2), 2 (antes 1), 2.1 (antes 1.1), 2.2 (antes 1.2) y todas las dependencias
  entre las tareas se conservan.
- Dado la tarea 1 con hijos 1.1 y 1.2, cuando el editor intenta arrastrar la tarea 1 bajo 1.2,
  entonces la operación se rechaza con "Una tarea no puede moverse dentro de sus propias subtareas".
- Dado la tarea 1 hoja con una dependencia hacia la tarea 3, cuando el editor selecciona la tarea 2 y
  pulsa Tab, entonces se rechaza con `422 VALIDATION` y la UI ofrece "Quitar dependencias de la tarea
  1 y continuar".

### UC-08 — Eliminar tarea

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 6 · API en Paso 5

Elimina una tarea y, en cascada, sus descendientes, `Dependency`, `Assignment`, `Comment` y
`BaselineTask` asociados.

**Reglas:**

- Requiere confirmación; el diálogo indica cuántas subtareas y dependencias se eliminarán.
- Los hermanos posteriores se compactan (`orderIndex` contiguos) y se recalculan los `wbsCode`.
- Las sucesoras que pierden una predecesora se reprograman (vuelven a su `anchorDate` si no les queda
  otra restricción).
- Se registra `AuditLog` con `action = DELETE` y el `before` completo del subárbol, lo que permite
  deshacer.

**Criterios de aceptación:**

- Dado un proyecto con 1, 1.1, 1.2, 2 y una dependencia 1.2 → 2 (FS), cuando el editor elimina la
  tarea 1 y confirma, entonces solo queda la tarea 1 (antes 2), la dependencia desaparece y la tarea
  vuelve a su `anchorDate`.
- Dado el diálogo de confirmación, cuando el editor cancela, entonces nada cambia.

### UC-09 — Tareas resumen: rollup de fechas y avance ponderado

**Actor:** sistema · **Rol mínimo:** — · **Paso del plan:** 6 (visualización) · engine en Paso 2

Toda tarea con hijos deriva `startDate`, `endDate`, `durationDays` y `progressPct` de sus
descendientes hoja.

**Reglas:**

- `startDate` = mínimo de los `startDate` de los hijos; `endDate` = máximo de los `endDate`.
- `durationDays` = días hábiles entre `startDate` y `endDate` inclusive.
- `progressPct` ponderado según `Project.progressWeighting`:
  - `DURATION`: Σ(`progressPct` × `durationDays`) / Σ(`durationDays`) sobre las hojas descendientes.
    Los hitos (duración 0) no pesan. Si todas las hojas son hitos, promedio simple.
  - `EFFORT`: idéntico usando `effortHours`; las hojas sin `effortHours` se ponderan con 0 y, si
    ninguna tiene esfuerzo, se usa promedio simple.
- El resultado se redondea al entero más cercano.
- El rollup se propaga hacia arriba hasta la raíz.

**Criterios de aceptación:**

- Dado la tarea 1 con hijas 1.1 (`anchorDate` 07-09-2026, `durationDays` 5, `progressPct` 40) y 1.2
  (`anchorDate` 14-09-2026, `durationDays` 5, `progressPct` 0), cuando el engine reprograma, entonces
  1.2 termina el 21-09-2026 (feriado 18-09) y la tarea 1 muestra `startDate` 07-09-2026, `endDate`
  21-09-2026, `durationDays` 10 y `progressPct` 20.
- Dado el caso anterior más el hito 1.3 el 21-09-2026 con `progressPct` 0, cuando se recalcula,
  entonces la tarea 1 mantiene `progressPct` 20 (el hito no pesa) y `endDate` 21-09-2026.
- Dado el mismo proyecto con `progressWeighting = EFFORT`, 1.1 con `effortHours` 40 y 1.2 con
  `effortHours` 120, cuando se recalcula, entonces la tarea 1 muestra `progressPct` 10.
- Dado la tarea 1.2 con `progressPct` 100 y 1.1 con 40, cuando se recalcula con `DURATION`, entonces
  la tarea 1 muestra 70 y su `status` es `IN_PROGRESS`.

---

## Dependencias y programación

### UC-10 — Crear y editar dependencias

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 6 (editor en panel) y 7 (drag en Gantt) · engine en Paso 2 · API en Paso 5

Crea, modifica o elimina una `Dependency` entre dos tareas hoja, con `type` FS/SS/FF/SF y
`lagDays`. Se puede hacer desde la columna Predecesoras ("3FS+2d; 5SS"), el panel de detalle o
arrastrando conectores en el Gantt.

**Reglas:**

- Semántica (todas las fechas en días hábiles; el resultado es una cota mínima que se combina con el
  ancla mediante máximo):
  - FS: la sucesora empieza el día hábil siguiente al `endDate` de la predecesora, desplazado
    `lagDays`.
  - SS: la sucesora empieza el `startDate` de la predecesora desplazado `lagDays`.
  - FF: la sucesora termina el `endDate` de la predecesora desplazado `lagDays`; su inicio se obtiene
    restando su duración.
  - SF: la sucesora termina el día hábil anterior al `startDate` de la predecesora desplazado
    `lagDays`.
- `lagDays` entero, puede ser negativo (lead). Un lead nunca hace que la sucesora empiece antes de su
  `anchorDate`.
- No se permite: predecesora = sucesora, tareas de proyectos distintos, tarea resumen en cualquier
  extremo, dependencia duplicada entre el mismo par (se edita la existente).
- Si la nueva dependencia cierra un ciclo, se rechaza con `422` código `CYCLE` y `details.cycle`
  con los `wbsCode` del ciclo en orden; el mensaje es "La dependencia crearía un ciclo: 1.2 → 2.1 →
  3 → 1.2".
- Formato de texto en la columna Predecesoras: lista separada por ";" de `{wbsCode}{type}{±lag}d`;
  `FS` y lag 0 pueden omitirse ("3" equivale a "3FS+0d").

**Criterios de aceptación:**

- Dado las tareas 1 (07-09-2026 a 11-09-2026) y 2 (`anchorDate` 07-09-2026, 3 días), cuando el editor
  escribe "1" en Predecesoras de la tarea 2, entonces se crea una dependencia FS con `lagDays` 0 y la
  tarea 2 pasa a 14-09-2026 – 16-09-2026.
- Dado el caso anterior, cuando el editor cambia el texto a "1FS+2d", entonces la tarea 2 pasa a
  16-09-2026 – 21-09-2026 (16, 17 y 21; el 18 es feriado).
- Dado el caso anterior, cuando el editor cambia a "1FS-1d", entonces la tarea 2 empieza el
  11-09-2026 y termina el 15-09-2026.
- Dado las mismas tareas, cuando el editor escribe "1SS", entonces la tarea 2 empieza el 07-09-2026 y
  termina el 09-09-2026.
- Dado las mismas tareas, cuando el editor escribe "1FF", entonces la tarea 2 termina el 11-09-2026 y
  empieza el 09-09-2026.
- Dado las tareas 1, 2 y 3 con dependencias 1 → 2 y 2 → 3, cuando el editor intenta crear 3 → 1,
  entonces recibe `422 CYCLE` con `details.cycle = ["1", "2", "3", "1"]` y la UI muestra el mensaje
  con el ciclo; nada cambia.
- Dado la tarea 1 resumen, cuando el editor arrastra un conector desde 1 hacia la tarea 2 en el Gantt,
  entonces el conector no se activa y el tooltip indica "Las tareas resumen no admiten dependencias".
- Dado una dependencia existente 1 → 2 FS, cuando el editor hace clic en la flecha y elige SS con lag
  1, entonces la dependencia se actualiza (no se crea otra) y la tarea 2 se reprograma.

### UC-11 — Reprogramación automática de sucesoras

**Actor:** sistema · **Rol mínimo:** — · **Paso del plan:** 5 (API) · engine en Paso 2

Cualquier cambio en `anchorDate`, `durationDays`, dependencias, calendario o jerarquía recalcula en
orden topológico las fechas de todas las sucesoras directas e indirectas y el rollup de sus
resúmenes. `PATCH /api/tasks/:id` devuelve `{ task, affected }` con solo las tareas cuyas fechas,
duración, avance o `wbsCode` cambiaron.

**Reglas:**

- Inicio de una hoja = máximo entre `anchorDate` y la cota de cada predecesora.
- La reprogramación nunca adelanta una tarea por debajo de su `anchorDate`.
- Hitos sucesores toman la fecha de inicio calculada (con FS, el día hábil siguiente al fin de la
  predecesora; para "el mismo día" se usa FF).
- El engine se ejecuta en el servidor como fuente de verdad y en el cliente como previsualización
  optimista; ambos deben dar el mismo resultado (mismo código).
- Con 1.000 tareas y 1.500 dependencias, el recalculo completo tarda menos de 50 ms.

**Criterios de aceptación:**

- Dado A (`anchorDate` 07-09-2026, 5 días), B (3 días, FS de A) y C (2 días, FS de B), cuando el
  editor cambia `anchorDate` de A a 10-09-2026, entonces A termina el 16-09-2026, B pasa a
  17-09-2026 – 22-09-2026 (17, 21, 22), C pasa a 23-09-2026 – 24-09-2026 y `affected` contiene B, C y
  los resúmenes de A, B y C si existen.
- Dado la misma cadena, cuando el editor cambia `durationDays` de A de 5 a 4, entonces A termina el
  10-09-2026, B pasa a 11-09-2026 – 15-09-2026 y C a 16-09-2026 – 17-09-2026.
- Dado B con `anchorDate` 21-09-2026 y predecesora A que termina el 11-09-2026, cuando A se acorta a 2
  días, entonces B sigue empezando el 21-09-2026 (su ancla manda) y no aparece en `affected`.
- Dado el seed de rendimiento (1.000 tareas, 1.500 dependencias), cuando se mueve la primera tarea de
  la cadena más larga, entonces `scheduleProject` tarda menos de 50 ms en el test de Vitest.

### UC-12 — Mover una tarea con predecesoras (anchorDate)

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 7 (drag en Gantt) y 6 (fecha en tabla) · engine en Paso 2

Arrastrar una barra o escribir una nueva fecha de inicio cambia únicamente `anchorDate`; el inicio
efectivo sigue siendo el máximo entre el ancla y lo que imponen las predecesoras.

**Reglas:**

- Mover hacia adelante más allá de la cota de las predecesoras: la tarea se atrasa y sus sucesoras se
  reprograman.
- Mover hacia atrás por debajo de la cota: se guarda el ancla, pero la barra vuelve a la posición
  impuesta y la UI muestra "No puede empezar antes del {fecha} por la dependencia {wbsCode}{type}".
- Mover una tarea resumen arrastra todas sus hojas descendientes la misma cantidad de días hábiles
  (cambia sus `anchorDate`); la resumen en sí no tiene ancla.
- Arrastrar un hito cambia su ancla igual que una tarea.

**Criterios de aceptación:**

- Dado A (07-09-2026 – 11-09-2026) y B (`anchorDate` 07-09-2026, 3 días, FS de A, por tanto
  14-09-2026 – 16-09-2026), cuando el editor arrastra B dos días hábiles a la derecha, entonces
  `anchorDate` de B es 16-09-2026, B queda en 16-09-2026 – 21-09-2026 y la sucesora de B, si existe, se
  reprograma.
- Dado el estado anterior, cuando el editor arrastra B hasta el 09-09-2026, entonces `anchorDate` de B
  es 09-09-2026, B se muestra en 14-09-2026 – 16-09-2026 y aparece el aviso "No puede empezar antes
  del 14-09-2026 por la dependencia 1FS".
- Dado el estado anterior, cuando el editor acorta A a 2 días (termina el 08-09-2026), entonces B pasa
  a empezar el 09-09-2026, porque ahora su ancla es la restricción activa.
- Dado la resumen 1 con hojas 1.1 (ancla 07-09-2026) y 1.2 (ancla 14-09-2026), cuando el editor
  arrastra la barra de 1 tres días hábiles a la derecha, entonces 1.1 tiene ancla 10-09-2026 y 1.2
  ancla 17-09-2026.

### UC-13 — Quitar una dependencia (retorno al ancla)

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 6 (tabla y panel) y 7 (popover en flecha) · engine en Paso 2

Eliminar una `Dependency` recalcula la sucesora: sin otras predecesoras, vuelve a su `anchorDate`.

**Reglas:**

- La eliminación es inmediata (sin confirmación) porque es deshacible.
- La sucesora conserva su `durationDays` y `progressPct`.
- Se reprograman las sucesoras de la sucesora.

**Criterios de aceptación:**

- Dado B (`anchorDate` 07-09-2026, 3 días) con predecesora A FS que la empuja a 14-09-2026, cuando el
  editor elimina la dependencia, entonces B vuelve a 07-09-2026 – 09-09-2026.
- Dado B con dos predecesoras A (cota 14-09-2026) y D (cota 10-09-2026), cuando el editor elimina la
  dependencia con A, entonces B pasa a empezar el 10-09-2026.
- Dado B con `anchorDate` 16-09-2026 (movida previamente por el usuario) y predecesora A con cota
  14-09-2026, cuando se elimina la dependencia, entonces B permanece en 16-09-2026.

### UC-14 — Cambiar duración y avance desde el Gantt

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 7

Arrastrar el borde derecho de una barra cambia `durationDays`; arrastrar el handle interior cambia
`progressPct`. Ambas acciones son comandos del mismo store que la tabla.

**Reglas:**

- El redimensionado hace snap a días hábiles: no puede terminar en fin de semana ni feriado; mínimo
  1 día (0 solo para hitos, que no se redimensionan).
- El handle de avance hace snap a múltiplos de 5 %; el tooltip muestra el porcentaje durante el
  arrastre.
- Al soltar, se envía un único `PATCH`; las sucesoras afectadas se resaltan.

**Criterios de aceptación:**

- Dado la tarea 1 (14-09-2026, 4 días → termina 17-09-2026), cuando el editor arrastra el borde
  derecho un día hábil, entonces la barra termina el 21-09-2026 (salta el feriado 18-09 y el fin de
  semana) y `durationDays` es 5.
- Dado la tarea 1 con `progressPct` 0, cuando el editor arrastra el handle hasta la mitad de la barra,
  entonces `progressPct` es 50 y `status` pasa a `IN_PROGRESS`.

---

## Recursos

### UC-15 — Gestionar recursos

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 6

CRUD de `Resource` del proyecto: `name`, `type`, `email`, `rate`, `rateCurrency`,
`capacityHoursPerDay`, `calendarId` (calendario propio opcional), `color`, `isActive`.

**Reglas:**

- `rate` ≥ 0; `capacityHoursPerDay` > 0.
- Un recurso con asignaciones no se elimina: se desactiva (`isActive = false`) y deja de ofrecerse
  para nuevas asignaciones. Un recurso sin asignaciones sí puede eliminarse.
- El calendario propio se crea a partir de una copia del calendario base del proyecto y se edita en
  la ficha del recurso.

**Criterios de aceptación:**

- Dado la página de recursos, cuando el editor crea "Ana Pérez", `PERSON`, 1,5 UF/h, 8 h/día,
  entonces aparece en la lista con su carga actual 0 h y está disponible en el selector de asignación.
- Dado un recurso con 3 asignaciones, cuando el editor intenta eliminarlo, entonces se le ofrece
  desactivarlo y, al aceptar, el recurso desaparece de los selectores pero sus asignaciones se
  conservan y siguen contando en la carga.

### UC-16 — Asignar recursos a tareas

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 6

Crea `Assignment` (`taskId`, `resourceId`, `allocationPct`) desde el panel de detalle o la columna
Recursos.

**Reglas:**

- Solo tareas hoja. Un recurso una sola vez por tarea (se edita el porcentaje).
- `allocationPct` > 0; puede superar 100 (la sobreasignación es un aviso, no un bloqueo).
- Horas asignadas = `durationDays` × `hoursPerDay` del calendario del recurso (o del proyecto) ×
  `allocationPct` / 100. La asignación no altera la duración (no hay programación por esfuerzo).
- La columna Recursos muestra "Ana Pérez (50 %); Equipo QA" (100 % se omite).

**Criterios de aceptación:**

- Dado la tarea 1 (5 días) y el recurso Ana (8 h/día), cuando el editor la asigna al 50 %, entonces
  la asignación muestra 20 h y la columna Recursos dice "Ana Pérez (50 %)".
- Dado una tarea resumen, cuando el editor abre el panel de detalle, entonces la sección de recursos
  indica "Las tareas resumen no admiten asignaciones".

### UC-17 — Detectar sobreasignación e histograma de carga

**Actor:** editor o lector · **Rol mínimo:** `VIEWER` · **Paso del plan:** 8 · engine en Paso 3

La vista Recursos muestra, por recurso, la carga diaria o semanal en horas frente a
`capacityHoursPerDay`, marcando en rojo los días sobreasignados. Al hacer clic en una barra se
listan las tareas que generan esa carga.

**Reglas:**

- Carga de un recurso en un día hábil = Σ sobre sus asignaciones activas ese día de `hoursPerDay` ×
  `allocationPct` / 100. Días no hábiles del recurso tienen carga 0 y no se consideran.
- Sobreasignado si carga > `capacityHoursPerDay`.
- La vista semanal suma las horas de la semana y compara contra capacidad × días hábiles de la
  semana.
- La tabla y el Gantt muestran un ícono de aviso en las tareas con algún recurso sobreasignado.

**Criterios de aceptación:**

- Dado el recurso Ana (8 h/día) asignada al 100 % a A (07-09-2026 – 11-09-2026) y a C (14-09-2026 –
  15-09-2026), y al 50 % a B (14-09-2026 – 16-09-2026), cuando se abre la vista Recursos, entonces
  los días 14-09 y 15-09 muestran 12 h en rojo, el 16-09 muestra 4 h y la semana del 14-09 muestra
  28 h sobre 32 h de capacidad (4 días hábiles por el feriado).
- Dado el histograma anterior, cuando el usuario hace clic en la barra del 14-09, entonces se listan
  C (8 h) y B (4 h).

### UC-18 — Nivelar recursos (propuesta)

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 8 · engine en Paso 3

Genera una propuesta para eliminar sobreasignaciones atrasando tareas no críticas dentro de su
holgura total, y la muestra antes de aplicarla.

**Reglas:**

- Solo se mueven tareas con `totalFloatDays` > 0 y nunca más allá de su holgura; el fin del proyecto
  no cambia.
- Orden de prioridad para retrasar: menor `priority`, mayor holgura, menor `orderIndex`.
- Aplicar la propuesta cambia los `anchorDate` de las tareas movidas mediante un único comando
  (deshacible) y nunca crea dependencias ni ciclos.
- Si una sobreasignación no puede resolverse dentro de las holguras, la propuesta la lista como "No
  resuelta" con la explicación.

**Criterios de aceptación:**

- Dado la red A (5 días), B (3 días, FS A), C (2 días, FS A), D (1 día, FS B y FS C), E (4 días,
  FS B), inicio 07-09-2026, y el recurso Ana al 100 % en B y en C, cuando el editor pide nivelar,
  entonces la propuesta mueve C a 17-09-2026 – 21-09-2026 (dentro de su holgura de 4 días), D pasa a
  22-09-2026, el fin del proyecto sigue siendo el 23-09-2026 y ninguna tarea crítica cambia.
- Dado la propuesta anterior, cuando el editor la aplica, entonces `anchorDate` de C es 17-09-2026,
  la vista Recursos no muestra días en rojo y un Ctrl+Z restaura el estado previo.
- Dado dos tareas críticas que comparten un recurso al 100 % el mismo día, cuando se pide nivelar,
  entonces la propuesta indica "No resuelta: B y E son críticas; retrasarlas movería el fin del
  proyecto".

### UC-38 — Calcular costos (horas × tarifa, UF/CLP)

**Actor:** sistema · **Rol mínimo:** `VIEWER` (visualización) · **Paso del plan:** 8 · engine en Paso 3

Calcula costo planificado y consumido por asignación, tarea, recurso y proyecto, mostrándolo en la
moneda de `Setting.displayCurrency` con `Setting.ufValue`.

**Reglas:**

- Horas asignadas según UC-16. Costo planificado = horas × `Resource.rate`. Costo consumido = costo
  planificado × `progressPct` / 100 de la tarea.
- Conversión: si `rateCurrency` = UF y `displayCurrency` = CLP, se multiplica por `ufValue`; si es
  al revés, se divide. Sin `ufValue` configurado, los montos en la otra moneda se muestran como "—"
  con el aviso "Configura el valor UF".
- Los costos de una tarea resumen son la suma de sus descendientes.

**Criterios de aceptación:**

- Dado Ana (1,5 UF/h, 8 h/día) asignada al 50 % a la tarea 1 (5 días, `progressPct` 60) y
  `ufValue` = 39.000, cuando se muestra el dashboard en UF, entonces el costo planificado de la tarea
  es 30 UF y el consumido 18 UF; en CLP, 1.170.000 y 702.000.
- Dado `ufValue` sin configurar y `displayCurrency` = CLP, cuando se abre el dashboard, entonces los
  costos aparecen como "—" con el enlace "Configura el valor UF".

---

## Seguimiento

### UC-19 — Guardar y comparar líneas base

**Actor:** editor · **Rol mínimo:** `ADMIN` para guardar y eliminar; `VIEWER` para comparar · **Paso del plan:** 8 · engine en Paso 3

Guarda una `Baseline` con nombre que fotografía todas las tareas (`BaselineTask`), permite elegir
cuál se muestra en el Gantt como barra fantasma y presenta una tabla comparativa.

**Reglas:**

- Máximo 5 baselines por proyecto; al intentar la sexta se pide eliminar una.
- `name` único por proyecto; por defecto "Línea base {n} — {dd-mm-yyyy}".
- Tabla comparativa por tarea: `wbsCode`, nombre, inicio y fin de la baseline, inicio y fin actuales,
  `startVarianceDays`, `endVarianceDays` (en días hábiles, positivo = atraso), `progressVariancePct`.
- Las tareas creadas después de la baseline aparecen como "Nueva"; las eliminadas, como "Eliminada"
  (solo en la tabla, con los datos de la fotografía).

**Criterios de aceptación:**

- Dado A (07-09-2026 – 11-09-2026, `progressPct` 0) y B (14-09-2026 – 16-09-2026, FS de A), cuando el
  administrador guarda la baseline "Plan inicial", entonces existen 2 `BaselineTask` con esas fechas.
- Dado la baseline anterior, cuando el editor mueve A a `anchorDate` 10-09-2026 (termina 16-09-2026)
  y B se reprograma a 17-09-2026 – 22-09-2026, entonces la tabla comparativa muestra para A
  `startVarianceDays` +3 y `endVarianceDays` +3, y para B +3 y +3 (17→22 son 3 días hábiles más que
  14→16 contando el feriado).
- Dado A con `progressPct` 40 tras la baseline, cuando se abre la comparativa, entonces
  `progressVariancePct` de A es +40.
- Dado un proyecto con 5 baselines, cuando el administrador intenta guardar otra, entonces se muestra
  "Máximo 5 líneas base; elimina una para continuar" y no se crea.
- Dado la baseline "Plan inicial" seleccionada en el Gantt, cuando se activa el toggle "Línea base",
  entonces cada barra muestra debajo una barra gris con las fechas de la baseline.

### UC-20 — Calcular ruta crítica y holguras

**Actor:** sistema · **Rol mínimo:** `VIEWER` (visualización) · **Paso del plan:** 8 (toggle visual en 7) · engine en Paso 3

Tras cada reprogramación, el engine ejecuta el método de la ruta crítica (paso adelante y paso
atrás) y persiste `isCritical`, `totalFloatDays` y `freeFloatDays` en cada tarea hoja.

**Reglas:**

- El fin del proyecto es el máximo `endDate` de las hojas. El paso atrás parte de esa fecha para
  todas las tareas sin sucesoras.
- `totalFloatDays` = días hábiles entre el inicio temprano y el inicio tardío. `freeFloatDays` = días
  hábiles que la tarea puede atrasarse sin mover el inicio temprano de ninguna sucesora (para tareas
  sin sucesoras, igual a la holgura total).
- `isCritical` = `totalFloatDays` = 0. Un `anchorDate` que fija una tarea después de su cota de
  predecesoras no la hace crítica por sí mismo; la criticidad se calcula solo con la red y las
  duraciones, tomando como inicio temprano la fecha efectiva.
- Las tareas resumen no participan de la red; se muestran críticas si alguna hoja descendiente lo es.

**Criterios de aceptación:**

- Dado la red A (5 días, 07-09-2026), B (3 días, FS A), C (2 días, FS A), D (1 día, FS B y FS C),
  E (4 días, FS B), cuando se calcula, entonces el fin del proyecto es el 23-09-2026, A, B y E son
  críticas con holgura 0, D tiene `totalFloatDays` 3 y `freeFloatDays` 3, y C tiene
  `totalFloatDays` 4 y `freeFloatDays` 1.
- Dado la red anterior, cuando C se alarga a 6 días (14-09-2026 – 22-09-2026), entonces D pasa al
  23-09-2026, el fin sigue siendo 23-09-2026, y C y D pasan a ser críticas junto con A, B y E.
- Dado el toggle "Ruta crítica" activo en el Gantt, cuando se calcula, entonces las barras de A, B y E
  se pintan en rojo y las de C y D no.

### UC-21 — Fecha de estado, atraso y actualización masiva de avance

**Actor:** editor · **Rol mínimo:** `EDITOR` (configurar y actualizar), `VIEWER` (ver) · **Paso del plan:** 8 · engine en Paso 3

Configura `Project.statusDate`, calcula el avance esperado de cada tarea a esa fecha, marca las
tareas atrasadas y permite fijar masivamente `progressPct` al valor esperado.

**Reglas:**

- Avance esperado de una hoja a la fecha de estado = días hábiles transcurridos desde `startDate`
  hasta la fecha de estado (inclusive), acotado a [0, `durationDays`], dividido por `durationDays`,
  redondeado. Hitos: 100 si su fecha ≤ fecha de estado, si no 0.
- Atrasada si `progressPct` < avance esperado. Días de desviación = (esperado − real) ×
  `durationDays` / 100, redondeado a un decimal.
- La actualización masiva actúa sobre las tareas seleccionadas (o todas si no hay selección), solo
  sube el avance (no reduce un avance real mayor), y se registra como un único comando deshacible.
- La línea vertical "Fecha de estado" se dibuja en el Gantt cuando está configurada.

**Criterios de aceptación:**

- Dado `statusDate` 15-09-2026, A (07-09-2026 – 11-09-2026, `progressPct` 60) y B (14-09-2026 –
  16-09-2026, `progressPct` 20), cuando se abre la tabla, entonces A muestra esperado 100 %, atrasada,
  desviación 2,0 días; B muestra esperado 67 %, atrasada, desviación 1,4 días.
- Dado el caso anterior con el hito H el 14-09-2026 y `progressPct` 0, cuando se calcula, entonces H
  aparece atrasado con esperado 100 %.
- Dado A y B seleccionadas, cuando el editor ejecuta "Marcar avance según fecha de estado", entonces
  A queda en 100 (`DONE`) y B en 67 (`IN_PROGRESS`), ninguna aparece atrasada y un Ctrl+Z restaura 60
  y 20.
- Dado una tarea con `progressPct` 90 y esperado 67, cuando se ejecuta la actualización masiva,
  entonces conserva 90.

### UC-22 — Dashboard de proyecto y curva S

**Actor:** cualquier miembro · **Rol mínimo:** `VIEWER` · **Paso del plan:** 8 · engine en Paso 3

Muestra KPIs y la curva S del proyecto.

**Reglas:**

- KPIs: avance global (rollup de la raíz virtual), tareas atrasadas (según UC-21), hitos próximos
  (fecha entre la fecha de estado y 15 días calendario después), costo planificado vs. consumido
  (UC-38), fin estimado (máximo `endDate`) vs. fin de la baseline seleccionada.
- Curva S: avance planificado acumulado por día (según fechas actuales y ponderación del proyecto)
  vs. avance real acumulado (usando la fecha de estado como último punto real; el real se distribuye
  linealmente desde el inicio de cada tarea hasta la fecha de estado).
- Todos los datos se calculan en el cliente con el engine a partir del proyecto cargado.

**Criterios de aceptación:**

- Dado el proyecto seed con `statusDate` configurada, cuando se abre el dashboard, entonces se
  muestran los 5 KPIs con valores numéricos y la curva S con dos series.
- Dado dos hitos, uno a 10 días y otro a 20 días de la fecha de estado, cuando se abre el dashboard,
  entonces "Hitos próximos" lista solo el primero.

---

## Vistas e interacción

### UC-23 — Vista Tabla con edición inline y teclado

**Actor:** editor · **Rol mínimo:** `EDITOR` (edición), `VIEWER` (lectura) · **Paso del plan:** 6

Grilla tipo hoja de cálculo con columnas WBS, Nombre (con indentación y expandir/colapsar), Inicio,
Fin, Duración, % Avance, Recursos, Predecesoras, Estado, y menú de acciones por fila.

**Reglas:**

- Navegación: flechas entre celdas, Enter entra/sale de edición y baja una fila, Tab en edición pasa
  a la siguiente columna, Esc cancela. Fuera de edición: Tab indenta, Shift+Tab desindenta, Insert
  crea tarea debajo, Supr elimina (con confirmación), Ctrl+↑/↓ mueve la fila, Ctrl+Z / Ctrl+Y
  deshace/rehace, "?" abre la ayuda de atajos.
- Expandir/colapsar con clic en el triángulo o con ← / → sobre la celda Nombre. El estado de
  colapso se recuerda por proyecto en el navegador.
- El ancho de cada columna se cambia arrastrando el borde derecho de su encabezado (UC-40).
- Las celdas derivadas (resumen, `wbsCode`) no son editables.
- Las filas devueltas en `affected` se resaltan 1 segundo.
- Un `VIEWER` ve la misma tabla sin modo edición ni menú de acciones.

**Criterios de aceptación:**

- Dado un proyecto vacío, cuando el editor, usando solo el teclado, crea tres tareas, indenta las dos
  últimas y les escribe nombre y duración, entonces la tabla muestra 1, 1.1, 1.2 con los nombres
  ingresados y la tarea 1 con las fechas rollup.
- Dado la celda Duración de la tarea 1.1 en edición con el valor 5, cuando el editor pulsa Enter,
  entonces se guarda, la tarea 1 se resalta 1 segundo como afectada y el foco pasa a la fila 1.2.
- Dado la vista Tabla abierta 60 segundos con interacción normal, cuando se revisa la consola del
  navegador, entonces no hay errores ni advertencias de hidratación.

### UC-24 — Vista Gantt (escalas, zoom, barras, drag & drop)

**Actor:** editor o lector · **Rol mínimo:** `VIEWER` (lectura), `EDITOR` (interacción) · **Paso del plan:** 7

Panel izquierdo con la tabla reducida (WBS, Nombre, Inicio, Fin, Pred.) sincronizada verticalmente
con el panel derecho de la línea de tiempo; cada columna del panel es redimensionable y el panel mide
lo que suman sus columnas (UC-40).

**Reglas:**

- Escalas día / semana / mes / trimestre, zoom con Ctrl+rueda y botón "Ajustar al proyecto".
  Cabecera de dos niveles. Fines de semana y feriados sombreados. Línea "Hoy" y, si existe, línea
  "Fecha de estado".
- Barras: tarea con relleno proporcional a `progressPct` y etiqueta a la derecha (nombre o recursos,
  configurable); resumen como corchete; hito como rombo; ruta crítica en rojo (toggle); baseline
  como barra gris debajo (toggle); color por tarea, por recurso o por estado (selector).
- Interacciones (UC-12, UC-14, UC-10): mover, redimensionar, avance, crear dependencia arrastrando
  desde el conector de inicio o fin de una barra al inicio o fin de otra (fin→inicio = FS,
  inicio→inicio = SS, fin→fin = FF, inicio→fin = SF), con previsualización de la flecha; clic en
  flecha abre popover de tipo/lag/eliminar; doble clic abre el panel de detalle.
- Flechas ortogonales con codos y punta en la sucesora; al pasar el cursor por una tarea se resaltan
  sus flechas.
- Virtualización vertical: solo se dibujan las filas visibles más un margen. Con 1.000 tareas, el
  render inicial tarda menos de 1,5 s y un arrastre mantiene un promedio inferior a 16 ms por frame.
- Tabla y Gantt leen del mismo store: tras cualquier secuencia de operaciones muestran los mismos
  datos.

**Criterios de aceptación:**

- Dado A (07-09-2026 – 11-09-2026) y B (FS de A, 3 días), cuando el editor arrastra la barra de A
  tres días hábiles a la derecha, entonces A queda en 10-09-2026 – 16-09-2026 y B en 17-09-2026 –
  22-09-2026, con ambas filas resaltadas.
- Dado las tareas 1 y 2 sin dependencia, cuando el editor arrastra desde el conector de fin de 1 hasta
  el conector de inicio de 2, entonces se crea una dependencia FS, aparece la flecha y la columna
  Predecesoras de la tarea 2 muestra "1".
- Dado el seed de 1.000 tareas, cuando se abre el Gantt, entonces el render inicial medido con
  `performance.now()` es inferior a 1,5 s y un arrastre de 2 s registra un promedio inferior a 16 ms
  por frame; ambos números se reportan en el test.
- Dado 50 operaciones aleatorias sobre el store (crear, mover, indentar, cambiar duración, crear y
  quitar dependencias), cuando se comparan los datos que muestran la tabla y el Gantt, entonces son
  idénticos.

### UC-25 — Deshacer y rehacer

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 6 · API en Paso 5

Historial de comandos en el store: Ctrl+Z deshace y Ctrl+Y rehace cualquier mutación hecha desde la
tabla, el Gantt o el panel de detalle.

**Reglas:**

- Cada comando guarda el estado previo de las entidades que toca (incluidas las afectadas por la
  reprogramación). Deshacer envía el inverso al servidor con `POST /api/projects/:id/tasks/bulk`
  (tareas) o con el endpoint correspondiente (dependencias, asignaciones), y el servidor vuelve a
  ejecutar el engine.
- Historial de al menos 50 comandos por sesión de proyecto; se limpia al cambiar de proyecto.
- Ejecutar un comando nuevo después de deshacer descarta la pila de rehacer.
- Las operaciones masivas (actualización de avance, nivelación, importación) son un solo comando.
- Si el servidor rechaza el inverso (por ejemplo, otro usuario eliminó la tarea), se muestra "No se
  pudo deshacer: la tarea 1.2 ya no existe" y el historial se limpia.

**Criterios de aceptación:**

- Dado un proyecto vacío, cuando el editor ejecuta 20 operaciones consecutivas (crear, renombrar,
  indentar, cambiar duración, crear dependencia, mover) y luego pulsa Ctrl+Z 20 veces, entonces el
  proyecto vuelve a estar vacío; cuando pulsa Ctrl+Y 20 veces, vuelve al estado final, idéntico
  campo a campo.
- Dado A → B → C (FS) y un cambio de `anchorDate` de A que movió B y C, cuando el editor pulsa Ctrl+Z,
  entonces A, B y C recuperan sus fechas anteriores en una sola operación y una sola llamada `bulk`.
- Dado la creación de una dependencia A → B que empujó B, cuando el editor pulsa Ctrl+Z, entonces la
  dependencia desaparece y B vuelve a su `anchorDate`.
- Dado dos comandos deshechos, cuando el editor ejecuta un comando nuevo, entonces Ctrl+Y no hace
  nada.

### UC-40 — Ajustar el ancho de las columnas

**Actor:** cualquier persona con acceso al proyecto · **Rol mínimo:** `VIEWER` · **Paso del plan:** posterior a la v1.0.0

Cambia con el ratón el ancho de las columnas de la vista Tabla y del panel izquierdo del Gantt. Es
una preferencia de quien mira: no toca los datos del proyecto ni lo que ven las demás personas.

**Reglas:**

- Cada encabezado tiene un tirador en su borde derecho: arrastrarlo cambia el ancho de esa columna y
  doble clic lo devuelve al valor por omisión. En el Gantt, el tirador de la última columna es el
  separador de alto completo del borde derecho del panel, que sigue funcionando como divisor.
- El ancho queda entre el mínimo de la columna (nunca menor que su contenido mínimo legible) y 900 px.
  Al llegar a un extremo el arrastre deja de tener efecto en vez de rebotar.
- El panel del Gantt mide lo que suman sus columnas: al ensanchar una, el panel crece y la línea de
  tiempo se corre; la geometría de las barras no cambia.
- Los anchos se guardan por vista en el navegador (`localStorage`, claves
  `ganttpro:column-widths:table` y `ganttpro:column-widths:gantt`) y se aplican a todos los
  proyectos. Un navegador sin almacenamiento disponible usa los anchos por omisión y sigue
  funcionando.
- Un valor guardado que ya no sea válido (columna eliminada, número fuera de rango o dato corrupto)
  se descarta en silencio y esa columna vuelve a su ancho por omisión.
- Los anchos son de pantalla: las exportaciones a Excel, PDF y PNG conservan su propio diseño.

**Criterios de aceptación:**

- Dado la vista Tabla con la columna Nombre en 300 px, cuando se arrastra su tirador 120 px a la
  derecha, entonces la columna y sus celdas miden 420 px, y siguen midiendo lo mismo después de
  recargar la página.
- Dado esa misma columna ensanchada, cuando se hace doble clic en su tirador, entonces vuelve a 300 px.
- Dado la columna WBS, cuando se arrastra su tirador 400 px a la izquierda, entonces se detiene en su
  mínimo de 48 px y no desaparece.
- Dado el panel del Gantt en 440 px, cuando se ensancha la columna Nombre 90 px, entonces el panel
  mide 530 px, la tabla reducida muestra los nombres completos y las barras no cambian de posición.

---

## Exportación e importación

### UC-26 — Exportar a Excel

**Actor:** cualquier miembro · **Rol mínimo:** `VIEWER` · **Paso del plan:** 9

Genera un `.xlsx` con las hojas Tareas, Gantt, Recursos, Dependencias y Resumen.

**Reglas:**

- Tareas: columnas de la vista Tabla, nombre con indentación por nivel, filas resumen en negrita,
  agrupación (outline) por jerarquía, `progressPct` con formato de porcentaje, fechas con formato
  `dd-mm-yyyy`, encabezado congelado, autofiltro.
- Gantt: una columna por día (o por semana si el proyecto supera 120 días hábiles); celdas
  planificadas en color claro, avanzadas en color oscuro, hitos con "◆", fines de semana y feriados
  sombreados, cabecera de mes y día.
- Recursos: asignaciones con horas y costo. Dependencias: lista completa en formato
  `wbsCode`/tipo/lag. Resumen: KPIs del dashboard.
- El archivo abre sin advertencias de reparación en Excel para Windows.

**Criterios de aceptación:**

- Dado el proyecto seed, cuando se exporta a Excel y se vuelve a leer con exceljs, entonces la hoja
  Tareas tiene tantas filas de datos como tareas, las filas resumen están en negrita, la columna
  % Avance tiene formato de porcentaje y las fechas tienen formato `dd-mm-yyyy`.
- Dado el archivo anterior, cuando se revisa la hoja Gantt, entonces la tarea 1.1 tiene tantas celdas
  pintadas como días hábiles de su duración y las columnas del 18-09-2026 y 19-09-2026 están
  sombreadas.

### UC-27 — Exportar a PDF

**Actor:** cualquier miembro · **Rol mínimo:** `VIEWER` · **Paso del plan:** 9

Genera un PDF vectorial del Gantt mediante la ruta interna `/print/gantt` renderizada con Puppeteer,
con un diálogo de opciones.

**Reglas:**

- Opciones: orientación (horizontal por defecto), tamaño A4/A3/Carta, rango de fechas, escala,
  columnas de la tabla a incluir, ruta crítica, baseline, leyenda.
- Paginación: si el Gantt no cabe, se divide en páginas horizontales y verticales; la tabla WBS se
  repite a la izquierda de cada página y cada página lleva "Página X de Y".
- Encabezado: nombre del proyecto, fecha de estado y logo opcional (`Setting.logoUrl`). Pie: fecha y
  hora de generación.
- El texto es seleccionable (no es una imagen).

**Criterios de aceptación:**

- Dado el proyecto seed y opciones A4 horizontal con escala semana, cuando se genera el PDF y se lee
  con pdf-parse, entonces tiene al menos 2 páginas, el texto "1.1" es extraíble y cada página
  contiene "Página" seguido del número.
- Dado el diálogo de opciones, cuando se desmarca la leyenda, entonces el PDF no contiene el bloque de
  leyenda.

### UC-28 — Exportar a PNG

**Actor:** cualquier miembro · **Rol mínimo:** `VIEWER` · **Paso del plan:** 9

Descarga una imagen PNG de la porción visible del Gantt (tabla reducida + línea de tiempo) a
resolución 2x.

**Criterios de aceptación:**

- Dado el Gantt con la escala mes, cuando el usuario pulsa Exportar → PNG, entonces se descarga
  `{nombre-proyecto}-gantt.png` con un ancho igual al doble del área visible y que contiene las barras
  visibles.

### UC-29 — Importar desde Excel/CSV

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 9

Importa tareas desde una plantilla descargable (columnas: WBS, Nombre, Inicio, Fin, Duración,
Predecesoras, Recursos, % Avance) con previsualización y validación fila por fila.

**Reglas:**

- La jerarquía se deduce del código WBS; el orden de las filas define `orderIndex`.
- Inicio → `anchorDate`. Si hay Duración se usa; si solo hay Fin, la duración se calcula en días
  hábiles. Predecesoras en el formato de UC-10; los recursos se buscan por nombre y se crean si no
  existen (con aviso).
- Errores por fila: WBS inválido o sin padre, fecha inválida, predecesora inexistente, ciclo. Con
  errores no se importa nada hasta corregirlos o excluir las filas.
- La importación es un único comando deshacible y genera un `AuditLog` con `action = IMPORT`.
- Modo: "Agregar al final" o "Reemplazar tareas" (con confirmación).

**Criterios de aceptación:**

- Dado la plantilla exportada del proyecto seed, cuando se importa en un proyecto vacío en modo
  reemplazar, entonces el proyecto resultante tiene los mismos `wbsCode`, nombres, fechas,
  duraciones, dependencias y avances (round-trip).
- Dado un archivo con una fila cuyo WBS es "1.3" sin que exista "1", cuando se carga, entonces la
  previsualización marca la fila con "El WBS 1.3 no tiene padre" y el botón Importar está
  deshabilitado.

### UC-30 — Importar desde MS Project XML

**Actor:** editor · **Rol mínimo:** `EDITOR` · **Paso del plan:** 9

Importa un archivo MSPDI (XML de MS Project): tareas con jerarquía (OutlineLevel / OutlineNumber),
dependencias (PredecessorLink con tipo y lag), recursos y asignaciones.

**Reglas:**

- Duraciones en formato ISO 8601 de MS Project (`PT40H0M0S`) se convierten a días hábiles con las
  horas/día del calendario del proyecto. Lag en décimas de minuto se convierte a días hábiles
  redondeados.
- Tipos de vínculo: 0 = FF, 1 = FS, 2 = SF, 3 = SS.
- Restricciones distintas de "lo antes posible" se traducen a `anchorDate` con la fecha de la
  restricción y se informa en el resumen de importación.
- Dependencias hacia o desde tareas resumen se descartan con aviso explícito (no soportadas en v1).

**Criterios de aceptación:**

- Dado `fixtures/msproject-sample.xml` (3 niveles, 12 tareas, 10 vínculos de los cuatro tipos, 3
  recursos), cuando se importa, entonces se crean 12 tareas con la misma jerarquía, 10 dependencias
  con tipo y lag equivalentes, 3 recursos y sus asignaciones, y la vista Tabla muestra las mismas
  fechas que el archivo original (con el mismo calendario).
- Dado un XML con un vínculo hacia una tarea resumen, cuando se importa, entonces el resumen de
  importación indica "1 dependencia descartada: las tareas resumen no admiten dependencias".

---

## Usuarios y colaboración

### UC-31 — Iniciar sesión

**Actor:** usuario · **Rol mínimo:** — · **Paso del plan:** 4 (credenciales) y 10 (Google)

Autenticación con correo y contraseña mediante Auth.js; Google como proveedor opcional.

**Reglas:**

- `passwordHash` con bcrypt. Contraseña mínima de 8 caracteres.
- Toda ruta bajo `/(app)` y `/api` (salvo `/health`, `/api/auth/*` y los enlaces compartidos)
  requiere sesión; sin sesión, las páginas redirigen a `/login` y la API responde `401`.
- El seed crea `admin@ganttpro.local`.
- Tras 5 intentos fallidos en 15 minutos desde la misma IP se responde `429` (Paso 11).

**Criterios de aceptación:**

- Dado la página de login, cuando el usuario ingresa credenciales válidas, entonces es redirigido a
  la lista de proyectos y su nombre aparece en el encabezado.
- Dado credenciales inválidas, cuando envía el formulario, entonces se muestra "Correo o contraseña
  incorrectos" sin indicar cuál de los dos falló.
- Dado un usuario sin sesión, cuando navega a `/projects`, entonces es redirigido a `/login`; cuando
  llama a `GET /api/projects`, entonces recibe `401`.

### UC-32 — Roles por proyecto

**Actor:** administrador del proyecto · **Rol mínimo:** `ADMIN` · **Paso del plan:** 10

Gestiona `ProjectMember` (invitar por correo de un usuario existente, cambiar `role`, quitar) y el
sistema aplica el rol en middleware, API y UI.

**Reglas:**

- `VIEWER`: lectura de todas las vistas y exportaciones. `EDITOR`: además, toda mutación del plan,
  recursos y comentarios. `ADMIN`: además, miembros, baselines, archivar, duplicar, calendario y
  enlaces compartidos.
- Debe quedar al menos un `ADMIN` por proyecto.
- La API responde `403 FORBIDDEN` cuando el rol no alcanza; la UI oculta o deshabilita los controles.
- Ningún endpoint devuelve datos de un proyecto del que el usuario no es miembro (`404` para no
  revelar existencia).

**Criterios de aceptación:**

- Dado un `VIEWER` en la vista Tabla, cuando intenta editar una celda, entonces no entra en modo
  edición; cuando llama a `PATCH /api/tasks/:id`, entonces recibe `403`.
- Dado el único `ADMIN` del proyecto, cuando intenta cambiarse a `EDITOR`, entonces se rechaza con
  "El proyecto debe tener al menos un administrador".
- Dado un usuario miembro del proyecto P1 pero no de P2, cuando llama a `GET /api/projects/P2/tasks`,
  entonces recibe `404`.

### UC-33 — Compartir por enlace de solo lectura

**Actor:** administrador del proyecto · **Rol mínimo:** `ADMIN` · **Paso del plan:** 10

Crea `ShareLink` con `token` que permite ver el proyecto (Tabla, Gantt, Recursos, Dashboard) sin
sesión; puede tener vencimiento y revocarse.

**Reglas:**

- La URL es `/share/{token}`. Sin sesión, la vista es de solo lectura y sin datos de otros proyectos
  ni de usuarios (solo nombres de recursos).
- Enlace revocado (`revokedAt`) o vencido (`expiresAt`) responde `404` con "Este enlace ya no está
  disponible".
- Se puede exportar Excel/PDF desde el enlace.

**Criterios de aceptación:**

- Dado un enlace creado, cuando se abre en una ventana sin sesión, entonces se ve el Gantt del
  proyecto sin controles de edición.
- Dado el enlace revocado, cuando se abre, entonces responde `404` con el mensaje indicado.

### UC-34 — Colaboración simultánea

**Actor:** editores · **Rol mínimo:** `EDITOR` · **Paso del plan:** 10

Dos usuarios con el mismo proyecto abierto ven los cambios del otro en menos de 3 segundos.

**Reglas:**

- El cliente consulta `GET /api/projects/:id/changes?since={cursor}` cada 2 segundos (TanStack Query
  con `refetchInterval`); la respuesta lista los `AuditLog` posteriores al cursor con las entidades
  actualizadas.
- Conflictos: última escritura gana. Si un cambio remoto toca una tarea que el usuario local editó en
  los últimos 10 segundos, se muestra un toast "{nombre} modificó la tarea {wbsCode}".
- Los cambios remotos no entran en el historial de deshacer local.
- Si una tarea que el usuario tiene seleccionada es eliminada remotamente, el panel de detalle se
  cierra con aviso.

**Criterios de aceptación:**

- Dado dos contextos de navegador con editores distintos en el mismo proyecto, cuando el primero
  cambia la duración de la tarea 1, entonces el segundo ve el nuevo valor antes de 3 segundos.
- Dado el segundo editor editando la tarea 1 en ese momento, cuando llega el cambio remoto, entonces
  ve el toast con el nombre del primer editor y el valor final es el del último que guardó.

### UC-35 — Comentarios y menciones

**Actor:** miembro del proyecto · **Rol mínimo:** `EDITOR` para escribir, `VIEWER` para leer · **Paso del plan:** 10

Comentarios en markdown por tarea con menciones a miembros del proyecto y notificación por correo.

**Reglas:**

- Mención con `@` abre un autocompletado de miembros; los ids se guardan en `mentionIds`.
- Cada mención envía un correo mediante el adaptador configurado (consola en desarrollo, SMTP o
  Resend en producción) con el enlace directo a la tarea.
- El autor puede editar o eliminar su comentario; un `ADMIN` puede eliminar cualquiera.
- El contador de comentarios se muestra en la tabla y en el panel.

**Criterios de aceptación:**

- Dado el panel de la tarea 1.2, cuando el editor escribe "Revisar con @ana" y selecciona a Ana,
  entonces el comentario se guarda con `mentionIds` = [id de Ana] y en desarrollo la consola del
  servidor muestra el correo con el enlace a la tarea 1.2.
- Dado un comentario ajeno, cuando un `EDITOR` abre su menú, entonces no ve la opción de eliminar.

### UC-36 — Historial de cambios (auditoría)

**Actor:** miembro del proyecto · **Rol mínimo:** `VIEWER` · **Paso del plan:** 10 (registro desde Paso 4)

Vista del `AuditLog` del proyecto filtrable por tarea, usuario, tipo de entidad, acción y rango de
fechas.

**Reglas:**

- Cada entrada muestra `summary` en español, quién, cuándo y un detalle expandible con `before` y
  `after`.
- Toda mutación de la API escribe exactamente una entrada por entidad modificada; una reprogramación
  en cascada genera una entrada `RESCHEDULE` por cada tarea movida, agrupadas bajo el mismo
  identificador de operación en el detalle.
- El historial no se puede editar ni borrar desde la UI.

**Criterios de aceptación:**

- Dado un cambio de `anchorDate` en A que movió B y C, cuando se abre el historial filtrado por la
  tarea B, entonces aparece una entrada `RESCHEDULE` con las fechas anteriores y nuevas de B, hecha por
  el usuario que movió A.
- Dado el filtro por usuario "Ana" y rango de la última semana, cuando se aplica, entonces solo se
  listan entradas de Ana en ese rango.

### UC-37 — Configuración global

**Actor:** administrador de cualquier proyecto · **Rol mínimo:** `ADMIN` · **Paso del plan:** 10

Página de configuración que edita `Setting`: `ufValue` (con `ufValueDate`), `displayCurrency`
(UF/CLP), `dateFormat` y `logoUrl`.

**Reglas:**

- `ufValue` numérico positivo; al guardarlo se registra `ufValueDate` con la fecha ingresada.
- El adaptador `UfProvider` tiene la implementación manual; la consulta a una API externa queda
  preparada pero no implementada en v1.
- `dateFormat` admite `dd-mm-yyyy` (default) y `dd/mm/yyyy`; afecta a la UI y a las exportaciones.
- Cambiar `displayCurrency` reconvierte los costos mostrados sin alterar las tarifas guardadas.

**Criterios de aceptación:**

- Dado `ufValue` = 39.000 y `displayCurrency` = UF, cuando el administrador cambia a CLP, entonces el
  dashboard muestra los costos multiplicados por 39.000 y las tarifas de los recursos siguen
  guardadas en UF.
- Dado el campo `ufValue` con un valor negativo, cuando se intenta guardar, entonces se rechaza con
  "El valor UF debe ser mayor que cero".

---

## Requisitos no funcionales

| Área          | Requisito                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendimiento   | Gantt con 1.000 tareas: render inicial < 1,5 s; drag < 16 ms/frame promedio. `scheduleProject` con 1.000 tareas y 1.500 dependencias < 50 ms.            |
| Consistencia  | Tabla y Gantt derivan del mismo store; el engine da el mismo resultado en cliente y servidor.                                                            |
| Idioma        | Toda la UI, mensajes y exportaciones en español (Chile); fechas `dd-mm-yyyy`; separador de miles "." y decimal ",".                                      |
| Accesibilidad | Navegación por teclado en Tabla y Gantt, roles ARIA, contraste AA, sin violaciones críticas de axe en Tabla, Gantt y Recursos.                           |
| Seguridad     | Sesión obligatoria salvo `/health`, `/api/auth/*` y `/share/{token}`; autorización por `ProjectMember` en cada endpoint; validación Zod de toda entrada. |
| Auditoría     | Toda mutación registra `AuditLog` con usuario, antes y después.                                                                                          |
| Resolución    | Edición desde 1280 px de ancho; en pantallas menores, solo lectura.                                                                                      |
