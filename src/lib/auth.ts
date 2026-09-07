import bcrypt from "bcryptjs";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "./db";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** Google solo se ofrece si están configuradas las credenciales (UC-31, opcional). */
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const providers: NextAuthConfig["providers"] = [
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
];

if (googleEnabled) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

/**
 * Auth.js con credenciales y, opcionalmente, Google (ADR-005). La sesión es JWT y el id del
 * usuario viaja en el token. Con Google no se crean cuentas: el correo debe existir en `User`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.trim().toLowerCase();
      const existing = email
        ? await prisma.user.findUnique({ where: { email }, select: { id: true } })
        : null;
      // Sin cuenta previa se rechaza el ingreso; el login muestra el motivo en español.
      return existing ? true : "/login?error=cuenta-no-registrada";
    },
    async jwt({ token, user, account }) {
      if (user?.id) token.id = user.id;
      if (account?.provider === "google" && typeof token.email === "string") {
        const existing = await prisma.user.findUnique({
          where: { email: token.email.trim().toLowerCase() },
          select: { id: true },
        });
        if (existing) token.id = existing.id;
      }
      return token;
    },
  },
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
