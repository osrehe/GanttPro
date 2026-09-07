import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { PrintGantt, type PrintBaseline } from "@/components/print/print-gantt";
import { auth } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { parsePdfOptions, type PdfOptions } from "@/lib/export/print-model";
import { verifyPrintToken } from "@/lib/export/print-token";
import { getBaselineDetail } from "@/lib/services/baselines";
import { getProjectFull } from "@/lib/services/projects";
import { getSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Impresión del Gantt · GanttPro" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Ruta de impresión que Puppeteer convierte en PDF (UC-27). Autoriza con un token firmado
 * (`?token=`) o con la sesión del usuario si es miembro del proyecto; cualquier otro caso es 404
 * para no revelar la existencia del proyecto.
 */
export default async function PrintGanttPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const projectId = first(params.projectId);
  if (!projectId) notFound();

  const role = await authorize(projectId, first(params.token));
  if (!role) notFound();

  let options: PdfOptions;
  try {
    const { projectId: _p, token: _t, ...rest } = params;
    void _p;
    void _t;
    options = parsePdfOptions(rest);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((i) => i.message).join("; ")
        : "Opciones de impresión inválidas";
    return (
      <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }} data-testid="print-error">
        <h1 style={{ fontSize: 16 }}>No se puede imprimir el Gantt</h1>
        <p>{message}</p>
      </main>
    );
  }

  const [full, settings] = await Promise.all([getProjectFull(projectId, role), getSettings()]);
  let baseline: PrintBaseline | null = null;
  if (options.baselineId) {
    const detail = await getBaselineDetail(options.baselineId).catch(() => null);
    if (detail && detail.baseline.projectId === projectId) {
      baseline = { name: detail.baseline.name, tasks: detail.tasks };
    }
  }

  return (
    <PrintGantt
      full={full}
      options={options}
      logoUrl={settings.logoUrl}
      baseline={baseline}
      printedAt={todayIso()}
    />
  );
}

/** Rol con el que se lee el proyecto, o `null` si no hay autorización. */
async function authorize(
  projectId: string,
  token: string | undefined,
): Promise<"ADMIN" | "EDITOR" | "VIEWER" | null> {
  if (token) {
    const payload = await verifyPrintToken(token);
    if (!payload || payload.projectId !== projectId) return null;
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: payload.userId } },
      select: { role: true },
    });
    return member?.role ?? null;
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return member?.role ?? null;
}
