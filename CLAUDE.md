# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado actual del repositorio

**Aún no hay código.** El repositorio contiene únicamente `prompt-claude-code-gantt.md`, la especificación
por pasos (Paso 0 a Paso 8) para construir **GanttPro**, una aplicación web de planificación de proyectos
con cartas Gantt. Ese archivo es la fuente de verdad del alcance y del orden de trabajo; léelo antes de
iniciar cualquier paso. No es todavía un repositorio git.

Cuando se complete el Paso 0, actualiza este archivo con los comandos reales del `package.json` y la
estructura de carpetas que efectivamente exista.

## Flujo de trabajo por pasos (regla central)

El proyecto se construye en pasos numerados definidos en `prompt-claude-code-gantt.md`.
**Un paso = un commit cerrado con tests.** En cada paso:

1. Antes de escribir código, describe brevemente el enfoque y la lista de archivos a crear o modificar.
2. Implementa completo, sin TODOs ni placeholders.
3. Ejecuta lint, typecheck y tests; corrige hasta que todo pase.
4. Termina con un resumen: qué se hizo, cómo probarlo manualmente y qué falta para el siguiente paso.
5. No avances al siguiente paso hasta que el usuario lo apruebe explícitamente. No mezcles pasos.

Cada paso tiene criterios de aceptación en la spec; el paso no está cerrado hasta cumplirlos todos.

Resumen de los pasos:

| Paso | Contenido |
|---|---|
| 0 | Contexto, CLAUDE.md, esqueleto Next.js con `/health`, ESLint/Prettier/Husky, docker-compose Postgres |
| 1 | Spec-first: `/docs/spec/{funcional,modelo-datos,arquitectura,plan-de-pasos}.md` |
| 2 | Prisma schema, motor de planificación en `/packages/engine`, API Route Handlers, seed |
| 3 | UI base: proyectos, tabla WBS editable (TanStack Table), recursos, undo/redo |
| 4 | Gantt interactivo (drag & drop, dependencias, ruta crítica, virtualización 1.000 tareas) |
| 5 | Avance, líneas base, histograma de recursos, nivelación, dashboard, auditoría |
| 6 | Exportación Excel/PDF/PNG e importación Excel/CSV/MS Project XML |
| 7 | Auth.js, roles, colaboración, comentarios, modo oscuro, accesibilidad |
| 8 | QA final, Lighthouse, seguridad, README, manual de usuario, tag v1.0.0 |

## Stack (no cambiar sin consultar al usuario)

- Next.js 15 (App Router) + TypeScript estricto + Tailwind + shadcn/ui
- Prisma ORM + PostgreSQL (dev con Docker Compose; fallback SQLite para desarrollo rápido)
- Zustand para el estado del Gantt; TanStack Query para datos remotos; TanStack Table para la grilla
- Zod para validación en cliente y servidor
- Vitest (unit e integración) + Playwright (e2e)
- Exportación: exceljs (Excel), @react-pdf/renderer o Puppeteer (PDF, debe ser vectorial)
- Recharts para gráficos (curva S, histograma)
- Auth.js para autenticación (Paso 7)

## Entorno de desarrollo

Windows 11 + VS Code + PowerShell. **Todos los scripts npm deben funcionar en PowerShell**: usa
`cross-env`, `rimraf` y similares; no dependas de sintaxis bash en `package.json`.

## Convenciones de idioma

- **UI, mensajes, comentarios, documentación y commits: español (Chile).**
- **Nombres de código (variables, funciones, tablas, columnas, rutas de API, archivos de código): inglés.**
- Fechas en formato `dd-mm-yyyy` en la UI y exportaciones. Moneda en UF o CLP.

## Comandos previstos por la spec

Estos scripts deben existir una vez completado el Paso 0 (y `db:*` desde el Paso 2). Verifica contra
`package.json` antes de usarlos y actualiza esta sección si cambian.

```
npm run dev          # levanta la app; /health debe responder OK
npm run build        # build de producción (sin warnings en el Paso 8)
npm run lint
npm run typecheck
npm run test         # Vitest (unit + integración)
npm run test:e2e     # Playwright
npm run db:migrate   # Prisma migrate
npm run db:seed      # proyecto de ejemplo (~40 tareas, 6 recursos, feriados chilenos 2026)
```

Husky pre-commit ejecuta lint + typecheck.

## Arquitectura prevista

Decisiones fijadas por la spec que condicionan dónde va cada cosa:

- **`/packages/engine` es TypeScript puro, sin React ni Prisma.** Contiene el motor de planificación:
  cálculo de días hábiles según calendario, `scheduleProject` (restricciones FS/SS/FF/SF con lag,
  propagación a sucesoras, rollup de tareas resumen), `criticalPath` (forward/backward pass, holgura
  total y libre), `detectCycle` y `resourceLoad`. Debe poder ejecutarse tanto en servidor como en
  cliente y tener cobertura de tests ≥ 90%. Nunca importes UI ni DB desde el engine.
- **La API vive en Route Handlers bajo `/app/api`** con validación Zod y respuestas tipadas.
  `PATCH /tasks/:id` aplica el cambio y devuelve en una sola respuesta todas las tareas afectadas por
  el reschedule; la UI resalta esas filas. Toda mutación escribe en `AuditLog` (quién, qué, antes/después).
- **Un único store Zustand** gobierna tabla y Gantt, con historial undo/redo. Todas las mutaciones
  (edición inline, drag & drop en el Gantt, panel de detalle) pasan por ese store, para que tabla y
  Gantt nunca se desincronicen.
- **Jerarquía WBS ilimitada** mediante `Task.parentId` + `orderIndex` + `wbsCode`. Reindentar una tarea
  recalcula los códigos WBS de todo el proyecto.
- **La spec en `/docs/spec` (Paso 1) es la fuente de verdad** para nombres de entidades y campos;
  el schema Prisma, la API y la UI deben usar exactamente esos nombres.
- La estrategia de renderizado del Gantt (SVG vs. Canvas) y la de PDF se deciden y justifican como
  ADR en `/docs/spec/arquitectura.md` durante el Paso 1; respétalas en los pasos posteriores.
- Valor UF: se ingresa manualmente en Configuración, dejando un adaptador preparado para una API
  externa (mindicador.cl) sin implementarlo en v1.
