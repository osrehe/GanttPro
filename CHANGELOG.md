# Registro de cambios

Todos los cambios relevantes de GanttPro. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[versionado semántico](https://semver.org/lang/es/).

## [1.3.0] — 2026-09-09

### Añadido

**Ancho de columnas ajustable (UC-40).** En la vista Tabla y en el panel izquierdo del Gantt, el
borde derecho de cada encabezado es un tirador: arrastrarlo cambia el ancho de esa columna y un doble
clic lo devuelve al valor por omisión. Cada vista recuerda sus anchos en el navegador
(`ganttpro:column-widths:table` y `ganttpro:column-widths:gantt`) y los aplica a todos los proyectos.
En el Gantt el panel mide lo que suman sus columnas, así que el separador del borde derecho sigue
funcionando como divisor. Los anchos van al CSS como variables, de modo que arrastrar no vuelve a
dibujar las filas; las exportaciones conservan su propio diseño.

## [1.2.0] — 2026-09-08

### Cambiado

**Identidad visual.** Paleta morado y celeste en OKLCH, con el mismo matiz en el tema claro y en el
oscuro, tipografía Plus Jakarta Sans para la interfaz y JetBrains Mono para códigos y cifras. La
carta Gantt, los gráficos, la exportación PNG, la ruta de impresión y el libro Excel comparten esa
paleta: morado para el plan, celeste para lo terminado, rosa para la ruta crítica.

**Rendimiento.** Medido sobre el proyecto de 1.110 tareas contra el build de producción:

| Medición                                 | Antes    | Después |
| ---------------------------------------- | -------- | ------- |
| Tecla de navegación en la tabla          | 97 ms    | 7 ms    |
| Nodos del documento en la tabla          | 28.186   | 926     |
| Editar una duración de punta a punta     | 535 ms   | 120 ms  |
| Reprogramación que reescribe 1.110 filas | 2.504 ms | 507 ms  |
| JavaScript inicial del dashboard         | 295 kB   | 183 kB  |

La vista Tabla dibuja solo las filas visibles, la reprogramación escribe todas las tareas afectadas
en una sola sentencia, el sondeo de colaboración solo recarga el proyecto cuando el cambio ajeno
toca el plan, y Recharts y los diálogos de exportación e importación se cargan al abrirlos.

**Tabla de ancho fijo.** Cada columna tiene su ancho y las celdas ocupan una línea, con
desplazamiento horizontal cuando no caben: antes una fila con varios recursos ocupaba el triple que
las demás.

### Añadido

- Capturas de la documentación en `docs/capturas/`, regenerables con `npm run capturas` desde el
  proyecto de demostración.

### Corregido

- Las variables de fuente vivían en `<html>` y `next-themes` reescribe esa clase al aplicar el tema:
  la aplicación caía a la fuente por defecto del navegador al entrar a cualquier vista.
- Los gráficos, al cargarse bajo demanda, se montaban después del layout y su contenedor los medía
  en cero: la curva S salía en blanco.
- El sondeo de cambios recargaba el proyecto mientras alguien escribía en una celda y le borraba lo
  tecleado.
- Las barras de avance de las tarjetas no tenían nombre accesible y el listado de proyectos no
  declaraba título de página.

## [1.1.0] — 2026-09-08

### Añadido

**Eliminar proyectos (UC-39).** Un administrador del proyecto puede borrarlo definitivamente desde
su tarjeta. El diálogo enumera lo que se pierde (tareas, dependencias, recursos, líneas base,
comentarios, enlaces compartidos y el historial), ofrece descargar antes el libro Excel y exige
escribir el nombre exacto para habilitar el botón. El borrado ocurre en una transacción y deja una
fila en la tabla nueva `ProjectDeletion` con el nombre, quién lo borró, cuándo y cuántas tareas,
dependencias y recursos tenía; esa huella sobrevive porque el historial del proyecto se borra con él.
Archivar sigue siendo la vía reversible. `DELETE /api/projects/:id` funciona también sobre
proyectos archivados y devuelve esos conteos.

### Corregido

- El sondeo de cambios de otras personas recargaba el proyecto mientras alguien escribía en una
  celda y le borraba lo tecleado; ahora también se detiene mientras hay una celda en edición.
- Las barras de avance de las tarjetas no tenían nombre accesible y el listado de proyectos no
  declaraba título de página.

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
