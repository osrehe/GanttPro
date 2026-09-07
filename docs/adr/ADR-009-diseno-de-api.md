# ADR-009 — Diseño de la API

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

La API sirve a un cliente rico que ejecuta el mismo engine ([ADR-008](ADR-008-store-unico-y-undo-redo.md)),
debe devolver en una sola respuesta todas las tareas afectadas por una reprogramación, registrar
`AuditLog` en cada mutación, validar entradas en ambos lados y verificar en cada llamada que el
usuario pertenece al proyecto ([ADR-005](ADR-005-autenticacion-temprana-y-roles-por-proyecto.md)).
Los tests de integración deben correr en Vitest sin levantar el servidor de Next.

## Decisión

1. **Route Handlers** en `src/app/api/**/route.ts` (App Router). Sin tRPC ni GraphQL: la superficie
   es pequeña y REST es legible desde `curl`, Excel Power Query o un script.
2. **Zod compartido** en `src/lib/schemas/*.ts`: un esquema por entidad y por operación
   (`createTaskSchema`, `patchTaskSchema`, `moveTaskSchema`, …). El cliente lo usa para validar
   formularios y tipar `api-client.ts`; el servidor lo usa para parsear el cuerpo. Los campos
   derivados (`startDate`, `endDate`, `wbsCode`, `isSummary`, `isCritical`, …) no existen en los
   esquemas de escritura, así que enviarlos produce `VALIDATION`.
3. **Envolvente uniforme.** Éxito: `{ data: T }` con 200/201. Error:
   `{ error: { code, message, details? } }` donde `message` está en español y `code` es uno de:

   | Código         | HTTP | Cuándo                                                               |
   | -------------- | ---- | -------------------------------------------------------------------- |
   | `VALIDATION`   | 422  | cuerpo o query inválidos; `details` trae los issues de Zod           |
   | `UNAUTHORIZED` | 401  | sin sesión                                                           |
   | `FORBIDDEN`    | 403  | sin `ProjectMember` o rol insuficiente                               |
   | `NOT_FOUND`    | 404  | entidad inexistente **o de otro proyecto** (no se revela cuál)       |
   | `CYCLE`        | 422  | la dependencia crearía un ciclo; `details.cycle` lista los `wbsCode` |
   | `CONFLICT`     | 409  | violación de unicidad o estado incompatible (p. ej. 6.ª baseline)    |
   | `INTERNAL`     | 500  | error no controlado; se registra, no se expone el detalle            |

4. **Endpoints de dominio** (además del CRUD de proyectos, tareas, dependencias, recursos,
   asignaciones y baselines):
   - `PATCH /api/tasks/:id` — aplica campos editables (`name`, `anchorDate`, `durationDays`,
     `progressPct`, `effortHours`, `priority`, `status`, `color`, `isMilestone`, `notes`,
     `description`), reprograma el proyecto en el servidor y responde
     `{ data: { task, affected: Task[] } }` con toda tarea cuyo estado persistido cambió.
   - `POST /api/tasks/:id/move` — `{ parentId, orderIndex }`; reindenta/reordena, renumera y responde
     todas las tareas del proyecto con `wbsCode` nuevo.
   - `POST /api/projects/:id/tasks/bulk` — lote transaccional de `create`/`update`/`delete` para el
     inverso del undo y la importación; una sola reprogramación; responde `affected`.
   - `GET /api/projects/:id/changes?since=<ISO timestamp>` — filas de `AuditLog` posteriores al
     cursor, con las entidades actualizadas embebidas; alimenta el polling.
   - `GET /api/projects/:id/full` — proyecto completo (tareas, dependencias, recursos, asignaciones,
     calendario, feriados, baselines) en una sola respuesta para la carga inicial.
5. **Autorización en cada handler:** `const { user, project, role } = await requireProject(req,
params.id, "EDITOR")` resuelve sesión, membresía y rol mínimo; cualquier entidad hija se carga
   siempre con `where: { id, projectId }`, de modo que un id de otro proyecto produce `NOT_FOUND`.
6. **Auditoría:** las mutaciones pasan por `withAudit(user.id, projectId, entityType, action, fn)`
   que ejecuta `fn` en una transacción de Prisma, captura `before`/`after` y escribe `AuditLog` con
   un `summary` en español.
7. **Tests de integración** en `src/app/api/**/*.test.ts` (proyecto `web` de Vitest): importan la
   función `GET`/`POST`/`PATCH` exportada, construyen un `Request` con `new Request(url, { method,
headers, body })` y una sesión de prueba, y afirman sobre `await res.json()`. Corren contra
   `DATABASE_URL_TEST` con las tablas truncadas por archivo. No se usa supertest ni un servidor HTTP.

## Consecuencias

Positivas:

- Un esquema Zod, un tipo TypeScript y una validación en ambos extremos; los campos derivados no se
  pueden corromper desde el cliente.
- `affected` en una sola respuesta evita N peticiones y hace trivial el resaltado de la UI.
- `NOT_FOUND` para ids ajenos cierra la fuga de información entre proyectos que el Paso 11 verifica
  con tests de autorización cruzada.
- Los tests de integración arrancan en segundos y depuran con puntos de interrupción normales.

Negativas:

- Invocar handlers directamente no ejerce `middleware.ts`; por eso la protección de sesión se
  verifica además en e2e y `requireProject` se llama dentro de cada handler (defensa en profundidad).
- `changes?since=` con `AuditLog` crece sin límite; se pagina por `createdAt` y el Paso 11 añade una
  tarea de retención (por ejemplo, 180 días).
- REST manual implica escribir cada handler; la superficie es acotada (≈ 30 rutas).

## Alternativas descartadas

- **tRPC.** Tipado punta a punta muy cómodo, pero acopla el cliente al servidor de Next, dificulta
  consumir la API desde scripts o integraciones (v2: Jira, Power Query) y añade una capa sobre los
  Route Handlers que ya son tipados con Zod.
- **Server Actions para mutaciones.** Sin códigos HTTP ni URL estable; incómodas de probar sin el
  runtime de React y sin uso posible fuera de la app.
- **supertest contra `next start`.** Requiere compilar y levantar la app en cada corrida; más lento y
  frágil en Windows.

## Cómo verificarla

- Test de integración (Paso 5): crear tarea A y B → dependencia A→B FS → `PATCH` `anchorDate` de A
  +3 días hábiles → la respuesta incluye B en `affected` con `startDate` desplazado 3 días hábiles.
- Crear dependencia B→A responde 422 `{ error: { code: "CYCLE", details: { cycle: ["1", "2", "1"] } } }`.
- `GET /api/tasks/:idDeOtroProyecto` con un usuario sin membresía responde 404, y con membresía en
  otro proyecto también 404 (nunca 403, para no revelar existencia).
- `grep -rn "prisma\." src/app/api` no muestra ningún acceso a `task`, `dependency`, `resource`,
  `assignment` o `baseline` sin `projectId` en el `where` (revisión en el Paso 11).
