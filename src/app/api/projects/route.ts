import { requireUser } from "@/lib/api/access";
import { created, handle, ok, parseBody } from "@/lib/api/response";
import { createProjectSchema } from "@/lib/schemas";
import { createProject, listProjects } from "@/lib/services/projects";

/** Proyectos del usuario con resumen para las tarjetas. */
export const GET = handle(async () => {
  const user = await requireUser();
  return ok(await listProjects(user.id));
});

/** Crea un proyecto; el creador queda como ADMIN. */
export const POST = handle(async (request) => {
  const user = await requireUser();
  const input = await parseBody(request, createProjectSchema);
  return created(await createProject(user.id, input));
});
