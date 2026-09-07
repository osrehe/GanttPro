# ADR-004 — PostgreSQL 16 único y despliegue self-hosted con Docker

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

La spec original proponía "Postgres con Docker Compose; fallback SQLite para desarrollo rápido".
Prisma fija un único `provider` por schema: mantener dos motores implica dos schemas o renunciar a
enumeraciones nativas, arrays (`Calendar.workingDays Int[]`), `Json` con operadores y `DATE` real,
todo lo cual usa el modelo de datos. El "fallback" habría degradado el diseño para un beneficio
marginal.

El usuario confirmó que Docker Desktop está disponible en la máquina de desarrollo y que el destino
de producción es un servidor propio (VPS) con Docker, no una plataforma serverless.

## Decisión

1. **Un solo motor: PostgreSQL 16** en desarrollo, tests y producción. Sin SQLite.
2. **Desarrollo:** `docker-compose.yml` levanta `postgres:16-alpine` con usuario y clave `ganttpro`,
   base `ganttpro` y, mediante `docker/postgres/init/01-create-test-db.sql`, la base `ganttpro_test`.
   El puerto del host es `${POSTGRES_PORT:-5432}`, leído del `.env` del proyecto, porque en la
   máquina del usuario el 5432 está ocupado (se usa 5433). `DATABASE_URL` y `DATABASE_URL_TEST` van
   en `.env`; `.env.example` documenta ambos.
3. **Tests de integración** (Paso 5 en adelante) usan `DATABASE_URL_TEST`, aplican las migraciones
   con `prisma migrate deploy` y truncan las tablas entre archivos de test. Nunca tocan `ganttpro`.
4. **Producción:** despliegue self-hosted con `Dockerfile` multi-stage (dependencias → build →
   runtime con `next start` y Chromium para [ADR-007](ADR-007-pdf-con-puppeteer.md)) y
   `docker-compose.prod.yml` con la app, Postgres y un volumen persistente. Proceso Node de larga
   vida: no hay límites de tiempo de ejecución ni arranques en frío.
5. **CI (GitHub Actions):** desde el Paso 5 se añade un servicio `postgres:16` al job para correr los
   tests de integración; hasta entonces el job corre lint, format, typecheck y unit tests.

## Consecuencias

Positivas:

- El schema usa todo Postgres: enums, arrays, `Json`, `DATE`, índices compuestos, `citext` si hiciera
  falta. Lo que pasa en el test pasa en producción.
- Una sola cadena de migraciones que mantener.
- El servidor persistente habilita Puppeteer, caches en memoria y, si algún día se quiere, SSE
  ([ADR-010](ADR-010-colaboracion-por-polling.md)).

Negativas:

- Desarrollar exige Docker Desktop corriendo. Se documenta en el README, con la variable
  `POSTGRES_PORT` para colisiones de puerto.
- Operar un VPS (backups, actualizaciones, TLS) es responsabilidad del usuario; el Paso 11 entrega
  el `docker-compose.prod.yml` y notas de operación, no una plataforma gestionada.
- La imagen de producción con Chromium pesa varios cientos de MB.

## Alternativas descartadas

- **SQLite en dev + Postgres en prod.** Dos schemas o un schema empobrecido; bugs que solo aparecen en
  producción (orden de `NULL`, precisión de `Decimal`, `DATE`).
- **Postgres gestionado (Neon/Supabase) sin Docker.** Evita Docker, pero requiere internet para
  desarrollar y complica la base de test aislada. El usuario prefirió Docker local.
- **Vercel + Neon.** Serverless obligaría a `@react-pdf/renderer` y a polling puro; el usuario eligió
  self-hosted, donde Puppeteer es viable.

## Cómo verificarla

- `docker compose up -d` deja `ganttpro-db` en estado `healthy` y
  `docker exec ganttpro-db psql -U ganttpro -d ganttpro -c "\l"` lista `ganttpro` y `ganttpro_test`
  (verificado en el Paso 0).
- `prisma/schema.prisma` declara `provider = "postgresql"` y no existe ningún archivo
  `*.sqlite`/`*.db` versionado.
- En el Paso 11, `docker compose -f docker-compose.prod.yml up --build` sirve la app y
  `GET /health` responde 200 desde el contenedor.
