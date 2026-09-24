-- Administrador de la instalación: solo él puede cambiar la configuración global.
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Las instalaciones existentes no quedan sin administrador: se promueve al usuario más antiguo,
-- que en una instalación sembrada es admin@ganttpro.local. Otros se agregan con
-- `npm run db:make-admin -- <correo>`.
UPDATE "User" SET "isAdmin" = true
WHERE "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
