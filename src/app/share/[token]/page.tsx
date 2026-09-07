import type { Metadata } from "next";
import { ShareView } from "@/components/share/share-view";
import { getProjectFull } from "@/lib/services/projects";
import { resolveShareToken } from "@/lib/services/share";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Proyecto compartido · GanttPro", robots: "noindex" };

type Props = { params: Promise<{ token: string }> };

/**
 * Vista pública de un proyecto mediante un enlace de solo lectura (UC-33). No requiere sesión:
 * el token identifica el proyecto y se puede revocar o dejar vencer.
 */
export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const resolved = await resolveShareToken(token);
  if (!resolved) return <Unavailable />;
  const full = await getProjectFull(resolved.projectId, "VIEWER");
  // Solo el plan: los miembros del proyecto (nombres y correos) no se publican.
  return (
    <ShareView
      full={{
        project: full.project,
        calendar: full.calendar,
        tasks: full.tasks,
        dependencies: full.dependencies,
        resources: full.resources.map((r) => ({ ...r, email: null })),
        assignments: full.assignments,
      }}
    />
  );
}

function Unavailable() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div
        className="max-w-md rounded-lg border border-dashed p-10 text-center"
        data-testid="share-unavailable"
      >
        <h1 className="mb-2 text-lg font-semibold">El enlace no está disponible</h1>
        <p className="text-muted-foreground text-sm">
          Puede que haya sido revocado, que haya vencido o que la dirección esté mal copiada. Pide
          un enlace nuevo a quien administra el proyecto.
        </p>
      </div>
    </div>
  );
}
