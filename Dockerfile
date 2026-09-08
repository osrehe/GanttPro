# Imagen de producción de GanttPro (ADR-012): servidor autónomo de Next.js con Chromium del
# sistema para la exportación a PDF. Se construye en tres etapas para que la imagen final no
# arrastre ni las dependencias de desarrollo ni el código fuente.

# ---------------------------------------------------------------- 1. Dependencias
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# openssl lo necesita el motor de consultas de Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Chromium se instala desde la distribución en la etapa final: Puppeteer no debe descargar el suyo.
ENV PUPPETEER_SKIP_DOWNLOAD=1

# Manifiestos primero para aprovechar la caché de capas. `packages/*` es un workspace npm.
COPY package.json package-lock.json ./
COPY packages/engine/package.json ./packages/engine/
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npx prisma generate

# ---------------------------------------------------------------- 2. Compilación
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` con output "standalone" deja un servidor con solo lo que se usa.
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------- 3. Ejecución
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Chromium del sistema (más liviano y parcheado por la distribución que el que baja Puppeteer) y
# las fuentes necesarias para que el PDF no salga con cuadros en vez de letras.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    openssl \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-color-emoji \
    tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# El servidor se llama a sí mismo por loopback para imprimir el PDF (nunca por cabeceras).
ENV PRINT_BASE_URL=http://127.0.0.1:3000

# Usuario sin privilegios (el grupo `node` ya existe en la imagen base).
RUN useradd --uid 1001 --gid node --create-home ganttpro

# Servidor autónomo y sus estáticos.
COPY --from=builder --chown=ganttpro:node /app/.next/standalone ./
COPY --from=builder --chown=ganttpro:node /app/.next/static ./.next/static
COPY --from=builder --chown=ganttpro:node /app/public ./public

# Esquema, migraciones y la CLI de Prisma: el arranque aplica `migrate deploy`.
COPY --from=builder --chown=ganttpro:node /app/prisma ./prisma
COPY --from=builder --chown=ganttpro:node /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=ganttpro:node /app/node_modules/@prisma ./node_modules/@prisma

COPY --chown=ganttpro:node docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER ganttpro
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
