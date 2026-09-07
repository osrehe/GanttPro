"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { CommentDto, TaskDto } from "@/lib/dto";
import { cn } from "@/lib/utils";
import { describeError, useProjectStore } from "@/stores/project-store";
import {
  activeMention,
  insertMention,
  matchMembers,
  mentionedIds,
  relativeTime,
  splitMentions,
} from "./mentions";

/** Comentarios de una tarea con @menciones (UC-35). Vive en el panel de detalle. */
export function CommentsPanel({ task, canEdit }: { task: TaskDto; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const members = useProjectStore((s) => s.members);
  const currentUserId = useProjectStore((s) => s.currentUserId);
  const role = useProjectStore((s) => s.role);
  const isProjectAdmin = role === "ADMIN";
  const queryKey = ["task", task.id, "comments"];

  const query = useQuery({
    queryKey,
    queryFn: () => api.comments.list(task.id),
    refetchInterval: 2000,
  });

  const create = useMutation({
    mutationFn: (input: { body: string; mentionIds: string[] }) =>
      api.comments.create(task.id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast.error(describeError(error)),
  });
  const update = useMutation({
    mutationFn: ({ id, body, mentionIds }: { id: string; body: string; mentionIds: string[] }) =>
      api.comments.update(id, { body, mentionIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast.error(describeError(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.comments.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast.error(describeError(error)),
  });

  const comments = query.data ?? [];

  return (
    <div className="space-y-4 pt-3" data-testid="comments-panel">
      {query.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Sin comentarios todavía. Escribe el primero y menciona a alguien con @.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              members={members}
              canEditOwn={canEdit && comment.authorId === currentUserId}
              canDelete={canEdit && (comment.authorId === currentUserId || isProjectAdmin)}
              busy={update.isPending || remove.isPending}
              onUpdate={(body, mentionIds) => update.mutate({ id: comment.id, body, mentionIds })}
              onDelete={() => remove.mutate(comment.id)}
            />
          ))}
        </ul>
      )}

      {canEdit ? (
        <CommentComposer
          busy={create.isPending}
          onSubmit={(body, mentionIds) => create.mutate({ body, mentionIds })}
        />
      ) : (
        <p className="text-muted-foreground text-xs">
          Tu rol de lector no permite comentar en este proyecto.
        </p>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  members,
  canEditOwn,
  canDelete,
  busy,
  onUpdate,
  onDelete,
}: {
  comment: CommentDto;
  members: ReturnType<typeof useProjectStore.getState>["members"];
  canEditOwn: boolean;
  canDelete: boolean;
  busy: boolean;
  onUpdate(body: string, mentionIds: string[]): void;
  onDelete(): void;
}) {
  const [editing, setEditing] = useState(false);
  const names = members.map((m) => m.name);
  const edited = comment.updatedAt !== comment.createdAt;

  return (
    <li className="rounded-md border p-3 text-sm" data-testid="comment-row">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{comment.authorName}</span>
        <span className="text-muted-foreground text-xs">
          {relativeTime(comment.createdAt)}
          {edited ? " · editado" : ""}
        </span>
        <span className="ml-auto flex gap-1">
          {canEditOwn ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Editar comentario"
              data-testid="comment-edit"
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="size-3.5" />
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Eliminar comentario"
              data-testid="comment-delete"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </span>
      </div>
      {editing ? (
        <div className="pt-2">
          <CommentComposer
            initialBody={comment.body}
            submitLabel="Guardar"
            busy={busy}
            onSubmit={(body, mentionIds) => {
              onUpdate(body, mentionIds);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <p className="mt-1 break-words whitespace-pre-wrap" data-testid="comment-body">
          {splitMentions(comment.body, names).map((part, i) =>
            part.isMention ? (
              <span key={i} className="text-primary font-medium">
                {part.text}
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </p>
      )}
    </li>
  );
}

function CommentComposer({
  initialBody = "",
  submitLabel = "Comentar",
  busy,
  onSubmit,
  onCancel,
}: {
  initialBody?: string;
  submitLabel?: string;
  busy: boolean;
  onSubmit(body: string, mentionIds: string[]): void;
  onCancel?: () => void;
}) {
  const members = useProjectStore((s) => s.members);
  const [body, setBody] = useState(initialBody);
  const [caret, setCaret] = useState(initialBody.length);
  const [highlighted, setHighlighted] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mention = activeMention(body, caret);
  const suggestions = mention ? matchMembers(members, mention.term) : [];
  const open = mention !== null && suggestions.length > 0;

  useEffect(() => setHighlighted(0), [mention?.term]);

  function choose(index: number) {
    const member = suggestions[index];
    if (!mention || !member) return;
    const next = insertMention(body, mention, caret, member);
    setBody(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((h) => (h + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(highlighted);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCaret(-1);
        return;
      }
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  }

  function submit() {
    const trimmed = body.trim();
    if (trimmed === "" || busy) return;
    onSubmit(trimmed, mentionedIds(trimmed, members));
    setBody("");
    setCaret(0);
  }

  return (
    <div className="relative space-y-2">
      <Textarea
        ref={textareaRef}
        rows={3}
        value={body}
        disabled={busy}
        placeholder="Escribe un comentario. Usa @ para mencionar a alguien; Ctrl+Enter para enviar."
        aria-label="Comentario"
        data-testid="comment-input"
        onChange={(e) => {
          setBody(e.target.value);
          setCaret(e.target.selectionStart);
        }}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
        onClick={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul
          className="bg-popover absolute bottom-full z-20 mb-1 w-64 rounded-md border p-1 shadow-md"
          role="listbox"
          aria-label="Personas del proyecto"
        >
          {suggestions.map((member, index) => (
            <li key={member.userId}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                data-testid="mention-option"
                className={cn(
                  "w-full rounded px-2 py-1 text-left text-sm",
                  index === highlighted ? "bg-accent" : "hover:bg-muted",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(index);
                }}
              >
                {member.name}
                <span className="text-muted-foreground ml-2 text-xs">{member.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={submit}
          disabled={busy || body.trim() === ""}
          data-testid="comment-submit"
        >
          <Send className="size-4" />
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
