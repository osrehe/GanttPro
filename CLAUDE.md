# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

**GanttPro**: aplicación web de planificación de proyectos con cartas Gantt (WBS jerárquico,
dependencias FS/SS/FF/SF con reprogramación automática, ruta crítica, recursos, líneas base,
exportación Excel/PDF). Se construye siguiendo un plan de 12 pasos (0–11). Estado actual: **Paso 5
completado** (API completa con tests de integración). El siguiente paso es el Paso 6: UI base
(proyectos, tabla WBS, store con undo/redo, recursos).

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
Prettier con plugin de Tailwind · ESLint 9 flat config. Pendientes según el plan: Zustand, TanStack
Query/Table, exceljs, Puppeteer, Recharts.

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
- **Auditoría**: toda mutación pasa por `withAudit` de `src/lib/audit.ts`, que ejecuta la mutación y
  escribe `AuditLog` en la misma transacción (`operationId` agrupa cascadas).
- **Vitest en la raíz con dos proyectos**: `engine` (raíz `packages/engine`, tests en `tests/`) y `web`
  (tests `src/**/*.test.ts(x)`). Los Route Handlers se prueban importando la función exportada y
  llamándola con un `Request`, como en `src/app/health/route.test.ts`. Los e2e viven en `e2e/`.
- **Rutas de Next**: `src/app`. `/health` público, `/login` con `login-form.tsx` cliente. Las páginas
  de la app irán bajo `src/app/(app)`, la API bajo `src/app/api`, la impresión PDF bajo
  `src/app/print/gantt`. Feriados de Chile por año en `src/lib/holidays/cl-AAAA.json`.
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
