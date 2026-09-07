import { ENGINE_VERSION } from "@ganttpro/engine";
import { Button } from "@/components/ui/button";
import { auth, signOut } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  const name = session?.user?.name ?? session?.user?.email ?? "";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">GanttPro</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Hola, <span data-testid="user-name">{name}</span>. La aplicación está en construcción: la
        gestión de proyectos llega en los próximos pasos.
      </p>
      <p className="text-muted-foreground text-sm">
        Motor de planificación v{ENGINE_VERSION} ·{" "}
        <a className="underline underline-offset-4" href="/health">
          Estado del servicio
        </a>
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button type="submit" variant="outline">
          Cerrar sesión
        </Button>
      </form>
    </main>
  );
}
