import { PrismaClient } from "@prisma/client";

/**
 * Marca a un usuario existente como administrador de la instalación (puede cambiar la
 * configuración global). Uso: `npm run db:make-admin -- persona@empresa.cl`.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Indica el correo: npm run db:make-admin -- persona@empresa.cl");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No hay ningún usuario registrado con el correo ${email}`);
  await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
  console.info(`${email} ahora administra la instalación`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
