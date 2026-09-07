# ADR-001 — Repositorio único con engine puro en `packages/engine`

- **Estado:** Aceptada
- **Fecha:** 2026-09-06

## Contexto

El motor de planificación (calendario laboral, scheduling con dependencias, renumeración WBS, ruta
crítica, carga de recursos, varianza contra línea base y modelo de layout del Gantt) es la parte con
más lógica y más riesgo de error del producto. Necesita:

- Probarse unitariamente con miles de casos y medir su rendimiento sin levantar Next.js ni Postgres.
- Ejecutarse en el navegador (previsualización optimista durante un drag, ver [ADR-008](ADR-008-store-unico-y-undo-redo.md))
  y en el servidor (fuente de verdad al persistir, ver [ADR-009](ADR-009-diseno-de-api.md)) con el
  mismo código, para que ambos produzcan exactamente las mismas fechas.
- Mantenerse aislado de la UI y de la base de datos para que un cambio de framework o de ORM no lo
  contamine.

La spec original pedía `/packages/engine` pero no fijaba cómo se integraría con la app de Next.js
que vive en la raíz, ni cómo se garantizaría la pureza más allá de la buena voluntad.

## Decisión

1. Un solo repositorio git. La app Next.js vive en la raíz; el engine es un workspace npm en
   `packages/engine` con nombre `@ganttpro/engine` (`"workspaces": ["packages/*"]` en el
   `package.json` raíz).
2. El engine se publica desde su código fuente TypeScript (`"exports": { ".": "./src/index.ts" }`),
   sin paso de build propio. Next lo compila con `transpilePackages: ["@ganttpro/engine"]` en
   `next.config.ts`; Vitest y `tsc` lo resuelven con el alias `@ganttpro/engine` definido en
   `vitest.config.ts` y `tsconfig.json`.
3. La pureza se impone con herramientas, no con convención:
   - ESLint: regla `no-restricted-imports` sobre `packages/engine/**/*.ts` que prohíbe `react`,
     `react-dom`, `next`, `next/*`, `@prisma/*` y `@/*` con un mensaje en español.
   - `packages/engine/tsconfig.json` usa `"lib": ["ES2022"]` y `"types": []`: no existe `document`,
     `window` ni tipos de Node en el engine. Cualquier acceso al DOM o a `process` falla en typecheck.
   - `package.json` del engine no declara dependencias de runtime.
4. Vitest se configura en la raíz con dos proyectos: `engine` (raíz `packages/engine`, tests en
   `tests/`) y `web` (`src/**/*.test.ts(x)`). El umbral de cobertura del 90 % (líneas, ramas,
   funciones, sentencias) se aplica solo a `packages/engine/src/**`.

## Consecuencias

Positivas:

- El mismo módulo corre en cliente y servidor; los resultados son idénticos por construcción.
- Los tests del engine arrancan en milisegundos y no necesitan Docker.
- El engine podría reutilizarse en una CLI, un worker o una app móvil (extensiones v2) sin cambios.
- La frontera se rompe en el pre-commit o en CI, no en producción.

Negativas:

- Los tipos de dominio (`Task`, `Dependency`, `Calendar`…) se definen dos veces: en Prisma y en el
  engine. Se mitiga con adaptadores explícitos en `src/lib` que convierten filas de Prisma a los tipos
  del engine (fechas `Date` → `YYYY-MM-DD`, `Decimal` → `number`).
- `transpilePackages` recompila el engine en cada arranque de `next dev`; con el tamaño previsto
  (algunos miles de líneas) el costo es despreciable.
- Un workspace npm en Windows crea un enlace simbólico en `node_modules/@ganttpro/engine`; funciona
  con npm 11 sin permisos especiales, pero hay que recordarlo si se copia el repo sin `npm install`.

## Alternativas descartadas

- **Carpeta `src/engine` dentro de la app.** Más simple, pero la frontera dependería solo de ESLint y
  el engine heredaría el `tsconfig` con lib DOM, así que `window` compilaría. También impide
  reutilizarlo fuera de la app sin extraerlo después.
- **Paquete npm separado publicado en un registro privado.** Añade versionado, publicación y
  sincronización entre dos repos para un equipo de una persona. Desproporcionado en v1.
- **Monorepo con `apps/web` + `packages/*` (Turborepo).** Mueve la app de Next a una subcarpeta y
  añade otra herramienta. No aporta nada mientras exista una sola app.

## Cómo verificarla

- `npm run lint` debe fallar si se agrega `import { useState } from "react"` en cualquier archivo de
  `packages/engine/src`.
- `npm run typecheck` debe fallar si se usa `window` o `process.env` dentro del engine.
- `npm run test:coverage` debe reportar ≥ 90 % en `packages/engine/src/**` y fallar por debajo.
- `src/app/page.tsx` importa `ENGINE_VERSION` desde `@ganttpro/engine` y `npm run build` compila:
  demuestra que `transpilePackages` funciona.
