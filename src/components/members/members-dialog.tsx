"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { formatDateCl } from "@/lib/dates";
import type { MemberDto } from "@/lib/dto";
import { describeError } from "@/stores/project-store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  projectId: string;
  projectName: string;
  /** Solo el administrador ve los controles que modifican miembros y enlaces. */
  isAdmin: boolean;
}

const ROLE_LABELS = {
  ADMIN: "Administrador",
  EDITOR: "Editor",
  VIEWER: "Lector",
} as const;

/** Miembros del proyecto y enlaces de solo lectura (UC-32, UC-33). */
export function MembersDialog({ open, onOpenChange, projectId, projectName, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberDto["role"]>("EDITOR");
  const [expiresAt, setExpiresAt] = useState("");

  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.members.list(projectId),
    enabled: open,
  });
  const shareLinks = useQuery({
    queryKey: ["share-links", projectId],
    queryFn: () => api.shareLinks.list(projectId),
    enabled: open && isAdmin,
  });

  const refreshMembers = () => queryClient.invalidateQueries({ queryKey: ["members", projectId] });
  const refreshLinks = () =>
    queryClient.invalidateQueries({ queryKey: ["share-links", projectId] });

  const addMember = useMutation({
    mutationFn: () => api.members.add(projectId, { email: email.trim(), role }),
    onSuccess: (member) => {
      toast.success(`${member.name} ahora es ${ROLE_LABELS[member.role].toLowerCase()}`);
      setEmail("");
      void refreshMembers();
    },
    onError: (error) => toast.error(describeError(error)),
  });
  const changeRole = useMutation({
    mutationFn: (input: { id: string; role: MemberDto["role"] }) =>
      api.members.update(input.id, { role: input.role }),
    onSuccess: (member) => {
      toast.success(`${member.name} ahora es ${ROLE_LABELS[member.role].toLowerCase()}`);
      void refreshMembers();
    },
    onError: (error) => toast.error(describeError(error)),
  });
  const removeMember = useMutation({
    mutationFn: (id: string) => api.members.remove(id),
    onSuccess: () => {
      toast.success("Miembro quitado del proyecto");
      void refreshMembers();
    },
    onError: (error) => toast.error(describeError(error)),
  });
  const createLink = useMutation({
    mutationFn: () => api.shareLinks.create(projectId, { expiresAt: expiresAt || null }),
    onSuccess: () => {
      toast.success("Enlace de solo lectura creado");
      setExpiresAt("");
      void refreshLinks();
    },
    onError: (error) => toast.error(describeError(error)),
  });
  const revokeLink = useMutation({
    mutationFn: (id: string) => api.shareLinks.revoke(id),
    onSuccess: () => {
      toast.success("Enlace revocado");
      void refreshLinks();
    },
    onError: (error) => toast.error(describeError(error)),
  });

  async function copyLink(path: string) {
    try {
      await navigator.clipboard.writeText(`${location.origin}${path}`);
      toast.success("Enlace copiado al portapapeles");
    } catch {
      toast.error("El navegador no permitió copiar; selecciona el enlace y cópialo a mano");
    }
  }

  function onAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) addMember.mutate();
  }

  const busy = addMember.isPending || changeRole.isPending || removeMember.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        data-testid="members-dialog"
      >
        <DialogHeader>
          <DialogTitle>Miembros y compartir</DialogTitle>
          <DialogDescription>
            Quién puede ver o editar «{projectName}» y enlaces públicos de solo lectura.
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Miembros</h3>
          {members.isLoading ? (
            <Skeleton className="h-24" />
          ) : members.isError ? (
            <p className="text-destructive text-sm">{describeError(members.error)}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {(members.data ?? []).map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2"
                  data-testid="member-row"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{member.email}</p>
                  </div>
                  {isAdmin ? (
                    <>
                      <Select
                        value={member.role}
                        disabled={busy}
                        onValueChange={(v) =>
                          changeRole.mutate({ id: member.id, role: v as MemberDto["role"] })
                        }
                      >
                        <SelectTrigger className="h-8 w-40" aria-label={`Rol de ${member.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar a ${member.name}`}
                        title={`Quitar a ${member.name}`}
                        disabled={busy}
                        onClick={() => removeMember.mutate(member.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isAdmin ? (
            <form onSubmit={onAddSubmit} className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-56 flex-1 gap-1.5">
                <Label htmlFor="add-member-email">Correo de la persona</Label>
                <Input
                  id="add-member-email"
                  type="email"
                  required
                  placeholder="persona@empresa.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="add-member-email"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="add-member-role">Rol</Label>
                <Select value={role} onValueChange={(v) => setRole(v as MemberDto["role"])}>
                  <SelectTrigger
                    id="add-member-role"
                    className="w-40"
                    data-testid="add-member-role"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={busy} data-testid="add-member-submit">
                <Plus className="size-4" />
                Agregar
              </Button>
            </form>
          ) : (
            <p className="text-muted-foreground text-xs">
              Solo un administrador del proyecto puede cambiar los miembros.
            </p>
          )}
        </section>

        {isAdmin ? (
          <section className="grid gap-3 border-t pt-4">
            <h3 className="text-sm font-medium">Enlaces de solo lectura</h3>
            <p className="text-muted-foreground text-xs">
              Cualquiera con el enlace puede ver el proyecto sin iniciar sesión. Se puede revocar en
              cualquier momento.
            </p>
            {shareLinks.isLoading ? (
              <Skeleton className="h-16" />
            ) : (shareLinks.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">Todavía no hay enlaces.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {(shareLinks.data ?? []).map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                    data-testid="share-link-row"
                  >
                    <Link2 className="text-muted-foreground size-4" aria-hidden />
                    <code className="min-w-0 flex-1 truncate text-xs">{link.path}</code>
                    <span className="text-muted-foreground text-xs">
                      {!link.isActive
                        ? link.revokedAt
                          ? "revocado"
                          : "vencido"
                        : link.expiresAt
                          ? `vence el ${formatDateCl(link.expiresAt)}`
                          : "sin vencimiento"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Copiar enlace"
                      title="Copiar enlace"
                      data-testid="copy-share-link"
                      onClick={() => void copyLink(link.path)}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Revocar enlace"
                      title="Revocar enlace"
                      data-testid="revoke-share-link"
                      disabled={!link.isActive || revokeLink.isPending}
                      onClick={() => revokeLink.mutate(link.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="share-expires">Vencimiento (opcional)</Label>
                <Input
                  id="share-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={createLink.isPending}
                onClick={() => createLink.mutate()}
                data-testid="create-share-link"
              >
                <Link2 className="size-4" />
                Crear enlace
              </Button>
            </div>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
