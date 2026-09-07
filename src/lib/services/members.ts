import type { Prisma, ProjectMember, User } from "@prisma/client";
import { roleLabel } from "@/lib/api/access";
import { ApiError } from "@/lib/api/response";
import { withAudit, type AuditEntry } from "@/lib/audit";
import { prisma } from "@/lib/db";
import type { MemberDto } from "@/lib/dto";
import type { AddMemberInput, UpdateMemberInput } from "@/lib/schemas";

/**
 * Miembros de un proyecto y sus roles (UC-32). Un proyecto siempre conserva al menos un
 * administrador: quitar o degradar al último se rechaza.
 */

type MemberWithUser = ProjectMember & { user: Pick<User, "name" | "email"> };

function toMemberDto(member: MemberWithUser): MemberDto {
  return {
    id: member.id,
    userId: member.userId,
    role: member.role,
    name: member.user.name,
    email: member.user.email,
  };
}

const withUser = { user: { select: { name: true, email: true } } } as const;

export async function listMembers(projectId: string): Promise<MemberDto[]> {
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    include: withUser,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toMemberDto);
}

/** Proyecto al que pertenece una membresía (para verificar el acceso en las rutas). */
export async function memberProjectId(memberId: string): Promise<string> {
  const row = await prisma.projectMember.findUnique({
    where: { id: memberId },
    select: { projectId: true },
  });
  if (!row) throw new ApiError("NOT_FOUND", "La membresía no existe", { memberId });
  return row.projectId;
}

/** Agrega a un usuario existente al proyecto con el rol indicado. */
export async function addMember(
  projectId: string,
  actorId: string,
  input: AddMemberInput,
): Promise<MemberDto> {
  return withAudit(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new ApiError(
        "NOT_FOUND",
        `No hay ningún usuario registrado con el correo ${input.email}`,
        { email: input.email },
      );
    }
    const existing = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (existing) {
      throw new ApiError("CONFLICT", `${user.name} ya es miembro de este proyecto`, {
        email: input.email,
      });
    }
    const member = await tx.projectMember.create({
      data: { projectId, userId: user.id, role: input.role },
      include: withUser,
    });
    const dto = toMemberDto(member);
    const audit: AuditEntry[] = [
      {
        projectId,
        userId: actorId,
        entityType: "ProjectMember",
        entityId: member.id,
        action: "CREATE",
        after: dto,
        summary: `agregó a ${user.name} como ${roleLabel(input.role)}`,
      },
    ];
    return { result: dto, audit };
  });
}

/** Cambia el rol de un miembro. */
export async function updateMemberRole(
  memberId: string,
  actorId: string,
  input: UpdateMemberInput,
): Promise<MemberDto> {
  return withAudit(async (tx) => {
    const member = await findMember(tx, memberId);
    if (member.role === input.role) return { result: toMemberDto(member), audit: [] };
    if (member.role === "ADMIN") await assertNotLastAdmin(tx, member);
    const updated = await tx.projectMember.update({
      where: { id: memberId },
      data: { role: input.role },
      include: withUser,
    });
    const dto = toMemberDto(updated);
    const audit: AuditEntry[] = [
      {
        projectId: member.projectId,
        userId: actorId,
        entityType: "ProjectMember",
        entityId: member.id,
        action: "UPDATE",
        before: toMemberDto(member),
        after: dto,
        summary: `cambió el rol de ${member.user.name} a ${roleLabel(input.role)}`,
      },
    ];
    return { result: dto, audit };
  });
}

/** Quita a un miembro del proyecto. */
export async function removeMember(memberId: string, actorId: string): Promise<void> {
  return withAudit(async (tx) => {
    const member = await findMember(tx, memberId);
    if (member.role === "ADMIN") await assertNotLastAdmin(tx, member);
    await tx.projectMember.delete({ where: { id: memberId } });
    const audit: AuditEntry[] = [
      {
        projectId: member.projectId,
        userId: actorId,
        entityType: "ProjectMember",
        entityId: member.id,
        action: "DELETE",
        before: toMemberDto(member),
        summary: `quitó a ${member.user.name} del proyecto`,
      },
    ];
    return { result: undefined, audit };
  });
}

async function findMember(tx: Prisma.TransactionClient, memberId: string): Promise<MemberWithUser> {
  const member = await tx.projectMember.findUnique({
    where: { id: memberId },
    include: withUser,
  });
  if (!member) throw new ApiError("NOT_FOUND", "La membresía no existe", { memberId });
  return member;
}

/** Rechaza dejar el proyecto sin administradores. */
async function assertNotLastAdmin(
  tx: Prisma.TransactionClient,
  member: MemberWithUser,
): Promise<void> {
  const admins = await tx.projectMember.count({
    where: { projectId: member.projectId, role: "ADMIN" },
  });
  if (admins <= 1) {
    throw new ApiError("VALIDATION", "El proyecto debe conservar al menos un administrador", {
      memberId: member.id,
    });
  }
}
