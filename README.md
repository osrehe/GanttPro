# GanttPro

Aplicación web para planificar proyectos con cartas Gantt: jerarquía WBS, dependencias con
reprogramación automática, ruta crítica, recursos, líneas base y exportación a Excel y PDF.

Estado: en construcción. El desarrollo sigue el plan por pasos de `docs/spec/plan-de-pasos.md`.

## Requisitos

- Node.js 22 o superior
- Docker Desktop (para PostgreSQL)
- Windows 11 con PowerShell (los scripts funcionan también en macOS y Linux)

## Puesta en marcha

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d
npm run dev
```

La aplicación queda en <http://localhost:3000> y `GET /health` responde `{ "status": "ok" }`.

Si el puerto 5432 ya está ocupado, cambia `POSTGRES_PORT` en `.env` (por ejemplo a 5433) y actualiza
el puerto en `DATABASE_URL` y `DATABASE_URL_TEST`.

## Comandos

| Comando                 | Descripción                                         |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Servidor de desarrollo con Turbopack                |
| `npm run build`         | Build de producción                                 |
| `npm run start`         | Sirve el build de producción                        |
| `npm run lint`          | ESLint sobre todo el repositorio                    |
| `npm run format`        | Prettier (escritura) · `format:check` solo verifica |
| `npm run typecheck`     | `tsc` para la app y para `packages/engine`          |
| `npm run test`          | Vitest (proyectos `engine` y `web`)                 |
| `npm run test:coverage` | Vitest con cobertura del engine (umbral 90 %)       |
| `npm run clean`         | Elimina `.next` y carpetas de cobertura             |

## Estructura

```
packages/engine/   Motor de planificación (TypeScript puro, sin React ni Prisma)
src/app/           Rutas de Next.js (App Router)
src/components/    Componentes de UI (shadcn/ui en src/components/ui)
src/lib/           Utilidades compartidas
docs/spec/         Especificación y plan de pasos
docker/            Scripts de inicialización de PostgreSQL
```
