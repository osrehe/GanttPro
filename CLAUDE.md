# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

**GanttPro**: aplicación web de planificación de proyectos con cartas Gantt (WBS jerárquico,
dependencias FS/SS/FF/SF con reprogramación automática, ruta crítica, recursos, líneas base,
exportación Excel/PDF). Se construye siguiendo un plan de 12 pasos (0–11). Estado actual: **Paso 9
completado** (exportación a Excel, PDF y PNG; importación Excel/CSV y MS Project). El siguiente
paso es el Paso 10: roles por proyecto, enlaces compartidos, colaboración, comentarios y pulido.

Fuentes de verdad, en este orden:

1. `prompt-claude-code-gantt.md` — prompts detallados de cada paso y tabla "Decisiones ya tomadas".
2. `docs/spec/plan-de-pasos.md` — estado actual, criterios de aceptación por paso y estado por caso de uso.
3. `docs/spec/funcional.md` (UC-01…UC-38), `docs/spec/modelo-datos.md` (nombres de entidades y campos),
   `docs/spec/arquitectura.md` y `docs/adr/ADR-001…010`.
4. `docs/registro-pasos.md` — tiempo y tokens por paso (actualizar al cerrar cada paso).

## Flujo de trabajo por pasos (regla central)

**Un paso = un commit cerrado con tests + tag `paso-N` + push a `origin`.** En cada paso:

1. Antes de escribir código, describe brevemente el enfoque y la lista de archivos a crear o modificar.
2. Implementa completo, sin TODOs ni placeholders.
3. Ejecuta `npm run lint`, `npm run typecheck`, `npm run test` (y `npm run test:e2e` cuando toque UI);
   corrige hasta que todo pase.
4. Actualiza `docs/spec/plan-de-pasos.md` (estado del paso y de los UC), `docs/registro-pasos.md` y
   este archivo; resume qué se hizo, cómo probarlo y qué falta.
5. El usuario autorizó avanzar de corrido hasta el Paso 11; detente solo ante decisiones que le
   correspondan (credenciales, cambios de alcance).

No reabras las decisiones de la tabla "Decisiones ya tomadas" sin consultar al usuario.

## Comandos

```
npm run dev              # Next.js con Turbopack en http://localhost:3000 (GET /health → { status: "ok" })
npm run build
npm run lint             # ESLint (incluye la regla de frontera del engine)
npm run format           # Prettier; format:check solo verifica (lo usa CI)
npm run typecheck        # tsc para la app (tsconfig raíz) y para packages/engine
npm run test             # Vitest, proyectos "engine" y "web", con TZ=UTC
npm run test:coverage    # cobertura del engine con umbral 90 %
npm run test:unit        # solo engine + web (sin base de datos)
npm run test:integration # Route Handlers reales contra ganttpro_test (trunca sus tablas)
npm run test:e2e         # Playwright (Chromium). Requiere BD sembrada; levanta o reutiliza `npm run dev`
npm run test:e2e:perf    # rendimiento del Gantt con el seed de 1.110 tareas (requiere db:seed:perf); corre aparte
docker compose up -d     # Postgres 16: BD ganttpro y ganttpro_test. Puerto host: POSTGRES_PORT en .env
npm run db:migrate       # prisma migrate dev (crea/aplica migraciones en desarrollo)
npm run db:migrate:deploy
npm run db:seed          # proyecto de demostración (46 tareas, 34 dependencias, 6 recursos) + 3 usuarios
npm run db:seed:perf     # proyecto sintético de 1.110 tareas / 1.500 dependencias (requiere db:seed antes)
npm run db:reset         # prisma migrate reset --force (borra la BD, migra y siembra)
npm run db:studio
```

Un solo archivo de tests: `npx cross-env TZ=UTC vitest run packages/engine/tests/dates.test.ts`.
Filtrar: `npx cross-env TZ=UTC vitest run -t "addDays"`. Un proyecto: `... --project engine`.
Un e2e: `npx playwright test e2e/auth.spec.ts`.

**Prisma bloquea `migrate reset` cuando detecta que lo invoca Claude Code.** Para validar "desde
cero" sin intervención humana, aplica sobre la BD de test:
`npx cross-env DATABASE_URL=<DATABASE_URL_TEST> prisma migrate deploy` y luego
`npx cross-env DATABASE_URL=<DATABASE_URL_TEST> prisma db seed`. `db:reset` lo ejecuta el usuario.

Husky ejecuta en pre-commit `lint-staged` (eslint --fix + prettier) y `npm run typecheck`. CI corre
lint, format:check, typecheck y test; un segundo job levanta Postgres, migra, siembra, hace build y
corre los e2e.

Usuarios del seed: `admin@ganttpro.local` (ADMIN), `editor@ganttpro.local` (EDITOR),
`lector@ganttpro.local` (VIEWER); contraseña `SEED_PASSWORD` (por defecto `GanttPro2026!`).

## Stack

Next.js 15.5 (App Router, React 19) · TypeScript estricto con `noUncheckedIndexedAccess` · Tailwind v4 ·
shadcn/ui (estilo `radix-nova`, base `radix-ui`, iconos `lucide-react`) · Prisma 6 + PostgreSQL 16 ·
Auth.js (`next-auth@5` beta, credenciales, sesión JWT) · zod 4 · bcryptjs · Vitest 3 · Playwright ·
Prettier con plugin de Tailwind · ESLint 9 flat config. Zustand · TanStack Query · sonner · react-markdown · Recharts · exceljs · Puppeteer ·
fast-xml-parser · pdf-parse (solo en tests).

Entorno: Windows 11 + PowerShell. Todo script npm debe funcionar en PowerShell (`cross-env`, `rimraf`;
nada de sintaxis bash en `package.json`). `.gitattributes` fuerza LF en el repo.

## Arquitectura

- **`packages/engine` (`@ganttpro/engine`) es TypeScript puro.** No puede importar React, Next, Prisma
  ni `@/*`; ESLint lo bloquea (`no-restricted-imports`) y su `tsconfig` no incluye la lib DOM. Next lo
  consume desde el código fuente vía `transpilePackages`; Vitest, `tsc` y `tsx` lo resuelven como
  workspace. Módulos: `dates.ts` (fechas date-only), `calendar.ts` (`WorkingCalendar` con índice
  precomputado), `wbs.ts` (renumerar, indentar, desindentar, mover), `cycles.ts` (`detectCycle`,
  `topologicalOrder`), `schedule.ts` (`scheduleProject`, `earliestStartFromPredecessor`), `cpm.ts`
  (`criticalPath`, `applyCriticalPath`), `resources.ts` (`resourceLoad`, `aggregateWeekly`,
  `projectCosts`), `baseline.ts` (`takeBaseline`, `compareWithBaseline`, `expectedProgressAt`,
  `bulkProgressUpdates`), `layout.ts` (`createTimeAxis`, `layoutBars`, `layoutArrows`,
  `visibleRowRange`), `errors.ts` (`EngineError` con códigos `CYCLE`, `INVALID_DEPENDENCY`,
  `INVALID_MOVE`, `INVALID_CALENDAR`, `NOT_FOUND`). Cobertura ≥ 90 % obligatoria.
- **Fechas de plan son date-only** (`YYYY-MM-DD`). En Prisma son `@db.Date`; convierte siempre con
  `toDbDate`/`fromDbDate` de `src/lib/dates.ts`. Nunca `new Date()` local para aritmética de plan.
  Los tests corren con `TZ=UTC`.
- **Base de datos**: `prisma/schema.prisma` sigue `docs/spec/modelo-datos.md`. El calendario base de
  un proyecto es el `Calendar` con `isBase = true` (índice único parcial creado a mano en la
  migración inicial). Cliente único en `src/lib/db.ts`. Los seeds (`prisma/seed.ts`,
  `prisma/seed-perf.ts`) programan las tareas con el engine antes de insertarlas.
- **Autenticación**: `src/lib/auth.config.ts` es la parte compatible con edge (la usa
  `src/middleware.ts`, que protege todo salvo `/login`, `/health` y `/api/auth`; la API sin sesión
  recibe 401 `UNAUTHORIZED`). `src/lib/auth.ts` agrega el proveedor de credenciales con Prisma y
  bcrypt y expone `auth`, `signIn`, `signOut`, `getSessionUser()` y `hashPassword()`. Roles por
  proyecto en `ProjectMember` (se aplican en el Paso 10).
- **API** (`src/app/api`, ADR-009): Route Handlers delgados envueltos en `handle()` de
  `src/lib/api/response.ts` (envolvente `{ data }` / `{ error: { code, message, details } }` y mapeo
  de `ApiError`, `EngineError`, Zod y Prisma). Acceso con `requireProjectAccess(projectId, minRole)`
  y `requireTaskAccess` de `src/lib/api/access.ts` (403 sin membresía; archivado = solo lectura).
  Esquemas Zod compartidos en `src/lib/schemas`, DTOs con fechas ISO en `src/lib/dto.ts`, lógica en
  `src/lib/services/*` (`rescheduleProject` ejecuta el engine en servidor y persiste solo lo que
  cambió; toda mutación devuelve `affected`). Cliente tipado en `src/lib/api-client.ts`. Endpoints:
  `/api/projects` (+ `/:id`, `/full`, `/duplicate`, `/calendar`, `/tasks`, `/tasks/bulk`,
  `/dependencies`, `/resources`, `/baselines`, `/changes`), `/api/tasks/:id` (+ `/move`,
  `/assignments`), `/api/dependencies/:id`, `/api/resources/:id`, `/api/assignments/:id`,
  `/api/baselines/:id`. Tests de integración en `src/app/api/api.integration.test.ts` (mockean
  `@/lib/auth` con `vi.mock`, truncan las tablas de `ganttpro_test`).
- **Interfaz (Paso 6)**: rutas bajo `src/app/(app)` con `AppShell` (`src/components/shell/app-shell.tsx`:
  sidebar, header con selector de vista Tabla/Gantt/Recursos, deshacer/rehacer) y `Providers`
  (`src/app/providers.tsx`: TanStack Query, `TooltipProvider`, `Toaster` de sonner; todo `Tooltip` lo
  necesita). `/projects` lista tarjetas; `/projects/:id/{table,gantt,resources}` cargan el proyecto
  completo con `ProjectLoader` (`api.projects.full` → `hydrate`). **Un único store Zustand**
  (`src/stores/project-store.ts`) guarda datos y estado de UI (selección, colapsados, resaltado de 1 s
  con `highlight`); tabla y Gantt derivan de él (`visibleTasks`, `sortByWbs`). **Toda mutación es un
  `Command`** (`src/stores/commands.ts`) ejecutado por `CommandHistory` (`src/stores/history.ts`,
  patrón command con alias de ids para rehacer creaciones; test de 20 operaciones). Los comandos
  llaman a `api.*`, aplican `affected` con `applyTaskResult` y saben deshacerse (borrar ↔ recrear el
  subárbol, mover ↔ `bulk` con las posiciones previas). Las operaciones sin historial (CRUD de
  recursos, proyectos) usan `useMutation` directo. La columna Predecesoras usa
  `src/lib/predecessors.ts` (`parsePredecessors`, `formatPredecessors`, `diffPredecessors`). La tabla
  (`src/components/table/task-table.tsx`) es un grid propio con teclado: flechas, Enter/F2 o
  escribir para editar, Tab/Shift+Tab indentar, Insert nueva tarea (Shift: subtarea), Supr borrar,
  Espacio detalles; Ctrl+Z/Y globales en `useShortcuts`. Al editar escribiendo no se selecciona el
  contenido previo (`selectAll` solo con Enter/F2). Nunca llames a acciones del store dentro de un
  actualizador de `setState`.
- **Gantt (Paso 7, `src/components/gantt`)**: `gantt-view.tsx` orquesta un único contenedor con
  scroll compartido: `GanttLeftPane` (tabla reducida, `position: sticky; left: 0`) y la línea de
  tiempo (`GanttHeader` sticky arriba + `GanttTimeline` en SVG). La geometría viene del engine
  (`createTimeAxis`, `layoutBars`, `layoutArrows`, `nonWorkingRanges`, `visibleRowRange`) a través
  del modelo puro `gantt-model.ts` (`ganttRows` es la misma `visibleTasks` que usa la tabla; test de
  consistencia con 50 operaciones aleatorias). Virtualización vertical con `visibleRowRange` (solo se
  pintan filas, barras y flechas del rango visible). Escalas día/semana/mes/trimestre, zoom con
  Ctrl+rueda (`pxPerDay`), "Ajustar al proyecto" (`fitToWidth`), ruta crítica, línea base fantasma
  (consulta `api.baselines.get`), color por tarea/recurso/estado y etiqueta configurable.
  Interacciones en `use-gantt-interactions.ts`: mover (`anchorDate`), redimensionar (`endDate`),
  avance y crear dependencias desde los conectores (tipo inferido con `inferDependencyType`); durante
  el arrastre **no hay estado de React**: se actualizan por DOM un `rect` y una `line` de
  previsualización (refs), y al soltar se aplica el engine en el cliente (`scheduleProject` +
  `applyCriticalPath`) como previsualización optimista y se ejecuta el comando deshacible. Las capas
  decorativas del SVG (sombreado, grilla, filas, líneas Hoy/estado) llevan `pointer-events-none`
  para no tapar las barras. Clic en una flecha abre `DependencyPopover` (tipo, desfase, eliminar).
  Rendimiento medido en `e2e/gantt.perf.spec.ts` (se ejecuta aparte con `npm run test:e2e:perf`
  porque compite por CPU): marcas `project:hydrated` y `gantt:rendered` con `performance.mark`, y
  `window.__ganttDragStats` con el costo por evento de arrastre.
- **Seguimiento (Paso 8, `src/components/tracking`)**: la fecha de estado vive en `Project.statusDate`
  (`TrackingToolbar` en la tabla y en el dashboard la editan con `api.projects.update`). Todo el
  cálculo es del engine en el cliente: `trackingStatus` (columnas Esperado/Desv. e indicador de
  atraso en la tabla), `bulkProgressUpdates` ("Avance a fecha": actúa sobre la tarea seleccionada y
  sus subtareas, o sobre todas; nunca baja un avance), `compareWithBaseline` (`BaselinesView` calcula
  la comparativa con la fotografía de `api.baselines.get` y las tareas actuales del store, sin
  depender de la caché), `projectKpis` y `sCurve` (`DashboardView`, Recharts), `resourceLoad`,
  `aggregateWeekly` y `proposeLeveling` (`ResourceHistogram` en la vista Recursos: histograma
  diario/semanal con capacidad, clic en barra lista las tareas, "Nivelar" muestra la propuesta y la
  aplica con `bulkPatchCommand`). `bulkPatchCommand` (en `commands.ts`) es el comando deshacible
  genérico para actualizaciones masivas; el endpoint `bulk` devuelve siempre las tareas editadas
  además de las reprogramadas. Auditoría: `AuditView` usa `/api/projects/:id/changes` con filtros
  `entityId`, `userId`, `from`, `to`, `order`. Configuración global en `/api/settings`
  (`src/lib/services/settings.ts`; claves `ufValue`, `ufValueDate`, `displayCurrency`,
  `dateFormat`, `logoUrl`) y adaptador `UfProvider` en `src/lib/uf-provider.ts` (`ManualUfProvider`
  activo; `MindicadorUfProvider` preparado, sin uso en v1). Las vistas Dashboard, Líneas base y
  Auditoría son pestañas del header del proyecto.
- **Exportación (Paso 9, `src/lib/export`)**: `excel.ts` arma el libro con exceljs (hojas Tareas,
  Gantt, Recursos, Dependencias y Resumen; las nueve primeras columnas de Tareas son las de la
  plantilla de importación, así que exportar e importar es un round-trip) y lo sirve
  `GET /api/projects/:id/export/xlsx?gantt=day|week`. El PDF es
  `GET /api/projects/:id/export/pdf?<opciones>`: `print-model.ts` valida las opciones
  (`parsePdfOptions`/`pdfOptionsToQuery`) y pagina (`paginate`), `pdf.ts` abre con Puppeteer
  `/print/gantt` autenticada con un token HMAC de 5 minutos (`print-token.ts`, el middleware deja
  pasar `/print/*?token=`) y `src/components/print/print-gantt.tsx` dibuja páginas explícitas con la
  misma geometría del engine que la vista web. El PNG (`png.ts`) se genera en el cliente
  serializando el SVG visible con los estilos calculados en línea. Diálogos y menú en
  `src/components/export`.
- **Importación (Paso 9, `src/lib/import`)**: dos fases. `POST /api/import/preview` (multipart, campo
  `file`) parsea CSV, XLSX o MSPDI hacia un `ImportedPlan` neutral y lo valida fila a fila
  (`rows.ts`, mismos errores y avisos que verá el usuario); `POST /api/import` recibe ese plan,
  **lo vuelve a validar** con `validatePlan` y lo escribe en una transacción con destino `new`,
  `append` o `replace`, terminando en `rescheduleProject` (las fechas las decide el engine).
  `GET /api/import/template` descarga la plantilla. Diálogo en `src/components/import`; fixture
  MSPDI en `fixtures/msproject-sample.xml`.
- **Auditoría**: toda mutación pasa por `withAudit` de `src/lib/audit.ts`, que ejecuta la mutación y
  escribe `AuditLog` en la misma transacción (`operationId` agrupa cascadas).
- **Vitest en la raíz con dos proyectos**: `engine` (raíz `packages/engine`, tests en `tests/`) y `web`
  (tests `src/**/*.test.ts(x)`). Los Route Handlers se prueban importando la función exportada y
  llamándola con un `Request`, como en `src/app/health/route.test.ts`. Los e2e viven en `e2e/`.
- **Rutas de Next**: `src/app`. `/health` público, `/login` con `login-form.tsx` cliente, páginas de la
  app bajo `src/app/(app)` (la raíz redirige a `/projects`), API bajo `src/app/api`, impresión PDF
  bajo `src/app/print/gantt`. Feriados de Chile por año en `src/lib/holidays/cl-AAAA.json`.
- **shadcn/ui**: componentes en `src/components/ui`, helper `cn` en `src/lib/utils.ts`. Agregar con
  `npx shadcn@latest add <componente>`. Fuentes como variables CSS `--font-sans` y `--font-geist-mono`.

## Convenciones

- **UI, mensajes de error, comentarios, documentación y commits en español (Chile).** Identificadores
  (variables, funciones, tablas, columnas, rutas de API, nombres de archivo de código) en inglés.
- Mensajes de error del engine descriptivos y en español (ver `assertIsoDate`, `EngineError`).
- Prettier: comillas dobles, punto y coma, `printWidth` 100, `trailingComma: all`.
- Commits: `tipo(ámbito): descripción en español` (`feat`, `fix`, `docs`, `test`, `chore`, `refactor`).
- Al escribir tests de e2e usa `data-testid` para elementos con texto dinámico y evita
  `getByRole("alert")` a secas: Next inyecta su propio anunciador de rutas con ese rol.
