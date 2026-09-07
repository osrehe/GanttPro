# ADR-010 — Colaboración por polling sobre el historial de cambios

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

Si dos editores tienen el mismo proyecto abierto, los cambios de uno deben aparecer en la pantalla
del otro en menos de 3 segundos, con la política "última escritura gana" y un aviso del tipo
"X modificó la tarea Y". La spec original dejaba elegir entre polling con TanStack Query y
Server-Sent Events (SSE). El despliegue es un proceso Node persistente
([ADR-004](ADR-004-postgres-unico-y-despliegue-docker.md)), así que SSE sería técnicamente posible.

## Decisión

1. **Polling con TanStack Query.** Mientras un proyecto está abierto, una query
   `["project", id, "changes"]` con `refetchInterval: 2000` y `refetchIntervalInBackground: false`
   llama a `GET /api/projects/:id/changes?since=<cursor>`, donde el cursor es el `createdAt` de la
   última fila de `AuditLog` ya aplicada (inicialmente, el momento de la carga completa).
2. **Fuente de los cambios:** `AuditLog`. Cada mutación ya escribe una fila con `userId`,
   `entityType`, `entityId`, `action`, `after` y `summary` ([ADR-009](ADR-009-diseno-de-api.md)); el
   endpoint devuelve las filas posteriores al cursor junto con el estado actual de las entidades
   afectadas y las tareas reprogramadas por esas acciones. No hace falta infraestructura adicional.
3. **Aplicación en el cliente:** las filas cuyo `userId` es el propio usuario se ignoran (ya se
   aplicaron de forma optimista). Las ajenas se aplican al store con `applyServerChanges`
   ([ADR-008](ADR-008-store-unico-y-undo-redo.md)), se resaltan un segundo y se muestra un toast
   con el `summary`: "Ana movió la tarea 1.3 al 21-09-2026". Si el usuario tenía la misma tarea en
   edición inline, el toast lo advierte y el campo se refresca al salir de la edición.
4. **Conflictos: última escritura gana.** No hay bloqueo ni versión optimista por entidad. Si dos
   usuarios editan la misma tarea, la segunda escritura sobrescribe; el `AuditLog` conserva ambas y
   el usuario cuya edición fue sobrescrita ve el toast del otro. La pila de rehacer del cliente se
   vacía cuando llega un cambio ajeno que toca entidades de su historial.
5. **Coste:** una petición cada 2 s por pestaña abierta, que en ausencia de cambios responde
   `{ data: { changes: [], cursor } }` con una consulta por índice `(projectId, createdAt)`. Con 20
   usuarios simultáneos son 10 req/s, despreciable para Node y Postgres.
6. **SSE queda como extensión v2** detrás de la misma interfaz: el hook `useProjectChanges` es el
   único consumidor del transporte; cambiarlo a `EventSource` no afecta al store ni a la UI.

## Consecuencias

Positivas:

- Cero infraestructura nueva: ni WebSocket, ni broker, ni canal por proyecto. Reutiliza `AuditLog`,
  que ya existe por auditoría.
- Funciona detrás de cualquier proxy o balanceador y sobrevive a reconexiones sin lógica especial.
- Fácil de probar: dos contextos de Playwright, una edición en uno y `expect.poll` en el otro con
  timeout de 3 s.
- Latencia máxima ≈ 2 s + tiempo de respuesta, dentro del requisito.

Negativas:

- Tráfico constante aunque nadie edite; se mitiga pausando el intervalo cuando la pestaña no está
  visible y con respuestas vacías muy baratas.
- "Última escritura gana" puede perder una edición concurrente sobre el mismo campo. Es explícito en
  la spec y aceptable para equipos pequeños; el historial permite recuperar el valor anterior.
- El feed depende de que toda mutación pase por `withAudit`; una escritura directa a Prisma sin
  auditoría no se propagaría. Se refuerza en revisión de código y en el Paso 11.

## Alternativas descartadas

- **SSE.** Latencia menor y sin tráfico ocioso, pero exige mantener conexiones abiertas por
  pestaña, un publicador en memoria (que no escala a más de una instancia sin Redis) y manejo de
  reconexión. Para "< 3 s" el polling cumple con una fracción de la complejidad.
- **WebSockets (Socket.IO, Pusher, Ably).** Bidireccionalidad que no se necesita; servicio externo o
  servidor adicional.
- **Bloqueo pesimista de tareas en edición.** Interrumpe el flujo y deja bloqueos huérfanos al cerrar
  la pestaña.

## Cómo verificarla

- e2e (Paso 10): dos contextos de Playwright con usuarios distintos abren el mismo proyecto; el
  primero cambia el nombre de la tarea 1.2; el segundo ve el nombre nuevo y el toast "… modificó la
  tarea 1.2" en menos de 3 s (`expect.poll` con `timeout: 3000`). Se repite en sentido inverso.
- Test de integración (Paso 5): `GET /api/projects/:id/changes?since=<t0>` tras dos mutaciones
  devuelve exactamente dos filas ordenadas por `createdAt` y el nuevo cursor; una tercera llamada con
  ese cursor devuelve cero.
- Red del navegador: con la pestaña oculta no hay peticiones a `/changes` (verificación manual en la
  checklist del Paso 11).
