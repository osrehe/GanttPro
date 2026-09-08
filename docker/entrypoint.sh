#!/bin/sh
# Arranque del contenedor: aplica las migraciones pendientes y cede el control al servidor.
#
# La siembra de datos (`npm run db:seed`) NO se ejecuta aquí: es una decisión del operador y solo
# tiene sentido la primera vez. Para sembrar el proyecto de ejemplo en una instalación nueva:
#   docker compose -f docker-compose.prod.yml run --rm app npx prisma db seed
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "Falta DATABASE_URL: el contenedor no puede conectarse a la base de datos." >&2
  exit 1
fi

echo "Aplicando migraciones pendientes…"
node node_modules/prisma/build/index.js migrate deploy

echo "Iniciando GanttPro en el puerto ${PORT:-3000}…"
exec "$@"
