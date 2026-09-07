import type { NextAuthConfig } from "next-auth";

/** Rutas accesibles sin sesión. */
const PUBLIC_PATHS = ["/login", "/health"];

/**
 * Configuración de Auth.js compatible con el runtime edge (la usa el middleware).
 * No importa Prisma ni bcrypt: la verificación de credenciales vive en `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);
      const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/auth");

      // Impresión PDF: Puppeteer abre /print/* con un token firmado que verifica la propia página.
      if (pathname.startsWith("/print/") && request.nextUrl.searchParams.has("token")) return true;

      if (isPublic) {
        if (isLoggedIn && pathname === "/login") {
          return Response.redirect(new URL("/", request.nextUrl));
        }
        return true;
      }
      if (isLoggedIn) return true;
      if (pathname.startsWith("/api")) {
        return Response.json(
          { error: { code: "UNAUTHORIZED", message: "Debes iniciar sesión para usar la API" } },
          { status: 401 },
        );
      }
      // `false` redirige a la página de inicio de sesión con callbackUrl.
      return false;
    },
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      return session;
    },
  },
} satisfies NextAuthConfig;
