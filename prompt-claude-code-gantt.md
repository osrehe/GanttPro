# Prompt multipasos para Claude Code — GanttPro (v2)

> **Versión 2 — 2026-09-06.** Revisión de la spec original tras análisis con Claude Code. Cambios principales: 12 pasos en vez de 9, autenticación mínima adelantada, Postgres como único motor, decisiones de dominio y arquitectura cerradas antes de codificar. El historial de la v1 queda en git.
>
> **Cómo usarlo:** pega el **Paso 0** al iniciar la sesión en Claude Code. Luego pega cada paso siguiente **solo cuando el anterior esté aceptado** (criterios de aceptación cumplidos). No mezcles pasos: cada uno es un `commit` cerrado con QA y un tag `paso-N`.

---

## Decisiones ya tomadas (no reabrir sin consultar)

| Tema              | Decisión                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base de datos     | PostgreSQL 16 en Docker, único proveedor para dev, test y prod. Sin fallback SQLite.                                                                                                                                                                                                                    |
| Despliegue        | Docker self-hosted / VPS (proceso Node persistente).                                                                                                                                                                                                                                                    |
| Autenticación     | Login mínimo (Auth.js credenciales + admin en seed) desde el Paso 4. Roles por proyecto, Google y enlaces compartidos en el Paso 10.                                                                                                                                                                    |
| Layout del repo   | Next.js en la raíz + `packages/engine` como workspace npm, consumido vía `transpilePackages`. El engine no importa React, Next ni Prisma (regla ESLint).                                                                                                                                                |
| Fechas            | Date-only. `@db.Date` en Prisma; `YYYY-MM-DD` en engine y API. Índice precomputado de días hábiles por calendario.                                                                                                                                                                                      |
| Planificación     | Todas las tareas ASAP. Cada tarea hoja tiene `anchorDate` (intención del usuario) y `startDate`/`endDate` calculados. Inicio = max(ancla, derivado de predecesoras). Arrastrar actualiza el ancla; quitar dependencia vuelve al ancla.                                                                  |
| Esfuerzo y costo  | Duración fija en días hábiles; esfuerzo informativo. Horas asignadas = duración × horas/día × % dedicación. Costo = horas × tarifa UF.                                                                                                                                                                  |
| Resúmenes e hitos | Resumen: fechas y avance derivados, no editables; avance ponderado por duración (default) o esfuerzo. Hito: duración 0. Dependencias hacia/desde resúmenes **no permitidas** en v1.                                                                                                                     |
| Render del Gantt  | SVG + React con virtualización vertical y un modelo de layout puro compartido con PNG y PDF.                                                                                                                                                                                                            |
| PDF               | Puppeteer contra ruta interna `/print/gantt` con páginas explícitas. Texto vectorial. Chromium en la imagen Docker.                                                                                                                                                                                     |
| Undo/redo         | Store Zustand único con patrón command; engine en cliente para preview optimista, servidor como fuente de verdad; inverso persistido vía endpoint bulk.                                                                                                                                                 |
| API               | Route Handlers, Zod compartido en `src/lib/schemas`, envolvente `{ data } \| { error: { code, message, details } }`, códigos `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CYCLE`, `CONFLICT`, `INTERNAL`. Tests de integración invocan los handlers directamente contra BD `ganttpro_test`. |
| Colaboración      | Polling TanStack Query 2 s contra `GET /api/projects/:id/changes?since=`. SSE queda para v2.                                                                                                                                                                                                            |
| Idioma            | Español (Chile) en UI, docs, comentarios y commits. Identificadores en inglés. Sin framework i18n. Feriados de Chile como JSON estático por año.                                                                                                                                                        |
| Git               | Un paso = un commit + tag `paso-N`. CI en GitHub Actions.                                                                                                                                                                                                                                               |

---

## PASO 0 — Bootstrap del proyecto

```
Vas a construir "GanttPro", una aplicación web para planificar proyectos con cartas Gantt.
Trabajaremos en pasos numerados (0 a 11) definidos en prompt-claude-code-gantt.md. En cada paso:
1. Antes de escribir código, describe brevemente el enfoque y la lista de archivos que crearás o modificarás.
2. Implementa completo (sin TODOs ni placeholders).
3. Ejecuta lint, typecheck y tests; corrige hasta que todo pase.
4. Termina con un resumen: qué se hizo, cómo probarlo manualmente, y qué falta para el siguiente paso.
No avances al siguiente paso hasta que yo lo apruebe. Respeta la tabla "Decisiones ya tomadas".

Stack (no cambiar sin consultarme):
- Next.js 15 (App Router) + TypeScript estricto (strict + noUncheckedIndexedAccess) + Tailwind + shadcn/ui
- Prisma ORM + PostgreSQL 16 (Docker Compose)
- Zustand para estado del Gantt; TanStack Query para datos remotos; TanStack Table para la grilla
- Zod para validación en ambos lados
- Vitest (unit + integración) + Playwright (e2e)
- Exportación: exceljs (Excel), Puppeteer (PDF)
- Recharts para gráficos
- Entorno: Windows 11 + VS Code + PowerShell. Todos los scripts npm deben funcionar en PowerShell (cross-env, rimraf).

Tareas de este paso:
- git init, .gitignore, .env.example, docker-compose.yml (Postgres 16 con BD ganttpro y ganttpro_test).
- Esqueleto Next.js 15 con src/, Tailwind, shadcn/ui inicializado, GET /health que responde { status: "ok" }.
- Workspace packages/engine con package.json, tsconfig, un módulo trivial y un test Vitest. Vitest en la raíz con projects (engine, web).
- ESLint (incluida regla no-restricted-imports que impide importar react/next/@prisma desde packages/engine), Prettier, Husky + lint-staged (pre-commit: lint + typecheck).
- GitHub Actions: lint, typecheck, test.
- docs/spec/plan-de-pasos.md con el plan de 12 pasos; CLAUDE.md con descripción, stack, convenciones, comandos reales, estructura y la regla "un paso = un commit con tests".

Criterios de aceptación:
- `npm run dev` levanta la app y /health responde.
- `npm run lint`, `npm run typecheck` y `npm run test` pasan sin errores.
- `docker compose up -d` levanta Postgres.
- CLAUDE.md existe y describe el flujo de trabajo por pasos.
```

---

## PASO 1 — Especificación funcional y ADRs (spec-first)

```
Antes de implementar funcionalidades, escribe la especificación en /docs:

1. /docs/spec/funcional.md — Casos de uso completos con criterios de aceptación Given/When/Then:
   - Gestión de proyectos (crear, duplicar, archivar, calendario laboral por proyecto: días hábiles, feriados, horas/día).
   - Tareas con jerarquía ilimitada (WBS). Tareas resumen con fechas y % avance derivados (ponderación por duración o esfuerzo, configurable).
   - Campos de tarea: wbsCode, name, description, anchorDate, startDate, endDate, durationDays, effortHours, progressPct, priority, status, color, isMilestone, isSummary, notes.
   - Dependencias FS/SS/FF/SF con lag/lead en días hábiles. Detección de ciclos (el mensaje indica el ciclo por códigos WBS). Reprogramación automática de sucesoras.
   - Casos que la v1 omitía: arrastrar una tarea con predecesoras (actualiza anchorDate), quitar una dependencia (vuelve al ancla), intentar dependencia hacia/desde resumen (rechazada), reindentar con dependencias existentes.
   - Recursos: personas, equipos, materiales. Tarifa (UF o CLP), capacidad (h/día), calendario propio. Asignación con % dedicación. Sobreasignación.
   - Línea base: snapshot y comparación plan vs. real.
   - Ruta crítica (CPM: forward/backward pass, holgura total y libre).
   - Vista Gantt + vista tabla + vista de carga de recursos.
   - Exportación Excel/PDF/PNG; importación Excel/CSV y MS Project XML.
   - Usuarios, roles por proyecto (admin, editor, lector), audit log, undo/redo.

2. /docs/spec/modelo-datos.md — ER en Mermaid y diccionario de datos. Entidades: Project, Calendar, Holiday, Task, Dependency, Resource, Assignment, Baseline, BaselineTask, User, ProjectMember, AuditLog, Comment, ShareLink.

3. /docs/spec/arquitectura.md + /docs/adr/ADR-001…010.md — Diagrama de componentes (Mermaid) y una ADR por cada fila de la tabla "Decisiones ya tomadas" (contexto, decisión, consecuencias, alternativas descartadas).

4. /docs/spec/plan-de-pasos.md — Matriz paso ↔ casos de uso (actualiza la escrita en el Paso 0).

Criterios de aceptación:
- Los documentos usan exactamente los mismos nombres de entidades y campos.
- Cada caso de uso tiene al menos un criterio Given/When/Then.
- Cada ADR tiene contexto, decisión y consecuencias verificables.
```

---

## PASO 2 — Engine: calendario, WBS y scheduling

```
Implementa en /packages/engine (TypeScript puro, sin React ni Prisma):

1. calendar.ts: isWorkingDay, addWorkingDays, workingDaysBetween. Índice precomputado fecha → ordinal de día hábil para que las operaciones sean O(1) dentro del rango del proyecto.
2. wbs.ts: renumber(tasks), indent/outdent/move que devuelven la lista reordenada con códigos nuevos y marcan isSummary.
3. schedule.ts: scheduleProject(tasks, dependencies, calendar): aplica FS/SS/FF/SF + lag, respeta anchorDate, propaga en orden topológico, hace rollup de fechas y avance en resúmenes; devuelve solo las tareas que cambiaron.
4. cycles.ts: detectCycle(dependencies) → devuelve el ciclo como lista ordenada de ids/códigos WBS.
5. Tests Vitest con cobertura ≥ 90%. Casos borde: tarea que cruza fin de semana, feriado en el inicio, lag negativo, hito, cadena de 50 tareas, ciclo A→B→C→A, quitar dependencia vuelve al ancla, reindentar renumera todo el proyecto.

Criterios de aceptación:
- Cobertura ≥ 90% en packages/engine.
- scheduleProject con 1.000 tareas y 1.500 dependencias tarda < 50 ms en Vitest (test de rendimiento incluido).
```

---

## PASO 3 — Engine: ruta crítica, carga de recursos, varianza y layout

```
Amplía /packages/engine:

1. cpm.ts: forward/backward pass, ES/EF/LS/LF, holgura total y libre, isCritical.
2. resources.ts: resourceLoad(assignments, tasks, calendar) → carga por recurso por día con flag de sobreasignación, horas y costo (horas = duración × horas/día × % dedicación; costo = horas × tarifa).
3. baseline.ts: variance(tasks, baselineTasks) (desviación inicio/fin en días, delta de avance) y expectedProgressAt(statusDate).
4. layout.ts: modelo de geometría del Gantt: escalas día/semana/mes/trimestre, coordenadas de barras, corchetes de resumen, rombos de hito, rutas ortogonales de flechas. Sin dependencias de DOM.

Criterios de aceptación:
- Cobertura ≥ 90% mantenida.
- Tests de CPM contra un ejemplo con holguras conocidas.
- Snapshot tests del layout para las cuatro escalas.
```

---

## PASO 4 — Datos y autenticación mínima

```
1. prisma/schema.prisma completo según /docs/spec/modelo-datos.md. Fechas de plan con @db.Date. Índices por projectId y por (projectId, parentId, orderIndex). Migración inicial.
2. Auth.js con proveedor de credenciales (bcrypt). middleware.ts protege /(app) y /api salvo /health y /api/auth. Helper getSessionUser().
3. src/lib/audit.ts: withAudit(userId, entity, before, after).
4. prisma/seed.ts: usuario admin@ganttpro.local, proyecto realista (≈40 tareas en 3 niveles, 6 recursos, 25 dependencias mixtas, 2 hitos, feriados chilenos 2026). prisma/seed-perf.ts con 1.000 tareas.
5. Scripts db:migrate, db:seed, db:seed:perf, db:reset.

Criterios de aceptación:
- db:migrate y db:seed funcionan desde cero sobre Docker.
- Playwright: login correcto, login incorrecto, ruta protegida redirige a /login.
```

---

## PASO 5 — API

```
Route Handlers en src/app/api con Zod compartido en src/lib/schemas y envolvente { data } | { error }:

1. CRUD de proyectos, tareas, dependencias, recursos, asignaciones, baselines. GET /api/projects/:id/full devuelve el proyecto completo (tareas, dependencias, recursos, asignaciones, calendario) en una sola respuesta para la carga inicial del cliente.
2. PATCH /api/tasks/:id ejecuta el engine en el servidor y devuelve { task, affected: Task[] }.
3. POST /api/projects/:id/tasks/bulk (para undo/redo). POST /api/tasks/:id/move (reindentar/reordenar → devuelve todas las tareas con WBS recalculado).
4. GET /api/projects/:id/changes?since=<cursor> sobre AuditLog.
5. Toda mutación pasa por withAudit y verifica pertenencia al proyecto.
6. src/lib/api-client.ts tipado para el cliente.

Criterios de aceptación (Vitest de integración contra ganttpro_test, invocando los handlers directamente):
- Crear tarea → crear dependencia → mover predecesora → la sucesora se movió.
- Crear ciclo → 422 con código CYCLE y el ciclo en details. Sin sesión → 401 UNAUTHORIZED.
- Reindentar → códigos WBS correctos en todo el proyecto.
- Usuario sin acceso al proyecto → 403.
```

---

## PASO 6 — UI base: proyectos, tabla WBS, recursos

```
Interfaz con shadcn/ui, en español, mínimo 1280px para edición.

1. Layout con sidebar (Proyectos, Recursos, Configuración) y header con proyecto activo, selector de vista (Tabla / Gantt / Recursos) y botones Exportar/Importar deshabilitados hasta el Paso 9.
2. Página de proyectos: cards (nombre, fechas, % avance, nº tareas, estado), crear/editar/duplicar/archivar.
3. Store Zustand único con historial de comandos (Ctrl+Z / Ctrl+Y) sincronizado con TanStack Query. Cada comando guarda el snapshot previo de lo que toca; el inverso se persiste vía bulk.
4. Vista Tabla con TanStack Table: WBS, Nombre (indentación + expandir/colapsar), Inicio, Fin, Duración, % Avance, Recursos, Predecesoras ("3FS+2d; 5SS"), Estado. Edición inline con Enter/Tab, navegación por teclado, Tab/Shift+Tab indentar, mover arriba/abajo, eliminar con confirmación. Resaltado de 1 s en filas afectadas devueltas por la API.
5. Panel lateral de detalle (sheet) con todos los campos, editor de dependencias (muestra el ciclo devuelto por el engine), asignaciones con % dedicación, notas markdown.
6. Página de recursos: CRUD con tarifa UF, capacidad, calendario; asignaciones por recurso.

Criterios de aceptación:
- Estructura completa de un proyecto creable solo con teclado.
- Test unitario del store: undo/redo sobre 20 operaciones consecutivas.
- Playwright: crear proyecto → 3 tareas → indentar 2 → WBS 1, 1.1, 1.2 y rollup en la tarea 1.
- Sin errores de consola ni warnings de hidratación (assert en Playwright).
```

---

## PASO 7 — Gantt interactivo

```
1. Split view redimensionable: tabla WBS reducida a la izquierda, línea de tiempo a la derecha, scroll vertical sincronizado.
2. Escalas día/semana/mes/trimestre, zoom Ctrl+rueda, "Ajustar al proyecto", cabecera doble, fines de semana y feriados sombreados, línea "Hoy".
3. Barras según layout.ts: normal con relleno de avance y etiqueta; resumen como corchete; hito como rombo; ruta crítica en rojo (toggle); baseline fantasma (toggle); color por tarea/recurso/estado.
4. Interacciones con snap a día hábil: arrastrar barra (actualiza anchorDate y reprograma), borde derecho (duración), handle interior (% avance), conector → otra barra (crea dependencia, tipo inferido, con preview), clic en flecha (popover tipo/lag/eliminar), doble clic (detalle). Todo mediante comandos del store del Paso 6.
5. Flechas ortogonales con codos, resaltado al hover.
6. Virtualización vertical.

Criterios de aceptación:
- Playwright: arrastrar barra 3 días → sucesora FS se mueve 3 días; crear dependencia por drag → aparece la flecha y la columna Predecesoras.
- Rendimiento con seed-perf (1.000 tareas): render inicial < 1,5 s; drag < 16 ms/frame promedio medido con performance.now(). Reporta los números.
- Test de consistencia: 50 operaciones aleatorias sobre el store → tabla y Gantt derivan del mismo estado.
```

---

## PASO 8 — Avance, línea base, carga de recursos, dashboard y auditoría

```
1. Fecha de estado configurable; indicador de tareas atrasadas; actualización masiva "marcar avance según fecha de estado"; campos avance real vs. planificado y días de desviación.
2. Hasta 5 baselines nombradas; selector de baseline visible en el Gantt; tabla comparativa con varianza.
3. Vista de recursos: histograma (Recharts) diario/semanal por recurso con línea de capacidad y sobreasignación en rojo; clic → tareas que generan la carga.
4. Nivelación simple en el engine (level.ts): propone retrasar tareas no críticas para eliminar sobreasignación; nunca mueve críticas ni crea ciclos; la UI muestra la propuesta antes de aplicar.
5. Dashboard: % avance global, tareas atrasadas, hitos próximos (15 días), costo planificado vs. consumido (UF × horas), fin estimado vs. baseline, curva S.
6. Costo en UF con valor ingresado en Configuración; adaptador UfProvider preparado para API externa (sin implementar).
7. Vista de auditoría filtrable por tarea/usuario/fecha.

Criterios de aceptación:
- Tests del engine para varianza y nivelación.
- Playwright: guardar baseline → mover 2 tareas → tabla comparativa muestra la variación correcta.
```

---

## PASO 9 — Exportación e importación

```
1. Excel (exceljs): hojas Tareas (indentación, resúmenes en negrita, outline por jerarquía, % y fechas dd-mm-yyyy, encabezado congelado, autofiltro), Gantt (celdas por día o semana con relleno según avance, hitos ◆, fines de semana sombreados), Recursos, Dependencias, Resumen. Debe abrir sin advertencias en Excel para Windows.
2. PDF: ruta /print/gantt?projectId&opts que renderiza páginas explícitas (tabla WBS repetida a la izquierda, "Página X de Y", encabezado con proyecto, fecha de estado y logo opcional, pie con fecha de generación) usando el mismo modelo de layout; Puppeteer genera el PDF. Diálogo de opciones: orientación, tamaño A4/A3/Carta, rango, escala, columnas, ruta crítica, baseline, leyenda. Texto seleccionable.
3. PNG del Gantt visible.
4. Importación Excel/CSV con plantilla descargable y previsualización con errores por fila. Importación MS Project XML (mspdi) con fixtures/msproject-sample.xml.

Criterios de aceptación:
- Test exporta el seed a Excel y lo relee verificando filas y formatos.
- Test genera el PDF del seed y verifica nº de páginas y que "1.1" es extraíble (pdf-parse).
- Round-trip: importar la plantilla exportada produce estructura idéntica.
- Importar el XML de ejemplo crea el proyecto sin pérdida de dependencias.
```

---

## PASO 10 — Roles, colaboración y pulido

```
1. Roles por proyecto (ProjectMember: admin, editor, lector) aplicados en middleware, API y UI. Google como proveedor opcional.
2. Compartir por enlace de solo lectura (ShareLink con token revocable).
3. Colaboración: polling TanStack Query cada 2 s contra /changes; toast "X modificó la tarea Y"; última escritura gana.
4. Comentarios por tarea con @menciones y adaptador de correo (consola en dev; SMTP o Resend en prod).
5. Pulido: atajos documentados (panel "?"), modo oscuro, estados vacíos, skeletons, errores accionables, ARIA y contraste AA, navegación por teclado en el Gantt, página de configuración (calendario, feriados de Chile por año, valor UF, formato de fechas, moneda UF/CLP).

Criterios de aceptación:
- Playwright: lector no puede editar (UI deshabilitada y API 403).
- Dos contextos de Playwright editan el mismo proyecto y ambos ven el cambio del otro en < 3 s.
- axe sin violaciones críticas en Tabla, Gantt y Recursos.
```

---

## PASO 11 — QA final, documentación y entrega

```
1. Suite completa: unit, integración, e2e (Chromium + Firefox), lint, typecheck, build de producción sin warnings. Corrige todo lo que falle.
2. /docs/qa/checklist.md con 30 verificaciones manuales ordenadas por flujo; ejecútalas con el MCP de Playwright y guarda una captura por verificación en /docs/qa/evidencia/. Corrige las que fallen.
3. Lighthouse ≥ 90 en Performance y Accessibility en el Gantt con el seed de 40 tareas. Reporta los números.
4. Seguridad: validación de entradas en toda la API, rate limiting básico, headers de seguridad, tests de autorización cruzada entre proyectos.
5. Documentación: README.md (qué es, capturas, instalación en Windows paso a paso, comandos, despliegue con Dockerfile multi-stage con Chromium + docker-compose.prod.yml), /docs/manual-usuario.md, CHANGELOG.md con los 12 pasos, /docs/backlog.md, CLAUDE.md final.
6. Entrega: tag v1.0.0 y tabla final: funcionalidad, estado (completa / parcial / no implementada), archivos principales, test que la cubre.

Criterios de aceptación:
- `npm run build` sin warnings.
- 100% de la suite verde y checklist sin fallos abiertos.
- Ninguna fila "parcial" sin explicación y sin tarea registrada en /docs/backlog.md.
```

---

## Cambios respecto a la v1

- 9 pasos → 12. El Paso 2 original (schema + engine + API + seed) se reparte en los Pasos 2, 3, 4 y 5.
- Autenticación mínima adelantada al Paso 4 para que el AuditLog registre "quién" desde el primer endpoint.
- Eliminado el fallback SQLite.
- Semánticas de dominio fijadas: `anchorDate`, esfuerzo informativo, sin dependencias sobre resúmenes, fechas date-only.
- Render SVG, PDF con Puppeteer y colaboración por polling decididos ahora.
- Añadidos: CI, seed-perf, endpoint bulk (undo), endpoint changes, envolvente de API con códigos de error, test de rendimiento del engine, modelo de layout compartido.
- `Role` → `ProjectMember` (rol por proyecto).

---

## Extensiones sugeridas para una v2 (fuera de alcance)

| Funcionalidad                                            | Valor                           |
| -------------------------------------------------------- | ------------------------------- |
| Valor UF diario desde API (mindicador.cl)                | Costos siempre actualizados     |
| Portafolio multi-proyecto con recursos compartidos       | Gestión de capacidad completa   |
| SSE en lugar de polling                                  | Colaboración más reactiva       |
| Sincronización con Jira / Azure DevOps / GitHub Issues   | Une planificación con ejecución |
| Plantillas de proyecto                                   | Arranque en minutos             |
| Asistente IA: WBS desde descripción, estimación, riesgos | Diferenciador                   |
| App móvil de solo lectura (Expo)                         | Seguimiento desde terreno       |
| Integración con Google Calendar / Outlook para hitos     | Visibilidad del equipo          |

---

## PASO 12 — Eliminar proyectos (agregado el 2026-09-08 a pedido del usuario)

```
1. Modelo: `ProjectDeletion` (id, projectId, projectName, deletedById, deletedAt, taskCount, dependencyCount, resourceCount) con migración; el registro sobrevive al proyecto porque el AuditLog se borra en cascada.
2. Servicio: `deleteProject(projectId, userId)` cuenta tareas, dependencias y recursos, borra el proyecto y escribe `ProjectDeletion` en una sola transacción.
3. API: `DELETE /api/projects/:id` exige rol ADMIN (ya lo hace) y devuelve los conteos borrados; funciona también sobre proyectos archivados.
4. Interfaz: en la tarjeta del proyecto, acción Eliminar (solo administrador) que abre un diálogo con lo que se va a borrar, un enlace para descargar antes el libro Excel y un campo donde hay que escribir el nombre exacto para habilitar el botón.
5. Tests: integración (borra en cascada, deja el registro, 403 para editor y lector, funciona archivado) y e2e (crear proyecto → eliminarlo escribiendo el nombre → desaparece del listado y su enlace compartido deja de resolver).

Criterios de aceptación:
- El proyecto y todo lo suyo desaparecen; `GET /api/projects/:id` responde 403.
- Queda una fila en `ProjectDeletion` con nombre, usuario, fecha y conteos.
- El botón Eliminar sigue deshabilitado mientras el nombre escrito no coincide exactamente.
- Un editor recibe 403 y el proyecto sigue existiendo.
```
