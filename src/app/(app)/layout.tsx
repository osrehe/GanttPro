import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { auth } from "@/lib/auth";

/** Layout de la aplicación autenticada: sidebar, header y contenido. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <AppShell
      user={{
        name: session.user.name ?? session.user.email ?? "",
        email: session.user.email ?? "",
      }}
    >
      {children}
    </AppShell>
  );
}
