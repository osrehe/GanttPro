# Tabla de entrega — GanttPro 1.0.0

Qué se entrega, dónde está implementado y qué prueba lo cubre. Una fila por caso de uso de
[`docs/spec/funcional.md`](spec/funcional.md), agrupadas por área.

**Estados.** _Completa_: implementada y cubierta por al menos una prueba automatizada. _Parcial_:
funciona con un límite conocido, y ese límite tiene su ítem en [`docs/backlog.md`](backlog.md). _No
implementada_: fuera del alcance de la versión 1.

En la columna de pruebas, `engine/` abrevia `packages/engine/tests/`, `api/` abrevia
`src/app/api/` y `e2e/` es la carpeta de pruebas end to end.

## Proyectos

| UC    | Funcionalidad                 | Estado   | Archivos principales                                                              | Prueba                                                               |
| ----- | ----------------------------- | -------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| UC-01 | Crear proyecto                | Completa | `src/components/projects/project-dialog.tsx`, `src/lib/services/projects.ts`      | `e2e/table.spec.ts` · `api/api.integration.test.ts`                  |
| UC-02 | Duplicar proyecto             | Completa | `src/lib/services/projects.ts`, `src/app/api/projects/[id]/duplicate/route.ts`    | `e2e/qa-checklist.spec.ts`                                           |
| UC-03 | Archivar y restaurar proyecto | Completa | `src/components/projects/projects-page.tsx`, `src/app/api/projects/[id]/route.ts` | `api/security.integration.test.ts` — proyecto archivado              |
| UC-04 | Calendario laboral y feriados | Completa | `src/components/settings/settings-view.tsx`, `src/lib/services/calendar.ts`       | `engine/calendar.test.ts` · `api/api.integration.test.ts` — feriados |

## Tareas y WBS

| UC    | Funcionalidad                     | Estado   | Archivos principales                                                 | Prueba                                                       |
| ----- | --------------------------------- | -------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| UC-05 | Crear tarea, subtarea e hito      | Completa | `src/components/table/task-table.tsx`, `src/lib/services/tasks.ts`   | `e2e/table.spec.ts` — 3 tareas por teclado                   |
| UC-06 | Editar campos de una tarea        | Completa | `src/components/table/task-table.tsx`, `task-sheet.tsx`              | `e2e/qa-checklist.spec.ts` · `api/api.integration.test.ts`   |
| UC-07 | Indentar, desindentar y reordenar | Completa | `packages/engine/src/wbs.ts`, `src/app/api/tasks/[id]/move/route.ts` | `engine/wbs.test.ts` · `e2e/table.spec.ts` — WBS 1, 1.1, 1.2 |
| UC-08 | Eliminar tarea                    | Completa | `src/lib/services/tasks.ts`, `src/stores/commands.ts`                | `api/api.integration.test.ts` · `e2e/qa-checklist.spec.ts`   |
| UC-09 | Rollup de tareas resumen          | Completa | `packages/engine/src/schedule.ts`                                    | `engine/schedule.test.ts` — rollup · `e2e/table.spec.ts`     |

## Dependencias y programación

| UC    | Funcionalidad                    | Estado   | Archivos principales                                                              | Prueba                                                         |
| ----- | -------------------------------- | -------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| UC-10 | Crear y editar dependencias      | Completa | `packages/engine/src/schedule.ts`, `src/lib/predecessors.ts`                      | `engine/schedule.test.ts` — tipos · `e2e/gantt.spec.ts`        |
| UC-11 | Reprogramación de sucesoras      | Completa | `src/lib/services/scheduling.ts`, `packages/engine/src/schedule.ts`               | `engine/schedule.test.ts` · `e2e/gantt.spec.ts` — mover 3 días |
| UC-12 | Mover tarea con predecesoras     | Completa | `src/components/gantt/use-gantt-interactions.ts`                                  | `e2e/gantt.spec.ts` — arrastre de barra                        |
| UC-13 | Quitar dependencia               | Completa | `src/lib/services/dependencies.ts`, `src/components/gantt/dependency-popover.tsx` | `engine/schedule.test.ts` · `api/api.integration.test.ts`      |
| UC-14 | Duración y avance desde el Gantt | Completa | `src/components/gantt/use-gantt-interactions.ts`                                  | `e2e/qa-checklist.spec.ts`                                     |

## Recursos

| UC    | Funcionalidad                | Estado   | Archivos principales                                                                 | Prueba                                                        |
| ----- | ---------------------------- | -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| UC-15 | Gestionar recursos           | Completa | `src/components/resources/resources-view.tsx`, `src/lib/services/resources.ts`       | `e2e/table.spec.ts` — crear recurso                           |
| UC-16 | Asignar recursos a tareas    | Completa | `src/components/table/assignment-editor.tsx`, `packages/engine/src/resources.ts`     | `engine/resources.test.ts` · `api/api.integration.test.ts`    |
| UC-17 | Sobreasignación e histograma | Completa | `src/components/tracking/resource-histogram.tsx`, `packages/engine/src/resources.ts` | `engine/resources.test.ts` — `resourceLoad`                   |
| UC-18 | Nivelar recursos             | Parcial  | `packages/engine/src/level.ts`, `src/components/tracking/resource-histogram.tsx`     | `engine/level.test.ts` — `proposeLeveling`                    |
| UC-38 | Calcular costos en UF y CLP  | Completa | `packages/engine/src/resources.ts`, `src/lib/uf-provider.ts`                         | `engine/resources.test.ts` — `convertAmount` y `projectCosts` |

UC-18 es parcial: la propuesta nunca mueve tareas críticas ni hitos, así que puede dejar días
sobreasignados que informa como no resueltos (ver
[backlog: nivelación de recursos más completa](backlog.md#nivelación-de-recursos-más-completa)).

## Seguimiento

| UC    | Funcionalidad                   | Estado   | Archivos principales                                                              | Prueba                                                     |
| ----- | ------------------------------- | -------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| UC-19 | Guardar y comparar líneas base  | Completa | `packages/engine/src/baseline.ts`, `src/components/tracking/baselines-view.tsx`   | `engine/baseline.test.ts` · `e2e/tracking.spec.ts` — +3/+3 |
| UC-20 | Ruta crítica y holguras         | Completa | `packages/engine/src/cpm.ts`, `src/components/gantt/gantt-toolbar.tsx`            | `engine/cpm.test.ts` — `criticalPath`                      |
| UC-21 | Fecha de estado y avance masivo | Completa | `packages/engine/src/baseline.ts`, `src/components/tracking/tracking-toolbar.tsx` | `engine/baseline.test.ts` · `e2e/tracking.spec.ts`         |
| UC-22 | Dashboard y curva S             | Completa | `packages/engine/src/dashboard.ts`, `src/components/tracking/dashboard-view.tsx`  | `engine/dashboard.test.ts` · `e2e/tracking.spec.ts`        |

## Vistas e interacción

| UC    | Funcionalidad                       | Estado   | Archivos principales                                      | Prueba                                                                                          |
| ----- | ----------------------------------- | -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| UC-23 | Vista Tabla con teclado             | Completa | `src/components/table/task-table.tsx`                     | `e2e/table.spec.ts` — consola limpia · `e2e/a11y.spec.ts`                                       |
| UC-24 | Vista Gantt con escalas y arrastres | Completa | `src/components/gantt/*`, `packages/engine/src/layout.ts` | `engine/layout.test.ts` · `src/components/gantt/gantt-model.test.ts` · `e2e/gantt.perf.spec.ts` |
| UC-25 | Deshacer y rehacer                  | Completa | `src/stores/history.ts`, `src/stores/commands.ts`         | `src/stores/history.test.ts` — 20 operaciones · `e2e/tracking.spec.ts`                          |

## Exportación e importación

| UC    | Funcionalidad             | Estado   | Archivos principales                                                        | Prueba                                                            |
| ----- | ------------------------- | -------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| UC-26 | Exportar a Excel          | Completa | `src/lib/export/excel.ts`, `src/app/api/projects/[id]/export/xlsx/route.ts` | `src/lib/export/excel.test.ts` · `e2e/export-import.spec.ts`      |
| UC-27 | Exportar a PDF            | Completa | `src/lib/export/pdf.ts`, `src/app/print/gantt/page.tsx`                     | `src/lib/export/print-model.test.ts` · `e2e/export-pdf.spec.ts`   |
| UC-28 | Exportar a PNG            | Completa | `src/lib/export/png.ts`, `src/components/gantt/gantt-view.tsx`              | `e2e/export-import.spec.ts` — descarga el PNG                     |
| UC-29 | Importar Excel y CSV      | Completa | `src/lib/import/{csv,excel,rows,template}.ts`                               | `src/lib/import/*.test.ts` · `e2e/export-import.spec.ts`          |
| UC-30 | Importar MS Project (XML) | Parcial  | `src/lib/import/mspdi.ts`, `fixtures/msproject-sample.xml`                  | `src/lib/import/mspdi.test.ts` · `api/import.integration.test.ts` |

UC-30 es parcial: se lee el formato XML (MSPDI) y no el binario `.mpp`, y los vínculos que salen de
una tarea resumen se descartan con aviso (ver
[backlog: importar archivos `.mpp`](backlog.md#importar-archivos-mpp-de-microsoft-project) y
[dependencias sobre resúmenes](backlog.md#dependencias-hacia-o-desde-tareas-resumen)).

## Usuarios y colaboración

| UC    | Funcionalidad           | Estado   | Archivos principales                                                         | Prueba                                                            |
| ----- | ----------------------- | -------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| UC-31 | Iniciar sesión          | Completa | `src/lib/auth.ts`, `src/middleware.ts`                                       | `e2e/auth.spec.ts` — cinco casos                                  |
| UC-32 | Roles por proyecto      | Completa | `src/lib/api/access.ts`, `src/lib/services/members.ts`                       | `api/members.integration.test.ts` · `e2e/roles.spec.ts`           |
| UC-33 | Compartir por enlace    | Completa | `src/lib/services/share.ts`, `src/app/share/[token]/page.tsx`                | `api/share.integration.test.ts` · `e2e/roles.spec.ts`             |
| UC-34 | Colaboración simultánea | Completa | `src/hooks/use-changes-polling.ts`, `src/lib/services/changes.ts`            | `src/hooks/changes-summary.test.ts` · `e2e/collaboration.spec.ts` |
| UC-35 | Comentarios y menciones | Parcial  | `src/lib/services/comments.ts`, `src/components/comments/comments-panel.tsx` | `api/comments.integration.test.ts` · `e2e/collaboration.spec.ts`  |
| UC-36 | Historial de cambios    | Completa | `src/lib/audit.ts`, `src/components/tracking/audit-view.tsx`                 | `api/api.integration.test.ts` · `e2e/tracking.spec.ts`            |
| UC-37 | Configuración global    | Completa | `src/lib/services/settings.ts`, `src/components/settings/settings-view.tsx`  | `e2e/a11y.spec.ts` · `e2e/qa-checklist.spec.ts`                   |

UC-35 es parcial: las menciones se registran y se ven en la aplicación, pero el aviso por correo
todavía no se envía (ver
[backlog: envío real de correo](backlog.md#envío-real-de-correo-para-las-menciones)).

## Requisitos no funcionales verificados

| Requisito                                       | Resultado                                                                 | Prueba                             |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| Carta Gantt con 1.000 tareas: render bajo 1,5 s | 777 ms con 1.110 tareas y 1.500 dependencias                              | `e2e/gantt.perf.spec.ts`           |
| Arrastre bajo 16 ms por evento                  | 0,05 ms por evento                                                        | `e2e/gantt.perf.spec.ts`           |
| Programación de 1.000 tareas bajo 50 ms         | Verificada en el motor                                                    | `engine/schedule.perf.test.ts`     |
| Cambio ajeno visible en menos de 3 s            | 0,6 s medidos en la última ejecución                                      | `e2e/collaboration.spec.ts`        |
| Sin violaciones graves de accesibilidad         | Proyectos, Tabla, Gantt, Recursos y Configuración, en tema claro y oscuro | `e2e/a11y.spec.ts`                 |
| Autorización cruzada entre proyectos            | Lectura y escritura ajenas responden 403 sin filtrar datos                | `api/security.integration.test.ts` |
| Cobertura del motor sobre 90 %                  | 98,59 % de sentencias                                                     | `npm run test:coverage`            |

## Cifras de la suite

Medidas el 2026-09-07 con los comandos indicados.

| Suite                                            | Archivos | Pruebas |
| ------------------------------------------------ | -------- | ------- |
| Motor (`vitest run --project engine`)            | 12       | 162     |
| Web (`vitest run --project web`)                 | 12       | 79      |
| Integración (`vitest run --project integration`) | 5        | 40      |
| **Total `npm test`**                             | **29**   | **281** |

End to end: 31 casos verdes (24 en Chromium y 7 repetidos en Firefox para ingreso y tabla), más el
recorrido de QA de 30 verificaciones (`npm run test:e2e:qa`) y la prueba de rendimiento, que se
ejecutan aparte. La lista de verificación y su evidencia están en
[`docs/qa/checklist.md`](qa/checklist.md) y `docs/qa/evidencia/`.

Cobertura del motor de planificación (`npm run test:coverage`, umbral configurado en 90 %):

| Métrica    | Valor   |
| ---------- | ------- |
| Sentencias | 98,59 % |
| Ramas      | 94,85 % |
| Funciones  | 100 %   |
| Líneas     | 98,59 % |
