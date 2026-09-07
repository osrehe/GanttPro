# Plan de pasos — GanttPro

Versión 2 (2026-09-06). Fuente de verdad del orden de trabajo. Los prompts detallados de cada paso
están en `prompt-claude-code-gantt.md` en la raíz del repositorio.

## Protocolo de cada paso

1. Describir el enfoque y la lista de archivos a crear o modificar.
2. Implementar completo, sin TODOs ni placeholders.
3. Ejecutar `npm run lint`, `npm run typecheck` y `npm run test`; corregir hasta que todo pase.
4. Resumir: qué se hizo, cómo probarlo manualmente, qué falta para el siguiente paso.
5. Esperar aprobación del usuario. Cerrar con un commit y el tag `paso-N`.

## Decisiones fijadas

| Tema             | Decisión                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base de datos    | PostgreSQL 16 en Docker, único proveedor en dev, test y prod.                                                                                                        |
| Despliegue       | Docker self-hosted / VPS.                                                                                                                                            |
| Autenticación    | Login mínimo (Auth.js credenciales) desde el Paso 4; roles por proyecto, Google y enlaces compartidos en el Paso 10.                                                 |
| Layout del repo  | Next.js en la raíz + `packages/engine` como workspace npm (`transpilePackages`). El engine no importa React, Next ni Prisma (regla ESLint).                          |
| Fechas           | Date-only: `@db.Date` en Prisma, `YYYY-MM-DD` en engine y API. Índice precomputado de días hábiles.                                                                  |
| Planificación    | Tareas ASAP con `anchorDate` (intención) y `startDate`/`endDate` calculados. Inicio = max(ancla, derivado de predecesoras).                                          |
| Esfuerzo y costo | Duración fija en días hábiles; esfuerzo informativo. Horas = duración × horas/día × % dedicación. Costo = horas × tarifa UF.                                         |
| Resúmenes/hitos  | Resumen: derivado, no editable, avance ponderado por duración o esfuerzo. Hito: duración 0. Sin dependencias hacia/desde resúmenes en v1.                            |
| Render del Gantt | SVG + React con virtualización vertical y modelo de layout puro compartido con PNG y PDF.                                                                            |
| PDF              | Puppeteer contra ruta interna `/print/gantt` con páginas explícitas. Texto vectorial.                                                                                |
| Undo/redo        | Store Zustand único con patrón command; engine en cliente para preview optimista, servidor como fuente de verdad; inverso persistido vía `bulk`.                     |
| API              | Route Handlers, Zod compartido, envolvente `{ data } \| { error }`, códigos `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CYCLE`, `CONFLICT`, `INTERNAL`. |
| Colaboración     | Polling TanStack Query 2 s contra `GET /api/projects/:id/changes?since=`.                                                                                            |
| Idioma           | Español (Chile) en UI, docs, comentarios y commits; identificadores en inglés; sin framework i18n.                                                                   |

## Pasos

| Paso | Nombre                                                 | Entregables principales                                                                                                              | Criterios de aceptación                                                                                                         | Estado     |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0    | Bootstrap                                              | git, Next.js 15, TS estricto, Tailwind, shadcn/ui, `/health`, workspace `packages/engine`, ESLint/Prettier/Husky, Docker Compose, CI | `dev` + `/health` OK; `lint`, `typecheck`, `test` verdes; `docker compose up -d` levanta Postgres; CLAUDE.md describe el flujo  | Completado |
| 1    | Especificación y ADRs                                  | `docs/spec/{funcional,modelo-datos,arquitectura}.md`, `docs/adr/ADR-001…010.md`, matriz paso ↔ casos de uso                          | Nombres consistentes entre docs; cada caso de uso con Given/When/Then; cada ADR con contexto, decisión y consecuencias          | Completado |
| 2    | Engine: calendario, WBS y scheduling                   | `calendar.ts`, `wbs.ts`, `schedule.ts`, `cycles.ts` y tests                                                                          | Cobertura ≥ 90%; `scheduleProject` con 1.000 tareas / 1.500 dependencias < 50 ms                                                | Completado |
| 3    | Engine: CPM, recursos, varianza y layout               | `cpm.ts`, `resources.ts`, `baseline.ts`, `layout.ts` y tests                                                                         | Cobertura ≥ 90%; CPM contra ejemplo con holguras conocidas; snapshots del layout en 4 escalas                                   | Completado |
| 4    | Datos y autenticación mínima                           | `schema.prisma`, migración, Auth.js credenciales, middleware, `withAudit`, seed (≈40 tareas) y seed-perf (1.000)                     | `db:migrate` y `db:seed` desde cero; e2e de login correcto/incorrecto y redirección                                             | Pendiente  |
| 5    | API                                                    | CRUD, `PATCH /tasks/:id` con `affected`, `bulk`, `move`, `changes`, `api-client`                                                     | Integración: flujo mover predecesora; ciclo → 422 `CYCLE`; reindentar → WBS correcto; sin acceso → 403                          | Pendiente  |
| 6    | UI base                                                | Layout, proyectos, store con undo/redo, tabla WBS, panel de detalle, recursos                                                        | Creación solo con teclado; undo/redo 20 operaciones; e2e WBS 1, 1.1, 1.2 con rollup; consola limpia                             | Pendiente  |
| 7    | Gantt interactivo                                      | Split view, escalas, barras, drag & drop, dependencias por drag, flechas, virtualización                                             | e2e drag 3 días → sucesora FS; dependencia por drag; render < 1,5 s y drag < 16 ms/frame con 1.000 tareas; test de consistencia | Pendiente  |
| 8    | Seguimiento, baselines, recursos, dashboard, auditoría | Fecha de estado, baselines, histograma, nivelación, dashboard con curva S, vista de auditoría                                        | Tests de varianza y nivelación; e2e baseline → mover 2 tareas → tabla comparativa correcta                                      | Pendiente  |
| 9    | Exportación e importación                              | Excel, PDF vía `/print/gantt` + Puppeteer, PNG, import Excel/CSV y MSPDI                                                             | Round-trip Excel; PDF con páginas y texto "1.1"; round-trip plantilla; import MSPDI sin pérdida                                 | Pendiente  |
| 10   | Roles, colaboración y pulido                           | `ProjectMember`, `ShareLink`, polling, comentarios, atajos, modo oscuro, accesibilidad, configuración                                | Lector no edita (UI y 403); dos contextos ven cambios en < 3 s; axe sin violaciones críticas                                    | Pendiente  |
| 11   | QA final y entrega                                     | Suite completa, checklist de 30 verificaciones con evidencia, Lighthouse, seguridad, README, manual, CHANGELOG, Dockerfile, v1.0.0   | `build` sin warnings; suite 100% verde; checklist sin fallos abiertos; ninguna fila "parcial" sin backlog                       | Pendiente  |

## Matriz paso ↔ casos de uso

Los casos de uso están definidos en `docs/spec/funcional.md`. "Engine" indica que la lógica de
cálculo se implementa y prueba en `packages/engine` en ese paso, antes de exponerse en API o UI.

| Paso | Casos de uso que entrega                                                           | Casos de uso que prepara (engine o datos)                                              |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | — (especificación)                                                                 | Todos                                                                                  |
| 2    | —                                                                                  | Engine: UC-04 (días hábiles), UC-07, UC-09, UC-10, UC-11, UC-12, UC-13                 |
| 3    | —                                                                                  | Engine: UC-17, UC-19 (varianza), UC-20, UC-21 (avance esperado), UC-24 (layout), UC-38 |
| 4    | UC-31                                                                              | Datos de todos los UC; seed para UC-01…UC-38                                           |
| 5    | UC-10, UC-11, UC-12, UC-13 (vía API), UC-36 (registro)                             | API para UC-01…UC-09, UC-15, UC-16, UC-19, UC-25 (`bulk`), UC-34 (`changes`)           |
| 6    | UC-01, UC-02, UC-03, UC-05, UC-06, UC-07, UC-08, UC-09, UC-15, UC-16, UC-23, UC-25 | —                                                                                      |
| 7    | UC-14, UC-24                                                                       | —                                                                                      |
| 8    | UC-17, UC-18, UC-19, UC-20, UC-21, UC-22, UC-36 (vista), UC-38                     | —                                                                                      |
| 9    | UC-26, UC-27, UC-28, UC-29, UC-30                                                  | —                                                                                      |
| 10   | UC-04 (UI de calendario y feriados), UC-32, UC-33, UC-34, UC-35, UC-37             | —                                                                                      |
| 11   | — (QA, documentación y entrega)                                                    | Verificación de UC-01…UC-38 en el checklist                                            |

Cobertura: los 38 casos de uso quedan asignados a un paso de entrega. UC-04 se divide entre el
engine (Paso 2), el seed con feriados de Chile 2026 (Paso 4) y la interfaz de configuración (Paso 10).
