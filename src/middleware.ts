import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * Protege páginas y API: sin sesión, las páginas redirigen a /login y la API responde 401.
 * Usa solo `auth.config.ts` (sin Prisma) porque corre en el runtime edge.
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|ico|webp)$).*)"],
};
