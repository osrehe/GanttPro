import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "./db";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/**
 * Auth.js con proveedor de credenciales (ADR-005). Google se agrega en el Paso 10.
 * La sesión es JWT; el id del usuario viaja en el token (ver callbacks en `auth.config.ts`).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
});

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/** Error lanzado por `getSessionUser` cuando no hay sesión; la API lo traduce a 401. */
export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";
  constructor() {
    super("Debes iniciar sesión");
    this.name = "UnauthorizedError";
  }
}

/** Usuario de la sesión actual. Lanza `UnauthorizedError` si no hay sesión válida. */
export async function getSessionUser(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) throw new UnauthorizedError();
  return { id: user.id, email: user.email, name: user.name ?? user.email };
}

/** Hash de contraseña con bcrypt (coste 10). Lo usan el seed y la futura gestión de usuarios. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
