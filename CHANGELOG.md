# Registro de cambios

Todos los cambios relevantes de GanttPro. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[versionado semántico](https://semver.org/lang/es/).

## [1.0.0] — 2026-09-07

Primera versión completa. Se construyó siguiendo un plan de doce pasos; cada paso cerró con sus
pruebas en verde y una etiqueta `paso-N` en el repositorio.

### Añadido

**Paso 0 — Bootstrap.** Repositorio con Next.js 15 (App Router, React 19), TypeScript estricto con
`noUncheckedIndexedAccess`, Tailwind v4 y shadcn/ui. Workspace `packages/engine` para el motor de
planificación, con una regla de ESLint que le prohíbe importar React, Next o Prisma. Prettier, Husky
con `lint-staged`, `docker-compose.yml` con PostgreSQL 16 y las bases `ganttpro` y `ganttpro_test`,
ruta `/health` y flujo de integración continua en GitHub Actions.

**Paso 1 — Especificación y decisiones.** `docs/spec/funcional.md` con 38 casos de uso en formato
Dado/Cuando/Entonces, el modelo de datos, la arquitectura y las decisiones ADR-001 a ADR-010, además
del plan de pasos con su matriz de casos de uso.

**Paso 2 — Motor: calendario, WBS y programación.** Calendario laboral con índice precomputado de
días hábiles, renumeración y movimientos de la estructura WBS, programación con los cuatro tipos de
dependencia y desfase en días hábiles, rollup de tareas resumen y detección de ciclos con el camino
que los produce.

**Paso 3 — Motor: ruta crítica, recursos y layout.** Método de la ruta crítica con holgura total y
libre, carga de recursos con detección de sobreasignación, costos en UF y pesos, comparación contra
línea base y avance esperado, y el modelo de geometría que comparten la pantalla, el PNG y el PDF.

**Paso 4 — Datos y autenticación.** Esquema de Prisma completo con su migración inicial, ingreso con
correo y contraseña mediante Auth.js, protección de rutas en el middleware, registro de auditoría
transaccional y datos de ejemplo: un proyecto de 46 tareas y otro sintético de 1.110 para medir
rendimiento.

**Paso 5 — API.** Route Handlers para proyectos, tareas, dependencias, recursos, asignaciones,
líneas base y cambios, con validación Zod compartida entre cliente y servidor, envolvente uniforme
de respuesta y códigos de error tipados. El servidor reprograma el proyecto en cada mutación y
devuelve todas las tareas afectadas.

**Paso 6 — Interfaz base.** Estructura de la aplicación, lista de proyectos, vista Tabla editable
por teclado con renumeración automática, panel de detalle, página de recursos y un historial de
deshacer y rehacer basado en comandos invertibles.

**Paso 7 — Carta Gantt interactiva.** Vista SVG con virtualización vertical, cuatro escalas de
tiempo, zoom y ajuste al proyecto, ruta crítica, línea base fantasma, y arrastre para mover tareas,
cambiar duraciones, ajustar el avance y crear dependencias desde los conectores.

**Paso 8 — Seguimiento.** Fecha de estado con avance esperado y detección de atraso, actualización
masiva de avance, líneas base con tabla comparativa, histograma de carga con propuesta de
nivelación, dashboard con indicadores y curva S, y vista de auditoría con filtros.

**Paso 9 — Exportación e importación.** Libro Excel de cinco hojas, PDF vectorial paginado generado
con Puppeteer sobre una ruta de impresión interna, PNG de la vista visible, e importación desde
plantilla Excel o CSV y desde XML de Microsoft Project, con previsualización y errores por fila
(ADR-011).

**Paso 10 — Roles, colaboración y pulido.** Roles por proyecto con administración de miembros,
enlaces de solo lectura revocables, colaboración con aviso de los cambios ajenos, comentarios con
menciones, ingreso con Google opcional, tema claro y oscuro, panel de atajos, navegación por teclado
en la carta Gantt y página de configuración con calendario, feriados, valor de la UF, moneda y
formato de fechas.

**Paso 11 — Calidad y entrega.** Límite de peticiones y cabeceras de seguridad (ADR-012), lista de
verificación de calidad con evidencia, imagen de Docker multi-stage con Chromium,
`docker-compose.prod.yml`, este registro de cambios, el manual de usuario, el backlog y la tabla de
entrega.

### Corregido

- La URL con la que el servidor abre su propia página de impresión ya no se deduce de las cabeceras
  `Host` ni `X-Forwarded-Host`, que las controla quien llama: usarlas permitía dirigir la impresión a
  un servidor ajeno y filtrar el token de impresión. Ahora se usa `PRINT_BASE_URL` o la interfaz de
  loopback del propio proceso.
- La vista pública de un enlace compartido dejó de entregar los datos de las personas del proyecto
  (nombres y correos de los miembros y de los recursos).
- El intervalo de consulta de cambios bajó de 2 a 1,5 segundos: con 2 segundos, y dos viajes al
  servidor por aviso, el criterio de "el otro ve el cambio en menos de 3 segundos" quedaba sin margen
  (ADR-010).
- La actualización masiva de tareas devuelve siempre las tareas editadas, además de las que la
  reprogramación movió.
- La comparación contra una línea base se calcula con las tareas vigentes del proyecto en vez de
  depender de la caché del cliente, que podía mostrar una comparación antigua.
- La vista Tabla declara la semántica de grilla sobre la tabla misma y los conectores de la carta
  Gantt quedaron fuera del árbol de accesibilidad: ambos producían violaciones graves.
- Los menús del encabezado se montan después de la hidratación, porque sus identificadores generados
  automáticamente discrepaban entre servidor y cliente.
- La exportación a Excel y la plantilla de importación comparten las mismas columnas, de modo que
  exportar e importar de vuelta no pierde información.

[1.0.0]: https://github.com/osrehe/GanttPro/releases/tag/v1.0.0
