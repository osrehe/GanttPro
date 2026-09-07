import { PrismaClient } from "@prisma/client";

/**
 * Cliente Prisma único por proceso. En desarrollo Next recarga módulos; se guarda en `globalThis`
 * para no abrir una conexión nueva en cada recarga.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type { PrismaClient };
