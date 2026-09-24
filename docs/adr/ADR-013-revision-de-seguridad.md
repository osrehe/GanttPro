# ADR-013 — Revisión de seguridad posterior a la v1.3

- **Estado:** Aceptada
- **Fecha:** 2026-09-24
- **Complementa:** [ADR-012](ADR-012-endurecimiento-y-despliegue.md)

## Contexto

Una auditoría del código y de las dependencias encontró huecos que ADR-012 no cubría. Las
dependencias de producción tenían avisos de seguridad conocidos (postcss dentro de Next, uuid dentro
de exceljs, deepmerge-ts dentro de la CLI de Prisma). En la aplicación:

- cualquier usuario con sesión podía cambiar la configuración global, que afecta a los costos y a
  los documentos de **todos** los proyectos;
- el logo de las exportaciones aceptaba cualquier URL, y Chromium la cargaba al generar el PDF;
- el servidor arrancaba con el `AUTH_SECRET` de ejemplo, y el seed de producción usaba la contraseña
  publicada en la documentación;
- el límite de inicio de sesión tomaba la **primera** entrada de `X-Forwarded-For`, que escribe el
  propio cliente, así que bastaba con rotarla para saltarse el límite;
- la exportación PDF no tenía límite (es un `GET`, fuera del alcance del middleware) y cada petición
  lanza un Chromium;
- la importación leía el cuerpo completo antes de comprobar su tamaño, y un `.xlsx` pequeño podía
  descomprimirse en gigabytes.

## Decisión

1. **Dependencias.** Next pasa a 15.5.26 y `overrides` en `package.json` fija versiones sin avisos
   de postcss (`next`), uuid (`exceljs`) y deepmerge-ts. `npm audit --omit=dev` queda en cero. Lo
   que sigue apareciendo en `npm audit` completo pertenece a herramientas de desarrollo (Lighthouse,
   Vitest) y no llega a la imagen.
2. **Administrador de la instalación.** `User.isAdmin` (migración
   `20260924120000_administrador_de_la_instalacion`, que promueve al usuario más antiguo para no
   dejar instalaciones sin administrador). `PATCH /api/settings` exige `requireInstanceAdmin()` y
   `GET` devuelve `canEdit`, con el que la página de Configuración se muestra en solo lectura. El
   permiso se consulta en la base en cada petición, no viaja en el JWT. No hay pantalla para
   asignarlo: `npm run db:make-admin -- <correo>`.
3. **Logo y Chromium.** El logo solo puede ser `https:` o una imagen PNG, JPEG, GIF o WebP incrustada
   (`logoUrlSchema`), y `getSettings` descarta al leer un valor guardado que no cumpla. Además, la
   página que abre Puppeteer intercepta sus peticiones (`isAllowedPrintRequest`): solo su propio
   origen, `data:`/`blob:` y la URL exacta del logo. Aunque el contenido cambie, Chromium no sirve
   para llegar a otros hosts de la red.
4. **Configuración segura al arrancar.** `src/instrumentation.ts` llama a `assertProductionConfig`
   en producción: el servidor no arranca sin `AUTH_SECRET`, con el valor de `.env.example` o con
   menos de 32 caracteres. El seed exige `SEED_PASSWORD` en producción y ya no la imprime.
5. **Inicio de sesión.**
   - La IP se lee **desde la derecha** de `X-Forwarded-For` según `TRUSTED_PROXY_HOPS` (por defecto
     1), no desde la izquierda.
   - Como sin proxy la cabecera sigue siendo falsificable (Next solo la completa si el cliente no la
     envía), se agrega un límite **por cuenta** en `authorize()`: 10 intentos cada 15 minutos
     (`RATE_LIMIT_LOGIN_ACCOUNT_MAX`).
   - Si el correo no existe, se compara igual contra un hash ficticio para que el tiempo de respuesta
     no revele qué cuentas están registradas.
6. **PDF.** A lo más `PDF_MAX_CONCURRENCY` (2) navegadores a la vez; si están ocupados se responde 429. Cada usuario tiene además 10 exportaciones por minuto (`RATE_LIMIT_PDF_MAX`). La URL con el
   token de impresión ya no aparece en el detalle de error que recibe el cliente.
7. **Tamaño de las peticiones.**
   - `readBodyLimited` rechaza por `Content-Length` y corta la lectura en cuanto se supera el tope.
     `parseBody` lo usa con 5 MB por defecto y 25 MB para `POST /api/import`.
   - La previsualización de importación aplica el tope antes de interpretar el formulario.
   - `inspectZip` recorre el directorio central del `.xlsx` y rechaza más de 100 MB descomprimidos
     declarados, más de 2.000 entradas o ZIP64, sin descomprimir nada.
8. **Último administrador de un proyecto.** `assertNotLastAdmin` bloquea las filas de los
   administradores con `SELECT … FOR UPDATE` en vez de solo contarlas. Así dos degradaciones
   simultáneas no dejan el proyecto sin administradores.

## Consecuencias

- Solo quien administra la instalación puede cambiar la UF, la moneda, el formato de fecha y el
  logo. El resto de los usuarios ve esas preferencias sin poder editarlas.
- Un logo alojado en `http:` deja de ser válido: hay que servirlo por `https:` o incrustarlo.
- Un despliegue con el secreto de ejemplo falla al arrancar, con un mensaje que explica cómo
  generar uno. Es intencional.
- Una cuenta atacada queda bloqueada 15 minutos también para su dueño legítimo. Se acepta a cambio
  de frenar la fuerza bruta distribuida.
- Los tamaños descomprimidos se toman de lo que declara el ZIP. Un archivo manipulado podría
  declarar menos de lo que contiene; el tope de 10 MB del archivo comprimido acota ese caso.

## Pendiente (en el backlog)

- Chromium sigue corriendo con `--no-sandbox`. La interceptación de red reduce la superficie, pero
  quitar la bandera exige ajustar el perfil seccomp del contenedor.
- Agregar un miembro revela si un correo tiene cuenta. Se mantiene a propósito: quien administra el
  proyecto necesita saberlo.
- Las sesiones JWT duran 30 días y no se pueden revocar. Los permisos se consultan en cada
  petición, así que el riesgo se limita a una sesión robada.
- Los ids inexistentes responden 404 antes de comprobar el acceso. Con ids cuid el riesgo práctico
  es mínimo.

## Cómo verificarla

- `src/lib/env-check.test.ts`, `src/lib/import/zip-guard.test.ts`,
  `src/lib/export/print-requests.test.ts`, `src/lib/schemas/logo-url.test.ts`,
  `src/lib/api/read-body.test.ts` y los casos nuevos de `src/lib/rate-limit.test.ts`.
- `src/app/api/security.integration.test.ts`:
  - configuración global solo para quien administra;
  - logo rechazado con `http:`, `file:`, `javascript:` y SVG;
  - importación por sobre el tope;
  - carrera entre dos administradores.
- `e2e/settings-permissions.spec.ts`: Configuración en solo lectura para quien no administra.
