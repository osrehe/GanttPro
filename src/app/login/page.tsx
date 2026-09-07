import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión · GanttPro",
};

export default function LoginPage() {
  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center p-6">
      <div className="bg-background w-full max-w-sm rounded-xl border p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">GanttPro</h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">
          Ingresa con tu correo y contraseña.
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
