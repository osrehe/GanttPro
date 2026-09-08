# ADR-012 — Endurecimiento de la aplicación e imagen de producción

- **Estado:** Aceptada
- **Fecha:** 2026-09-07

## Contexto

El Paso 11 cierra la v1 y pide tres cosas que hasta ahora no existían: cabeceras de seguridad,
límite de peticiones y una imagen de producción reproducible. El despliegue es un servidor propio
con Docker ([ADR-004](ADR-004-postgres-unico-y-despliegue-docker.md)), un solo proceso Node detrás
de un proxy inverso, y la exportación a PDF necesita Chromium dentro del contenedor
([ADR-007](ADR-007-pdf-con-puppeteer.md)).

Tres restricciones condicionan las decisiones:

1. El middleware corre en el runtime **edge**: no puede usar APIs de Node, ni Prisma, ni paquetes
   que dependan de ellos.
2. Next inyecta scripts en línea para hidratar y arrancar el enrutador, así que una CSP sin
   `'unsafe-inline'` en `script-src` deja la aplicación en blanco. Los nonces requieren generar la
   cabecera por petición en el middleware y reenviarla al render; con la configuración actual rompe
   la exportación PDF y las páginas estáticas.
3. La suite de pruebas de extremo a extremo inicia sesión decenas de veces desde la misma dirección
   IP en pocos minutos.

## Decisión

1. **Cabeceras de seguridad en `next.config.ts`**, aplicadas a todas las rutas con `headers()`:
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: strict-origin-when-cross-origin`,
   `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`,
   `X-DNS-Prefetch-Control: off` y, **solo en producción**,
   `Strict-Transport-Security: max-age=31536000; includeSubDomains` (en desarrollo se sirve por
   HTTP).
2. **Política de seguridad de contenido** en una sola línea para toda la aplicación:

   ```
   default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
   img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; media-src 'self';
   object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
   upgrade-insecure-requests
   ```

   En desarrollo se añade `'unsafe-eval'` a `script-src` porque Turbopack evalúa código, y se omite
   `upgrade-insecure-requests`. Las decisiones que no son obvias: `img-src` acepta `data:` y `blob:`
   porque la exportación PNG rasteriza el SVG en un canvas y el PDF incrusta el logo, y acepta
   `https:` porque el logo de las exportaciones es una URL que el usuario configura;
   `frame-ancestors 'none'` impide incrustar la aplicación (y duplica a `X-Frame-Options` para
   navegadores viejos); `object-src 'none'` y `base-uri 'self'` cierran dos vectores clásicos de
   inyección. No hace falta relajar nada en `/print/gantt` ni en `/share/[token]`: ambas usan los
   mismos recursos propios.

3. **Límite de peticiones en memoria** (`src/lib/rate-limit.ts`), ventana deslizante sin
   dependencias, aplicado en el middleware **antes** de comprobar la sesión:
   - `POST /api/auth/callback/credentials`: 10 intentos por IP cada 5 minutos.
   - Escrituras de la API (`POST`, `PATCH`, `PUT`, `DELETE` bajo `/api/`): 120 por IP cada minuto.
   - Nunca se limitan las lecturas, las páginas ni `/health` (la sonda del contenedor).
   - Al superarlo se responde **429** con la envolvente habitual,
     `{ "error": { "code": "RATE_LIMITED", "message": "…", "details": { "retryAfterSeconds": n } } }`
     y la cabecera `Retry-After`. `RATE_LIMITED` se agrega al catálogo de códigos de
     [ADR-009](ADR-009-diseno-de-api.md) con estado 429; es un añadido, ningún código existente
     cambia de significado.
   - Los máximos se leen de `RATE_LIMIT_LOGIN_MAX` y `RATE_LIMIT_API_MAX`. **Fuera de producción el
     valor por defecto es 1.000**, para que el desarrollo y la suite de pruebas —que inicia sesión
     muchas veces seguidas desde la misma IP— no lo toquen. El propio límite se prueba fijando esas
     variables, no bajándolo para todos.
   - La IP sale de `X-Forwarded-For` (primera entrada) o `X-Real-IP`. Si el proxy no las reenvía,
     todas las peticiones comparten una clave fija: el límite pasa a ser global, que es
     conservador, nunca permisivo.
4. **Imagen de producción multietapa** (`Dockerfile`): dependencias → compilación → ejecución.
   La etapa final parte de `node:22-bookworm-slim`, instala **Chromium de la distribución** con sus
   fuentes (`fonts-liberation`, `fonts-dejavu-core`, `fonts-noto-color-emoji`), fija
   `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` y `PUPPETEER_SKIP_DOWNLOAD=1`, corre como usuario
   sin privilegios, expone el 3000 y trae un `HEALTHCHECK` contra `/health`. Next se compila con
   `output: "standalone"`, así que la imagen no lleva ni el código fuente ni las dependencias de
   desarrollo; solo se copian además el esquema de Prisma, sus migraciones y la CLI, porque el
   `entrypoint` aplica `prisma migrate deploy` antes de arrancar el servidor. La siembra de datos
   es manual y está documentada en el propio archivo.
5. **`docker-compose.prod.yml`** levanta Postgres (sin publicar su puerto) y la aplicación, con
   `depends_on: service_healthy`, volumen con nombre y `shm_size: 512mb` (Chromium se cae con los
   64 MB que Docker da por defecto).
6. **CI construye la imagen** en un job aparte para que el `Dockerfile` no se pudra en silencio.

## Consecuencias

Positivas:

- Las cabeceras y la CSP cierran clickjacking, sniffing de tipo, formularios hacia terceros e
  inyección de `<base>` sin tocar una línea de la aplicación.
- El límite de peticiones frena la prueba de contraseñas por fuerza bruta, que es el ataque
  realista contra un login con credenciales, y lo hace en el borde, sin llegar a la base de datos.
- La imagen es reproducible y arranca sola: migra y sirve, sin pasos manuales salvo la siembra
  inicial.
- Chromium de la distribución se parchea con `apt` y evita una descarga de ~150 MB por build.

Negativas:

- `'unsafe-inline'` en `script-src` debilita la CSP frente a XSS: si alguna vez se inyectara HTML
  del usuario sin escapar, la política no lo detendría. Se mitiga porque React escapa todo lo que
  renderiza y no hay `dangerouslySetInnerHTML` con datos del usuario, pero conviene revisarlo si se
  agrega contenido enriquecido.
- El contador vive en la memoria del proceso: **con más de una instancia el límite real se
  multiplica** por el número de réplicas, y un reinicio lo borra. Para escalar horizontalmente hay
  que moverlo a Redis o al proxy inverso; queda anotado en el backlog.
- La imagen pesa bastante más que un Next pelado por culpa de Chromium.

## Alternativas descartadas

- **CSP con nonce por petición.** Es la forma correcta de evitar `'unsafe-inline'`, pero obliga a
  generar la cabecera en el middleware y propagar el nonce a cada script de Next; con la ruta de
  impresión y las páginas estáticas actuales rompe la generación del PDF. Queda para la v2, junto
  con `strict-dynamic`.
- **Rate limiting en el proxy inverso (nginx, Traefik).** Es lo habitual en producción y no se
  descarta, pero dejaría la aplicación sin defensa cuando se despliega sin proxy y no permitiría
  responder con la envolvente de error de la API. Las dos capas pueden convivir.
- **Rate limiting con Redis o Upstash.** Correcto para varias instancias, pero agrega una
  dependencia de infraestructura que la v1 no necesita: un solo contenedor.
- **Chromium de Puppeteer dentro de la imagen.** Funciona, pero descarga su propio binario en cada
  build, no recibe parches de seguridad de la distribución y engorda la imagen.
- **`npm run db:seed` en el arranque.** Sembrar automáticamente en producción es peligroso: crearía
  usuarios de ejemplo con una contraseña conocida.

## Cómo verificarla

- `src/lib/rate-limit.test.ts`: ventana deslizante, aislamiento por clave, reinicio y lectura de
  las variables de entorno.
- `src/middleware.test.ts`: con `RATE_LIMIT_API_MAX` y `RATE_LIMIT_LOGIN_MAX` bajos, la petición
  que excede recibe 429 con `code: "RATE_LIMITED"` y `Retry-After`; las lecturas y `/health` nunca
  se limitan; cada IP lleva su propia cuenta.
- `src/app/api/security.integration.test.ts`: un usuario de otro proyecto recibe 403 o 404 en todas
  las rutas direccionadas por id, un lector no puede escribir, un proyecto archivado rechaza las
  mutaciones y los ids mal formados nunca producen un 500.
- Las cabeceras se comprueban con `curl -I` contra el servidor de producción; en el Paso 11 quedan
  registradas en el checklist de QA.
- La imagen se construye en CI (`docker build`) y el `HEALTHCHECK` la marca sana solo si `/health`
  responde.
