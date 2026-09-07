import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api/response";
import { withAudit, type AuditEntry } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { toCommentDto, type CommentDto } from "@/lib/dto";
import { notifyMention } from "@/lib/mailer";
import type { CreateCommentInput, UpdateCommentInput } from "@/lib/schemas";

/**
 * Comentarios por tarea con @menciones (UC-35). Las menciones se validan contra los miembros del
 * proyecto: los ids que no pertenecen al proyecto se descartan en silencio. Cada mutación queda en
 * `AuditLog`, así que aparece en la vista de Auditoría y en el feed de cambios del polling.
 */

/** Comentarios de una tarea, del más antiguo al más reciente. */
export async function listComments(taskId: string): Promise<CommentDto[]> {
  const rows = await prisma.comment.findMany({
    where: { taskId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const usersById = await mentionNames(
    prisma,
    rows.flatMap((r) => r.mentionIds),
  );
  return rows.map((row) => toCommentDto(row, usersById));
}

export async function createComment(
  taskId: string,
  userId: string,
  input: CreateCommentInput,
): Promise<CommentDto> {
  const created = await withAudit(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, wbsCode: true, name: true },
    });
    if (!task) throw new ApiError("NOT_FOUND", "La tarea no existe", { taskId });
    const mentionIds = await validMentionIds(tx, task.projectId, input.mentionIds ?? []);
    const row = await tx.comment.create({
      data: { taskId, authorId: userId, body: input.body, mentionIds },
      include: { author: { select: { name: true } } },
    });
    const usersById = await mentionNames(tx, mentionIds);
    const dto = toCommentDto(row, usersById);
    const audit: AuditEntry[] = [
      {
        projectId: task.projectId,
        userId,
        entityType: "Comment",
        entityId: row.id,
        action: "CREATE",
        after: dto,
        summary: `comentó en la tarea ${task.wbsCode} "${task.name}"`,
      },
    ];
    return { result: dto, audit };
  });
  await notifyMentions(created, taskId, userId);
  return created;
}

export async function updateComment(
  commentId: string,
  userId: string,
  input: UpdateCommentInput,
): Promise<CommentDto> {
  return withAudit(async (tx) => {
    const existing = await loadComment(tx, commentId);
    if (existing.authorId !== userId) {
      throw new ApiError("FORBIDDEN", "Solo el autor puede editar su comentario", { commentId });
    }
    const mentionIds =
      input.mentionIds === undefined
        ? existing.mentionIds
        : await validMentionIds(tx, existing.task.projectId, input.mentionIds);
    const row = await tx.comment.update({
      where: { id: commentId },
      data: { body: input.body ?? existing.body, mentionIds },
      include: { author: { select: { name: true } } },
    });
    const usersById = await mentionNames(tx, mentionIds);
    const before = toCommentDto(existing, await mentionNames(tx, existing.mentionIds));
    const dto = toCommentDto(row, usersById);
    const audit: AuditEntry[] = [
      {
        projectId: existing.task.projectId,
        userId,
        entityType: "Comment",
        entityId: commentId,
        action: "UPDATE",
        before,
        after: dto,
        summary: `editó su comentario en la tarea ${existing.task.wbsCode} "${existing.task.name}"`,
      },
    ];
    return { result: dto, audit };
  });
}

/** Borra un comentario. Solo su autor o un administrador del proyecto. */
export async function deleteComment(
  commentId: string,
  userId: string,
  isProjectAdmin: boolean,
): Promise<void> {
  return withAudit(async (tx) => {
    const existing = await loadComment(tx, commentId);
    if (existing.authorId !== userId && !isProjectAdmin) {
      throw new ApiError(
        "FORBIDDEN",
        "Solo el autor o un administrador del proyecto puede eliminar el comentario",
        { commentId },
      );
    }
    const before = toCommentDto(existing, await mentionNames(tx, existing.mentionIds));
    await tx.comment.delete({ where: { id: commentId } });
    const audit: AuditEntry[] = [
      {
        projectId: existing.task.projectId,
        userId,
        entityType: "Comment",
        entityId: commentId,
        action: "DELETE",
        before,
        summary: `eliminó un comentario en la tarea ${existing.task.wbsCode} "${existing.task.name}"`,
      },
    ];
    return { result: undefined, audit };
  });
}

/** Proyecto al que pertenece el comentario (para verificar el acceso en las rutas). */
export async function commentProjectId(commentId: string): Promise<string> {
  const row = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { task: { select: { projectId: true } } },
  });
  if (!row) throw new ApiError("NOT_FOUND", "El comentario no existe", { commentId });
  return row.task.projectId;
}

// ---------------------------------------------------------------------------------------------

type Db = Prisma.TransactionClient | typeof prisma;

async function loadComment(tx: Prisma.TransactionClient, commentId: string) {
  const row = await tx.comment.findUnique({
    where: { id: commentId },
    include: {
      author: { select: { name: true } },
      task: { select: { projectId: true, wbsCode: true, name: true } },
    },
  });
  if (!row) throw new ApiError("NOT_FOUND", "El comentario no existe", { commentId });
  return row;
}

/** Ids mencionados que además son miembros del proyecto, sin repetir. */
async function validMentionIds(
  tx: Db,
  projectId: string,
  mentionIds: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(mentionIds)];
  if (unique.length === 0) return [];
  const members = await tx.projectMember.findMany({
    where: { projectId, userId: { in: unique } },
    select: { userId: true },
  });
  const allowed = new Set(members.map((m) => m.userId));
  return unique.filter((id) => allowed.has(id));
}

async function mentionNames(
  tx: Db,
  mentionIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const unique = [...new Set(mentionIds)];
  if (unique.length === 0) return new Map();
  const users = await tx.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Notificación por correo, fuera de la transacción y sin propagar errores. */
async function notifyMentions(
  comment: CommentDto,
  taskId: string,
  authorId: string,
): Promise<void> {
  const targets = comment.mentions.filter((m) => m.id !== authorId);
  if (targets.length === 0) return;
  const [task, users] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      select: { name: true, projectId: true, project: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { id: { in: targets.map((t) => t.id) } },
      select: { id: true, name: true, email: true },
    }),
  ]);
  if (!task) return;
  for (const user of users) {
    await notifyMention({
      to: user.email,
      toName: user.name,
      fromName: comment.authorName,
      projectName: task.project.name,
      taskName: task.name,
      taskUrl: `/projects/${task.projectId}/table`,
      body: comment.body,
    });
  }
}
