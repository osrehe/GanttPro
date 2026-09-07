# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

**GanttPro**: aplicación web de planificación de proyectos con cartas Gantt (WBS jerárquico,
dependencias FS/SS/FF/SF con reprogramación automática, ruta crítica, recursos, líneas base,
exportación Excel/PDF). Se construye siguiendo un plan de 12 pasos (0–11). Estado actual: **Paso 2
completado** (engine: calendario, WBS, scheduling y ciclos). El siguiente paso es el Paso 3: CPM, carga de recursos, varianza y modelo de layout en el engine.

Fuentes de verdad, en este orden:

1. `prompt-claude-code-gantt.md` — prompts detallados de cada paso y tabla "Decisiones ya tomadas".
2. `docs/spec/plan-de-pasos.md` — resumen del plan, criterios de aceptación y estado por paso.
3. `docs/spec/*.md` y `docs/adr/*.md` (desde el Paso 1) — nombres de entidades y campos, ADRs.

## Flujo de trabajo por pasos (regla central)

**Un paso = un commit cerrado con tests + tag `paso-N`.** En cada paso:

1. Antes de escribir código, describe brevemente el enfoque y la lista de archivos a crear o modificar.
2. Implementa completo, sin TODOs ni placeholders.
3. Ejecuta `npm run lint`, `npm run typecheck` y `npm run test`; corrige hasta que todo pase.
4. Termina con un resumen: qué se hizo, cómo probarlo manualmente y qué falta para el siguiente paso.
5. No avances al siguiente paso hasta que el usuario lo apruebe explícitamente. No mezcles pasos.

No reabras las decisiones de la tabla "Decisiones ya tomadas" sin consultar al usuario.

## Comandos

```
npm run dev            # Next.js con Turbopack en http://localhost:3000 (GET /health → { status: "ok" })
npm run build          # build de producción
npm run lint           # ESLint (incluye la regla de frontera del engine)
npm run format         # Prettier; format:check solo verifica (lo usa CI)
npm run typecheck      # tsc para la app (tsconfig raíz) y para packages/engine
npm run test           # Vitest, proyectos "engine" y "web", con TZ=UTC
npm run test:watch
npm run test:coverage  # cobertura del engine con umbral 90 % (líneas, ramas, funciones)
npm run clean
docker compose up -d   # Postgres 16: BD ganttpro y ganttpro_test (usuario/clave ganttpro). Puerto host: POSTGRES_PORT en .env
```

Ejecutar un solo archivo de tests: `npx cross-env TZ=UTC vitest run packages/engine/tests/dates.test.ts`.
Filtrar por nombre: `npx cross-env TZ=UTC vitest run -t "addDays"`. Ejecutar solo un proyecto:
`npx cross-env TZ=UTC vitest run --project engine`.

Husky ejecuta en pre-commit `lint-staged` (eslint --fix + prettier sobre lo staged) y `npm run typecheck`.
CI (`.github/workflows/ci.yml`) corre lint, format:check, typecheck y test en Node 22.

Scripts `db:*`, `test:e2e` y demás se agregan en los pasos que los necesitan (4 en adelante).

## Stack

Next.js 15.5 (App Router, React 19) · TypeScript estricto con `noUncheckedIndexedAccess` · Tailwind v4 ·
shadcn/ui (estilo `radix-nova`, base `radix-ui`, iconos `lucide-react`) · Vitest 3 · Prettier con
plugin de Tailwind · ESLint 9 flat config. Pendientes de incorporar según el plan: Prisma + Postgres,
Auth.js, Zustand, TanStack Query/Table, Zod, Playwright, exceljs, Puppeteer, Recharts.

Entorno: Windows 11 + PowerShell. Todo script npm debe funcionar en PowerShell (`cross-env`, `rimraf`;
nada de sintaxis bash en `package.json`). `.gitattributes` fuerza LF en el repo.

## Arquitectura

- **`packages/engine` (`@ganttpro/engine`) es TypeScript puro.** No puede importar React, Next, Prisma
  ni `@/*`; ESLint lo bloquea (`no-restricted-imports`) y su `tsconfig` no incluye la lib DOM. Next lo
  consume desde el código fuente vía `transpilePackages`; Vitest y `tsc` lo resuelven con el alias
  `@ganttpro/engine`. Módulos actuales: `dates.ts` (fechas date-only), `calendar.ts` (`WorkingCalendar` con índice precomputado), `wbs.ts` (renumerar, indentar, desindentar, mover), `cycles.ts` (`detectCycle`, `topologicalOrder`), `schedule.ts` (`scheduleProject`, `earliestStartFromPredecessor`), `errors.ts` (`EngineError` con códigos). Pendientes: CPM, carga de recursos, varianza y el
  modelo de layout del Gantt. Objetivo de cobertura ≥ 90 %.
- **Fechas de plan son date-only** (`YYYY-MM-DD`). Usa las utilidades de `packages/engine/src/dates.ts`
  (`addDays`, `diffDays`, `dayOfWeek`, `toEpochDay`…). Nunca `new Date()` local ni librerías de fechas
  para aritmética de plan. Los tests corren con `TZ=UTC` para detectar dependencias de zona horaria.
- **Vitest en la raíz con dos proyectos**: `engine` (raíz `packages/engine`, tests en `tests/`) y `web`
  (tests `src/**/*.test.ts(x)`, alias `@` y `@ganttpro/engine`). Los Route Handlers se prueban
  importando la función exportada (`GET`, `PATCH`…) y llamándola directamente, como en
  `src/app/health/route.test.ts`.
- **Rutas de Next**: `src/app`. `/health` es un Route Handler público. Las páginas de la app irán bajo
  `src/app/(app)`, la API bajo `src/app/api`, la ruta de impresión PDF bajo `src/app/print/gantt`.
- **shadcn/ui**: componentes en `src/components/ui`, helper `cn` en `src/lib/utils.ts`. Agregar
  componentes con `npx shadcn@latest add <componente>`. Las fuentes se exponen como variables CSS
  `--font-sans` y `--font-geist-mono` desde `src/app/layout.tsx`; `globals.css` las consume.

## Convenciones

- **UI, mensajes de error, comentarios, documentación y commits en español (Chile).** Identificadores
  (variables, funciones, tablas, columnas, rutas de API, nombres de archivo de código) en inglés.
- Mensajes de error del engine descriptivos y en español (ver `assertIsoDate`).
- Prettier: comillas dobles, punto y coma, `printWidth` 100, `trailingComma: all`.
- Commits: `tipo: descripción en español` (`feat`, `fix`, `docs`, `test`, `chore`, `refactor`).
