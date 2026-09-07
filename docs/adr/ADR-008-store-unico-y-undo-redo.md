# ADR-008 — Store único con patrón command para undo/redo

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

La tabla WBS, el Gantt, el panel de detalle y la vista de recursos editan el mismo plan. La spec
exige undo/redo de al menos 20 operaciones consecutivas (Ctrl+Z / Ctrl+Y), que las mutaciones del
Gantt pasen por "el mismo store" que las de la tabla, que tabla y Gantt nunca se desincronicen tras
50 operaciones aleatorias, y que al editar una fecha la UI refleje "de inmediato" las tareas
afectadas devueltas por la API con un resaltado de un segundo.

Un cambio simple (mover una tarea) puede afectar a decenas de sucesoras y a varios resúmenes; el
undo no puede limitarse a revertir la fila editada.

## Decisión

1. **Un único store Zustand** (`src/stores/project-store.ts`) contiene el proyecto abierto: mapas
   normalizados de `Task`, `Dependency`, `Resource`, `Assignment`, el `Calendar` y estado de UI
   compartido (selección, expandido/colapsado, escala del Gantt). Tabla, Gantt, panel de detalle y
   recursos son vistas derivadas con selectores; ninguna guarda datos del plan por su cuenta.
2. **Patrón command.** Toda mutación es un objeto `Command` con `describe()` (texto en español para
   el menú Deshacer), `apply()` y `invert()`. Ejemplos: `MoveTask(taskId, newAnchorDate)`,
   `SetDuration`, `SetProgress`, `CreateDependency`, `DeleteDependency`, `IndentTask`,
   `CreateTask`, `DeleteTask`, `AssignResource`. El historial guarda hasta 100 comandos; `undo`
   ejecuta `invert()` y lo mueve a la pila de rehacer.
3. **Previsualización optimista con el engine en el cliente.** `apply()` corre el engine
   (`scheduleProject`, `renumber`, `criticalPath`) sobre el estado del store y lo actualiza al
   instante; a continuación envía la petición a la API. El servidor vuelve a ejecutar el mismo engine
   y responde `{ task, affected }`; el store reconcilia con esa respuesta (que, por determinismo, es
   idéntica salvo concurrencia) y marca las tareas de `affected` con `highlightUntil = now + 1000ms`.
4. **El servidor es la fuente de verdad.** Si la API responde error (`VALIDATION`, `CYCLE`,
   `FORBIDDEN`), el store ejecuta `invert()` del comando, lo descarta del historial y muestra el
   mensaje. Si responde `CONFLICT` o los datos difieren, se reemplaza el estado por el del servidor y
   se vacía la pila de rehacer.
5. **Persistencia del inverso.** `invert()` de un comando compuesto (por ejemplo, eliminar una tarea
   con hijos y dependencias) restaura varias entidades a la vez. Para no encadenar decenas de
   peticiones, el inverso se persiste con `POST /api/projects/:id/tasks/bulk`, que aplica un lote de
   creaciones/actualizaciones/borrados en una transacción, vuelve a programar el proyecto y devuelve
   las tareas afectadas. El `AuditLog` registra la acción como `RESTORE`.
6. **Determinismo.** Como el engine es puro y las fechas dependen solo de ancla, duración,
   dependencias y calendario ([ADR-003](ADR-003-semantica-de-planificacion.md)), aplicar el inverso
   del comando raíz devuelve todas las sucesoras y resúmenes a su estado previo sin guardar
   snapshots completos del proyecto.
7. **Sincronización con TanStack Query.** La carga inicial y el polling de cambios
   ([ADR-010](ADR-010-colaboracion-por-polling.md)) escriben en el store mediante una acción
   `applyServerChanges`; el store es el único dueño del estado del plan en memoria.

## Consecuencias

Positivas:

- Tabla y Gantt son proyecciones de un solo estado: la desincronización es imposible por diseño y el
  test de 50 operaciones aleatorias lo comprueba.
- La respuesta percibida es inmediata incluso con latencia de red; el servidor confirma después.
- El historial es legible ("Deshacer: mover tarea 1.3 al 21-09-2026") y barato en memoria.
- La misma infraestructura sirve para el teclado (Tab/Shift+Tab indenta), el drag del Gantt y el
  formulario del panel de detalle.

Negativas:

- Cada comando requiere implementar su inverso correctamente; se exige un test por comando que
  verifique `invert(apply(estado)) ≡ estado` con `toEqual` profundo.
- El engine se ejecuta dos veces por mutación (cliente y servidor). Con el presupuesto de 50 ms para
  1.000 tareas es asumible.
- Un cambio concurrente de otro usuario invalida la pila de rehacer; se informa con un toast en lugar
  de intentar fusionar historiales.

## Alternativas descartadas

- **Snapshots completos del estado por operación.** Simple, pero con 1.000 tareas × 100 niveles
  consume memoria y no transmite intención al servidor.
- **Undo solo en la tabla, con recarga en el Gantt.** Rompe el requisito de un solo store y hace que
  el drag del Gantt no sea deshacible.
- **Enviar el inverso como N peticiones individuales.** Sin transacción, un fallo a mitad deja el plan
  inconsistente; el endpoint `bulk` resuelve atomicidad y una sola reprogramación.

## Cómo verificarla

- Test unitario del store (Paso 6): 20 comandos mixtos, 20 `undo`, 20 `redo`; el estado final es
  `toEqual` al de después de los 20 comandos, y tras los `undo` es `toEqual` al inicial.
- Property test (Paso 7): 50 operaciones aleatorias; en cada paso, las filas de la tabla y las barras
  del Gantt derivan del mismo `Task` (mismo `startDate`, `endDate`, `wbsCode`).
- e2e (Paso 6): editar una fecha en la tabla resalta las filas de `affected` durante ~1 s
  (`[data-highlighted="true"]` presente y luego ausente).
