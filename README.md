# GanttPro

Aplicación web para planificar y hacer seguimiento de proyectos con cartas Gantt. Está pensada para
quien arma el plan de un proyecto y lo mantiene al día: jefaturas de proyecto, oficinas de proyectos
y equipos que hoy llevan la planificación en una planilla o en Microsoft Project.

La interfaz, los mensajes y la documentación están en español (Chile). Los costos se expresan en UF
o en pesos y el calendario laboral trae los feriados de Chile.

## Qué hace

- **Estructura de trabajo (WBS)** jerárquica con renumeración automática, tareas resumen, hitos y
  edición completa por teclado.
- **Dependencias FS, SS, FF y SF** con desfase en días hábiles y reprogramación automática de las
  sucesoras; detección de ciclos con el camino que los produce.
- **Ruta crítica y holguras** (total y libre) calculadas sobre el plan real.
- **Recursos y costos**: tarifas en UF o pesos, dedicación por asignación, histograma de carga,
  detección de sobreasignación y propuesta de nivelación.
- **Líneas base y seguimiento**: hasta cinco líneas base por proyecto, fecha de estado, avance
  esperado, indicador de atraso y actualización masiva de avance.
- **Dashboard** con indicadores del proyecto, hitos próximos, costo planificado y consumido, y
  curva S.
- **Exportación** a Excel (cinco hojas, incluida una carta Gantt por celdas), a PDF vectorial
  paginado y a PNG de la vista visible.
- **Importación** desde una plantilla Excel o CSV y desde XML de Microsoft Project (MSPDI), con
  previsualización y errores por fila antes de escribir nada.
- **Roles por proyecto** (administrador, editor, lector), **enlaces de solo lectura** revocables y
  **colaboración** con aviso de los cambios de otras personas.
- **Comentarios por tarea** con menciones a los miembros del proyecto.
- **Historial de cambios** completo: toda modificación queda registrada con quién, cuándo y qué.

## Capturas

Las capturas se generan con la suite de verificación del Paso 11 y viven en `docs/qa/evidencia/`.

| Vista         | Captura                                                                |
| ------------- | ---------------------------------------------------------------------- |
| Tabla WBS     | [`qa-06-tabla-wbs.png`](docs/qa/evidencia/qa-06-tabla-wbs.png)         |
| Carta Gantt   | [`qa-12-gantt.png`](docs/qa/evidencia/qa-12-gantt.png)                 |
| Dashboard     | [`qa-19-dashboard.png`](docs/qa/evidencia/qa-19-dashboard.png)         |
| Configuración | [`qa-27-configuracion.png`](docs/qa/evidencia/qa-27-configuracion.png) |

## Requisitos

- Node.js 22 o superior.
- Docker Desktop, para PostgreSQL 16.
- Windows 11 con PowerShell. Los comandos funcionan igual en macOS y Linux.

## Instalación en Windows, paso a paso

1. **Instala Node.js 22** desde <https://nodejs.org> y comprueba la versión:

   ```powershell
   node --version
   ```

2. **Instala Docker Desktop** desde <https://www.docker.com/products/docker-desktop> y déjalo
   corriendo (el ícono de la ballena debe estar activo).

3. **Clona el repositorio e instala las dependencias.** La instalación descarga también el Chromium
   que usa la exportación a PDF, así que puede tardar algunos minutos.

   ```powershell
   git clone https://github.com/osrehe/GanttPro.git
   cd GanttPro
   npm install
   ```

4. **Crea tu archivo de configuración** a partir del ejemplo:

   ```powershell
   Copy-Item .env.example .env
   ```

5. **Revisa el puerto de la base de datos.** En muchas máquinas el 5432 ya está ocupado (Docker
   Desktop suele retenerlo). Si es tu caso, edita `.env` y cambia `POSTGRES_PORT` a 5433, y ajusta el
   mismo puerto dentro de `DATABASE_URL` y `DATABASE_URL_TEST`. Para saber si está ocupado:

   ```powershell
   Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
   ```

6. **Genera el secreto de sesión** y pégalo en `AUTH_SECRET` dentro de `.env`:

   ```powershell
   npx auth secret
   ```

7. **Levanta PostgreSQL.** El contenedor crea las bases `ganttpro` y `ganttpro_test`:

   ```powershell
   docker compose up -d
   ```

8. **Aplica las migraciones y carga los datos de ejemplo:**

   ```powershell
   npm run db:migrate
   npm run db:seed
   ```

9. **Arranca la aplicación:**

   ```powershell
   npm run dev
   ```

Abre <http://localhost:3000>. La verificación de salud está en <http://localhost:3000/health> y
responde `{ "status": "ok" }`.

### Usuarios de ejemplo

El seed crea un proyecto de demostración con 46 tareas y tres usuarios, todos con la contraseña
definida en `SEED_PASSWORD` (por defecto `GanttPro2026!`):

| Correo                  | Rol en el proyecto | Puede                                          |
| ----------------------- | ------------------ | ---------------------------------------------- |
| `admin@ganttpro.local`  | Administrador      | Todo, incluidos miembros y enlaces compartidos |
| `editor@ganttpro.local` | Editor             | Editar el plan, no administrar el proyecto     |
| `lector@ganttpro.local` | Lector             | Solo mirar y comentar lo que ya existe         |

## Comandos

| Comando                    | Qué hace                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| `npm run dev`              | Servidor de desarrollo con Turbopack en el puerto 3000           |
| `npm run build`            | Build de producción                                              |
| `npm run start`            | Sirve el build de producción                                     |
| `npm run lint`             | ESLint sobre todo el repositorio                                 |
| `npm run format`           | Prettier; `npm run format:check` solo verifica                   |
| `npm run typecheck`        | `tsc` de la aplicación y de `packages/engine`                    |
| `npm test`                 | Vitest completo: motor, web e integración                        |
| `npm run test:unit`        | Solo motor y web, sin base de datos                              |
| `npm run test:integration` | Route Handlers reales contra `ganttpro_test`                     |
| `npm run test:coverage`    | Cobertura del motor de planificación (umbral 90 %)               |
| `npm run test:e2e`         | Playwright sobre Chromium                                        |
| `npm run test:e2e:perf`    | Prueba de rendimiento del Gantt con 1.110 tareas                 |
| `npm run db:migrate`       | Crea y aplica migraciones en desarrollo                          |
| `npm run db:seed`          | Proyecto de demostración y usuarios de ejemplo                   |
| `npm run db:seed:perf`     | Proyecto sintético de 1.110 tareas para la prueba de rendimiento |
| `npm run db:reset`         | Borra la base, migra y vuelve a sembrar                          |
| `npm run db:studio`        | Prisma Studio para inspeccionar la base                          |
| `npm run clean`            | Elimina `.next` y las carpetas de cobertura                      |

## Pruebas

```powershell
npm test                  # motor, web e integración
npm run test:e2e          # end to end en Chromium
```

Los tests unitarios del motor corren con `TZ=UTC` para que las fechas no dependan de la zona horaria
de la máquina. Los de integración llaman a los Route Handlers reales contra la base `ganttpro_test`,
que el contenedor de Docker crea junto a la base principal; necesitan las migraciones aplicadas:

```powershell
npx cross-env DATABASE_URL=$env:DATABASE_URL_TEST prisma migrate deploy
```

Los end to end levantan o reutilizan `npm run dev` y necesitan la base sembrada (`npm run db:seed`).
La prueba de rendimiento se ejecuta aparte, porque compite por CPU con las demás:

```powershell
npm run db:seed:perf
npm run test:e2e:perf
```

## Estructura del repositorio

```
packages/engine/     Motor de planificación en TypeScript puro (sin React, Next ni Prisma)
prisma/              Esquema, migraciones y seeds
src/app/             Rutas de Next.js: aplicación, API, impresión y enlaces compartidos
src/components/      Interfaz: tabla, Gantt, seguimiento, exportación, importación, configuración
src/lib/             Servicios, esquemas Zod, cliente de API, exportación e importación
src/stores/          Estado del cliente con Zustand y el historial de deshacer/rehacer
e2e/                 Pruebas end to end con Playwright
fixtures/            Archivos de ejemplo para importación (MSPDI)
docs/                Especificación, decisiones de arquitectura, manual y evidencia de QA
docker/              Inicialización de PostgreSQL
```

## Despliegue en producción

El despliegue objetivo es un servidor propio con Docker
([ADR-004](docs/adr/ADR-004-postgres-unico-y-despliegue-docker.md)). El `Dockerfile` es multi-stage y
termina en una imagen que sirve la aplicación con el servidor autónomo de Next, como usuario sin
privilegios y con Chromium del sistema para la exportación a PDF
([ADR-007](docs/adr/ADR-007-pdf-con-puppeteer.md)). `docker-compose.prod.yml` levanta esa imagen
junto a PostgreSQL 16 con un volumen persistente; la base no se publica fuera de la red interna.

```powershell
Copy-Item .env.example .env          # ajusta DATABASE_URL, AUTH_SECRET y POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
```

El arranque del contenedor aplica las migraciones pendientes por sí solo. Para cargar el proyecto de
ejemplo la primera vez:

```powershell
docker compose -f docker-compose.prod.yml run --rm app npx prisma db seed
```

Variables de entorno relevantes en producción (todas documentadas en `.env.example`):

| Variable                                     | Obligatoria | Para qué sirve                                                      |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                          | Sí          | Clave de la base; el compose no arranca sin ella                    |
| `DATABASE_URL`                               | Sí          | Conexión a PostgreSQL (apunta al servicio `db` de la red interna)   |
| `AUTH_SECRET`                                | Sí          | Firma de la sesión                                                  |
| `APP_PORT`                                   | No          | Puerto publicado en el servidor (3000 por defecto)                  |
| `PRINT_BASE_URL`                             | No          | URL con la que el servidor se llama a sí mismo para imprimir el PDF |
| `PUPPETEER_EXECUTABLE_PATH`                  | No          | Chromium a usar; la imagen ya trae `/usr/bin/chromium`              |
| `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_API_MAX` | No          | Límite de intentos de ingreso y de escrituras de la API por IP      |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`       | No          | Habilitan el ingreso con Google                                     |
| `NEXT_PUBLIC_AUTH_GOOGLE`                    | No          | Muestra el botón de Google en la pantalla de ingreso                |
| `MAIL_TRANSPORT` y `MAIL_SMTP_*`             | No          | Envío de avisos de menciones (en v1 solo se escriben en la consola) |

La operación del servidor (respaldos, TLS, actualizaciones del sistema) queda del lado de quien lo
administra.

## Documentación

- [Manual de usuario](docs/manual-usuario.md) — cómo planificar con GanttPro, sin tecnicismos.
- [Especificación funcional](docs/spec/funcional.md) — los 38 casos de uso con sus criterios.
- [Modelo de datos](docs/spec/modelo-datos.md) y [arquitectura](docs/spec/arquitectura.md).
- [Decisiones de arquitectura](docs/adr/) — ADR-001 a ADR-012, con contexto y consecuencias.
- [Plan de pasos](docs/spec/plan-de-pasos.md) y [registro de tiempos](docs/registro-pasos.md).
- [Tabla de entrega](docs/entrega.md) — qué quedó completo y qué test lo cubre.
- [CHANGELOG](CHANGELOG.md) y [backlog](docs/backlog.md).
