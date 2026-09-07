# Prompt multipasos para Claude Code — Aplicación de Cartas Gantt

> **Cómo usarlo:** pega el **Paso 0** al iniciar la sesión en Claude Code. Luego pega cada paso siguiente **solo cuando el anterior esté aceptado** (criterios de aceptación cumplidos). No mezcles pasos: cada uno es un `commit` cerrado con QA.

---

## PASO 0 — Contexto, reglas y CLAUDE.md

```
Vas a construir "GanttPro", una aplicación web para planificar proyectos con cartas Gantt.
Trabajaremos en pasos numerados. En cada paso:
1. Antes de escribir código, describe brevemente el enfoque y la lista de archivos que crearás o modificarás.
2. Implementa completo (sin TODOs ni placeholders).
3. Ejecuta lint, typecheck y tests; corrige hasta que todo pase.
4. Termina con un resumen: qué se hizo, cómo probarlo manualmente, y qué falta para el siguiente paso.
No avances al siguiente paso hasta que yo lo apruebe.

Stack (no cambiar sin consultarme):
- Next.js 15 (App Router) + TypeScript estricto + Tailwind + shadcn/ui
- Prisma ORM + PostgreSQL (dev con Docker Compose; fallback SQLite para desarrollo rápido)
- Zustand para estado del Gantt; TanStack Query para datos remotos
- Zod para validación en ambos lados
- Vitest (unit) + Playwright (e2e)
- Exportación: exceljs (Excel), @react-pdf/renderer o Puppeteer (PDF)
- Entorno: Windows 11 + VS Code + PowerShell. Todos los scripts npm deben funcionar en PowerShell (usa cross-env, rimraf, etc.).

Idioma: toda la UI, mensajes, comentarios y documentación en español (Chile). Nombres de código (variables, tablas, funciones, rutas) en inglés.

Primera tarea de este paso:
- Crea CLAUDE.md en la raíz con: descripción del proyecto, stack, convenciones de código, comandos (dev, build, test, lint, db:migrate, db:seed), estructura de carpetas y la regla de "un paso = un commit con tests".
- Inicializa el repo, .gitignore, .env.example, docker-compose.yml (Postgres), y el esqueleto de Next.js con una página /health que responda OK.
- Configura ESLint, Prettier, Husky (pre-commit: lint + typecheck).

Criterios de aceptación:
- `npm run dev` levanta la app y /health responde.
- `npm run lint` y `npm run typecheck` pasan sin errores.
- CLAUDE.md existe y describe el flujo de trabajo por pasos.
```

---

## PASO 1 — Especificación funcional y arquitectura (spec-first)

```
Antes de implementar funcionalidades, escribe la especificación en /docs:

1. /docs/spec/funcional.md — Casos de uso completos con criterios de aceptación en formato Given/When/Then:
   - Gestión de proyectos (crear, duplicar, archivar, calendario laboral por proyecto: días hábiles, feriados, horas/día).
   - Tareas con jerarquía ilimitada (WBS: tarea → subtarea → sub-subtarea). Tareas resumen calculan fecha inicio/fin y % avance ponderado por duración o esfuerzo (configurable).
   - Campos de tarea: código WBS (1, 1.1, 1.1.2…), nombre, descripción, inicio, fin, duración (días hábiles), esfuerzo (horas), % avance, prioridad, estado, color, hito (duración 0), notas.
   - Dependencias entre tareas: tipos FS, SS, FF, SF con lag/lead (+/- días). Detección de ciclos. Reprogramación automática de sucesoras (scheduling engine).
   - Recursos: personas, equipos, materiales. Tarifa (en UF o CLP), capacidad (h/día), calendario propio. Asignación a tareas con % dedicación. Detección de sobreasignación.
   - Línea base (baseline): guardar snapshot y comparar plan vs. real (variación de fechas y avance).
   - Ruta crítica (CPM: forward/backward pass, holgura total y libre).
   - Vista Gantt interactiva + vista tabla + vista de carga de recursos.
   - Exportación a Excel y PDF; importación desde Excel/CSV y MS Project XML.
   - Usuarios y roles (admin, editor, lector). Historial de cambios (audit log). Undo/redo.

2. /docs/spec/modelo-datos.md — Modelo entidad-relación (Mermaid) y diccionario de datos.

3. /docs/spec/arquitectura.md — Diagrama de componentes (Mermaid), decisiones de arquitectura (ADR) numeradas: por qué el scheduling engine vive en /packages/engine como módulo puro sin dependencias de UI ni DB (para testearlo unitariamente y reutilizarlo en el cliente), estrategia de renderizado del Gantt (SVG vs. Canvas — elige y justifica), estrategia de exportación PDF.

4. /docs/spec/plan-de-pasos.md — Mapea los Pasos 2 a 8 de este plan a los casos de uso, para que la spec sea la fuente de verdad.

Criterios de aceptación:
- Los cuatro documentos existen y son consistentes entre sí (mismos nombres de entidades y campos).
- Cada caso de uso tiene al menos un criterio Given/When/Then.
- Las decisiones de arquitectura están justificadas y son verificables.
```

---

## PASO 2 — Modelo de datos, motor de planificación y API

```
Implementa la capa de datos y el motor de cálculo según /docs/spec.

1. Prisma schema con: Project, Calendar, Holiday, Task (self-relation parentId, orderIndex, wbsCode), Dependency (predecessorId, successorId, type, lagDays), Resource, Assignment (taskId, resourceId, allocationPct), Baseline, BaselineTask, User, Role, AuditLog. Índices para consultas por proyecto y por jerarquía.

2. /packages/engine (TypeScript puro, sin React ni Prisma):
   - calculateWorkingDays(start, end, calendar) y addWorkingDays(date, days, calendar).
   - scheduleProject(tasks, dependencies, calendar): aplica restricciones FS/SS/FF/SF + lag, propaga cambios a sucesoras, recalcula tareas resumen (rollup de fechas y avance ponderado).
   - criticalPath(tasks, dependencies): forward/backward pass, early/late start/finish, holgura total y libre, marca isCritical.
   - detectCycle(dependencies) → lanza error descriptivo indicando el ciclo.
   - resourceLoad(assignments, tasks, calendar) → carga por recurso por día, con flag de sobreasignación.
   - Tests unitarios Vitest con cobertura ≥ 90% en el engine. Incluye casos borde: tarea que cruza fin de semana, feriado en el inicio, lag negativo, hito, cadena de 50 tareas, ciclo A→B→C→A.

3. API (Route Handlers en /app/api) con validación Zod y respuestas tipadas:
   - CRUD de proyectos, tareas (con reordenar y reindentar: mover una tarea bajo otro padre recalcula WBS), dependencias, recursos, asignaciones, baselines.
   - PATCH /tasks/:id que aplica el cambio y devuelve todas las tareas afectadas por el reschedule en una sola respuesta.
   - Todas las mutaciones registran AuditLog (quién, qué, antes/después).

4. Seed con un proyecto de ejemplo realista (≈40 tareas en 3 niveles, 6 recursos, 25 dependencias mixtas, 2 hitos, feriados chilenos 2026).

Criterios de aceptación:
- `npm run db:migrate` y `npm run db:seed` funcionan desde cero.
- Tests del engine pasan con cobertura ≥ 90%.
- Tests de integración de API (Vitest + supertest o fetch contra el servidor) para el flujo: crear tarea → crear dependencia → mover predecesora → verificar que la sucesora se movió.
- Reindentar una tarea reasigna correctamente los códigos WBS de todo el proyecto.
```

---

## PASO 3 — UI base: proyectos, tabla WBS, recursos

```
Construye la interfaz base con shadcn/ui, en español, responsive (mínimo 1280px para el Gantt, móvil solo para lectura).

1. Layout con sidebar: Proyectos, Recursos, Configuración. Header con nombre del proyecto activo, selector de vista (Tabla / Gantt / Recursos) y botones Exportar e Importar (deshabilitados hasta el Paso 6).

2. Página de proyectos: lista con cards (nombre, fechas, % avance, nº tareas, estado), crear/editar/duplicar/archivar.

3. Vista Tabla (grid editable estilo hoja de cálculo) usando TanStack Table:
   - Columnas: WBS, Nombre (con indentación por nivel y toggle expandir/colapsar), Inicio, Fin, Duración, % Avance, Recursos asignados, Predecesoras (formato "3FS+2d; 5SS"), Estado.
   - Edición inline con Enter/Tab, navegación con teclado, undo/redo (Ctrl+Z / Ctrl+Y) con historial en Zustand.
   - Acciones: agregar tarea, subtarea, hito; indentar/desindentar (Tab / Shift+Tab); mover arriba/abajo; eliminar con confirmación.
   - Al editar una fecha o dependencia, refleja de inmediato las tareas afectadas devueltas por la API (resaltado de 1 segundo en filas que cambiaron).

4. Página de recursos: CRUD con tarifa en UF, capacidad, calendario. Vista de asignaciones por recurso.

5. Panel lateral de detalle de tarea (sheet): todos los campos, editor de dependencias con validación de ciclos (mensaje claro), asignación de recursos con % dedicación, notas markdown.

Criterios de aceptación:
- Se puede crear la estructura completa de un proyecto solo con teclado.
- Undo/redo funciona sobre al menos 20 operaciones consecutivas.
- Playwright e2e: crear proyecto → 3 tareas → indentar 2 como subtareas → verificar WBS 1, 1.1, 1.2 y que la tarea 1 muestre fechas rollup.
- Sin errores de consola ni warnings de hidratación.
```

---

## PASO 4 — Gantt interactivo

```
Implementa la vista Gantt según la decisión de renderizado de /docs/spec/arquitectura.md.

1. Layout: panel izquierdo con la tabla WBS (columnas reducidas, sincronizada en scroll vertical) + panel derecho con la línea de tiempo. Divisor redimensionable.

2. Escala de tiempo: día / semana / mes / trimestre, con zoom (Ctrl+rueda) y botón "Ajustar al proyecto". Cabecera de dos niveles (mes / día, o trimestre / semana). Fines de semana y feriados sombreados. Línea vertical "Hoy".

3. Barras:
   - Tarea normal: barra con relleno proporcional al % avance y etiqueta del nombre/recursos a la derecha.
   - Tarea resumen: barra tipo corchete negro.
   - Hito: rombo.
   - Ruta crítica en rojo (toggle).
   - Baseline como barra fantasma gris debajo de la barra actual (toggle).
   - Color por tarea, por recurso o por estado (selector).

4. Interacciones (drag & drop con precisión de día hábil, snap a la grilla):
   - Arrastrar barra → mueve la tarea (respeta calendario, reprograma sucesoras).
   - Arrastrar borde derecho → cambia duración.
   - Arrastrar el handle interior → cambia % avance.
   - Arrastrar desde el conector (punto al inicio/fin de una barra) hasta otra barra → crea dependencia; el tipo se infiere del punto origen/destino (fin→inicio = FS, etc.). Muestra preview mientras se arrastra.
   - Clic en una flecha de dependencia → popover para cambiar tipo/lag o eliminar.
   - Doble clic en barra → abre panel de detalle.
   - Todas las mutaciones pasan por el mismo store con undo/redo del Paso 3.

5. Flechas de dependencia: enrutamiento ortogonal (codos), evitando cruzar barras cuando sea posible; punta de flecha en la sucesora; resaltado al hover de la tarea.

6. Rendimiento: el Gantt debe manejar 1.000 tareas con scroll fluido (virtualización vertical). Mide y reporta el tiempo de render inicial y el de un drag.

Criterios de aceptación:
- Playwright e2e: arrastrar una barra 3 días → verificar que la sucesora FS se movió 3 días; crear dependencia por drag → verificar que aparece la flecha y el campo Predecesoras en la tabla.
- Test de rendimiento con seed de 1.000 tareas: render inicial < 1,5 s, drag sin caídas visibles de frames (< 16 ms por frame en promedio, medido con performance.now()).
- El Gantt y la tabla siempre muestran los mismos datos (sin desincronización tras 50 operaciones aleatorias — escribe un test que lo verifique).
```

---

## PASO 5 — Avance, línea base, carga de recursos y reportes

```
1. Seguimiento de avance:
   - Fecha de estado (status date) configurable; indicador visual de tareas atrasadas (deberían tener más avance según la fecha de estado).
   - Actualización masiva: "marcar avance según fecha de estado" para todas las tareas seleccionadas.
   - Campos calculados: avance real vs. planificado, días de desviación.

2. Línea base:
   - Guardar hasta 5 baselines nombradas con fecha; elegir cuál se muestra en el Gantt.
   - Tabla comparativa: tarea, inicio/fin baseline, inicio/fin actual, variación en días, variación de avance.

3. Vista de recursos (histograma):
   - Gráfico de carga diaria/semanal por recurso, línea de capacidad, zonas de sobreasignación en rojo.
   - Clic en una barra → lista de tareas que generan esa carga.
   - Función "nivelar" simple: sugiere retrasar tareas no críticas para eliminar sobreasignación (muestra propuesta antes de aplicar).

4. Dashboard del proyecto:
   - KPIs: % avance global, tareas atrasadas, hitos próximos (15 días), costo planificado vs. consumido (tarifa UF × horas), fecha fin estimada vs. baseline.
   - Curva S (avance planificado vs. real acumulado) con Recharts.

5. Auditoría: vista de historial de cambios filtrable por tarea/usuario/fecha.

Criterios de aceptación:
- Tests del engine para varianza vs. baseline y para el algoritmo de nivelación (no debe mover tareas críticas ni crear ciclos).
- Playwright: guardar baseline → mover 2 tareas → verificar que la tabla comparativa muestra la variación correcta.
- El costo en UF se calcula con el valor de UF ingresado manualmente en Configuración (dejar preparado un adaptador para consultar el valor diario desde una API externa, sin implementarlo aún).
```

---

## PASO 6 — Exportación a Excel y PDF

```
1. Exportación a Excel (exceljs), botón Exportar → Excel:
   - Hoja "Tareas": todas las columnas de la tabla, con indentación por nivel, filas resumen en negrita, agrupación de filas (outline) por jerarquía, % avance con formato de porcentaje, fechas con formato dd-mm-yyyy, encabezado congelado, autofiltro.
   - Hoja "Gantt": grilla de celdas por día (o semana según rango) donde cada tarea pinta sus celdas con relleno de color según avance (planificado en color claro, avanzado en color oscuro, hitos con símbolo ◆). Cabecera con meses y días, fines de semana sombreados.
   - Hoja "Recursos": asignaciones y horas por recurso.
   - Hoja "Dependencias": lista completa.
   - Hoja "Resumen": KPIs del dashboard.
   - El archivo debe abrirse sin errores ni advertencias de reparación en Excel para Windows.

2. Exportación a PDF, botón Exportar → PDF, con diálogo de opciones:
   - Orientación (horizontal por defecto), tamaño (A4/A3/Carta), rango de fechas, escala de tiempo, incluir/excluir columnas de la tabla, incluir ruta crítica/baseline, incluir leyenda.
   - Paginación inteligente: si el Gantt no cabe, divide en páginas horizontales y verticales con la tabla WBS repetida a la izquierda de cada página y numeración "Página X de Y".
   - Encabezado con nombre del proyecto, fecha de estado, logo opcional (configurable). Pie con fecha de generación.
   - La calidad debe ser vectorial (texto seleccionable), no captura rasterizada.

3. Exportación a imagen PNG del Gantt visible (bonus, para pegar en presentaciones).

4. Importación:
   - Desde Excel/CSV con plantilla descargable (columnas: WBS, Nombre, Inicio, Fin, Duración, Predecesoras, Recursos, % Avance). Vista previa con validación de errores fila por fila antes de confirmar.
   - Desde MS Project XML (mspdi): tareas, jerarquía, dependencias, recursos y asignaciones.

Criterios de aceptación:
- Test automatizado que exporta el proyecto seed a Excel y lo vuelve a leer con exceljs verificando nº de filas, fórmulas y formatos.
- Test que genera el PDF del seed y verifica nº de páginas y que el texto "1.1" es extraíble (pdf-parse).
- Importar la plantilla exportada del mismo proyecto debe producir una estructura idéntica (round-trip test).
- Importar un XML de MS Project de ejemplo (genera uno en /fixtures) crea el proyecto sin pérdida de dependencias.
```

---

## PASO 7 — Usuarios, roles, colaboración y pulido

```
1. Autenticación con Auth.js (credenciales + Google opcional). Roles por proyecto: admin, editor, lector. Middleware que protege rutas y API.

2. Compartir proyecto por enlace de solo lectura (token revocable).

3. Colaboración básica: si dos editores tienen el mismo proyecto abierto, los cambios del otro aparecen en menos de 3 s (polling con TanStack Query o SSE — elige y justifica). Manejo de conflicto: última escritura gana + notificación toast "X modificó la tarea Y".

4. Comentarios por tarea con menciones @usuario y notificación por correo (adaptador de correo con Resend o SMTP; en dev, escribir a consola).

5. Pulido de producto:
   - Atajos de teclado documentados (panel con "?").
   - Modo oscuro.
   - Estados vacíos, loading skeletons, mensajes de error accionables.
   - Accesibilidad: navegación con teclado en el Gantt, roles ARIA, contraste AA.
   - Página de configuración: calendario laboral, feriados (con carga de feriados de Chile por año), valor UF, formato de fechas, moneda de visualización (UF/CLP).

Criterios de aceptación:
- Playwright: lector no puede editar (UI deshabilitada y API responde 403).
- Test de concurrencia: dos contextos de Playwright editan el mismo proyecto y ambos ven el cambio del otro.
- Auditoría de accesibilidad con axe en las 3 vistas principales sin violaciones críticas.
```

---

## PASO 8 — QA final, documentación y entrega

```
1. Ejecuta toda la suite: unit, integración, e2e (Chromium + Firefox), lint, typecheck, build de producción. Corrige todo lo que falle.

2. Prueba de humo manual guiada: escribe /docs/qa/checklist.md con 30 verificaciones manuales ordenadas por flujo (crear proyecto → planificar → asignar → hacer seguimiento → exportar) y ejecútalas tú mismo usando el MCP de Playwright, adjuntando en /docs/qa/evidencia/ una captura por verificación. Reporta las que fallen y corrígelas.

3. Rendimiento: Lighthouse ≥ 90 en Performance y Accessibility en la página del Gantt con el seed de 40 tareas. Reporta los números.

4. Seguridad: revisa validación de entradas en toda la API, rate limiting básico, headers de seguridad, y que ningún endpoint exponga datos de otros proyectos (escribe tests de autorización cruzada).

5. Documentación:
   - README.md: qué es, capturas, instalación en Windows paso a paso (Node, Docker Desktop, variables de entorno), comandos, despliegue (Dockerfile multi-stage + docker-compose de producción, y notas para Vercel + Neon/Supabase).
   - /docs/manual-usuario.md en español con capturas de cada función.
   - CHANGELOG.md con el resumen de los 8 pasos.
   - Actualiza CLAUDE.md con el estado final y las convenciones para futuras extensiones.

6. Entrega: tag v1.0.0, y una tabla final con: funcionalidad, estado (completa / parcial / no implementada), archivo(s) principal(es), test que la cubre.

Criterios de aceptación:
- `npm run build` sin warnings.
- 100% de la suite verde y checklist manual sin fallos abiertos.
- La tabla de entrega no tiene filas "parcial" sin una explicación y una tarea pendiente registrada en /docs/backlog.md.
```

---

## Extensiones sugeridas para una v2 (no incluir en el prompt inicial)

| Funcionalidad | Valor |
|---|---|
| Integración con valor UF diario (API mindicador.cl) | Costos siempre actualizados |
| Multi-proyecto: vista portafolio y recursos compartidos entre proyectos | Gestión de capacidad de Licklider completa |
| Sincronización bidireccional con Jira / Azure DevOps / GitHub Issues | Une planificación con ejecución |
| Plantillas de proyecto (ej. "Implementación SaaS", "App móvil") | Arranque en minutos |
| Asistente IA: generar WBS desde una descripción, estimar duraciones, detectar riesgos | Diferenciador de una fábrica de software IA |
| App móvil de solo lectura (Expo) | Seguimiento desde terreno |
| Integración con Google Calendar / Outlook para hitos | Visibilidad del equipo |
