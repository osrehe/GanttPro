import { ENGINE_VERSION } from "@ganttpro/engine";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">GanttPro</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Planificación de proyectos con cartas Gantt. La aplicación está en construcción.
      </p>
      <p className="text-muted-foreground text-sm">
        Motor de planificación v{ENGINE_VERSION} ·{" "}
        <a className="underline underline-offset-4" href="/health">
          Estado del servicio
        </a>
      </p>
    </main>
  );
}
