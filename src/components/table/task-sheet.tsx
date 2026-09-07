"use client";

import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateCl } from "@/lib/dates";
import type { TaskDto } from "@/lib/dto";
import type { PatchTaskInput } from "@/lib/schemas";
import { editableSnapshot, patchTaskCommand } from "@/stores/commands";
import { useProjectStore } from "@/stores/project-store";
import { AssignmentEditor } from "./assignment-editor";
import { DependencyEditor } from "./dependency-editor";

const PRIORITY_LABEL: Record<TaskDto["priority"], string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

const STATUS_LABEL: Record<TaskDto["status"], string> = {
  NOT_STARTED: "No iniciada",
  IN_PROGRESS: "En curso",
  DONE: "Completada",
  ON_HOLD: "En pausa",
  CANCELLED: "Cancelada",
};

/** Panel lateral de detalle de una tarea: campos, dependencias, recursos y notas (UC-06). */
export function TaskSheet() {
  const detailTaskId = useProjectStore((s) => s.detailTaskId);
  const task = useProjectStore((s) =>
    s.detailTaskId ? s.tasksById.get(s.detailTaskId) : undefined,
  );
  const role = useProjectStore((s) => s.role);
  const openDetail = useProjectStore((s) => s.openDetail);
  const run = useProjectStore((s) => s.run);
  const canEdit = role === "ADMIN" || role === "EDITOR";

  return (
    <Sheet open={detailTaskId !== null} onOpenChange={(open) => !open && openDetail(null)}>
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl"
        data-testid="task-sheet"
      >
        {task ? (
          <>
            <SheetHeader>
              <SheetTitle>
                {task.wbsCode} · {task.name}
              </SheetTitle>
              <SheetDescription>
                {formatDateCl(task.startDate)} – {formatDateCl(task.endDate)} · {task.durationDays}{" "}
                días hábiles · {task.progressPct} % {task.isCritical ? "· crítica" : ""}
              </SheetDescription>
            </SheetHeader>
            <Tabs defaultValue="fields" className="px-4 pb-6">
              <TabsList className="w-full">
                <TabsTrigger value="fields" className="flex-1">
                  Campos
                </TabsTrigger>
                <TabsTrigger value="dependencies" className="flex-1">
                  Dependencias
                </TabsTrigger>
                <TabsTrigger value="resources" className="flex-1">
                  Recursos
                </TabsTrigger>
                <TabsTrigger value="notes" className="flex-1">
                  Notas
                </TabsTrigger>
              </TabsList>
              <TabsContent value="fields">
                <TaskFields
                  task={task}
                  canEdit={canEdit}
                  onSave={(input, label) =>
                    run(patchTaskCommand(task.id, input, editableSnapshot(task), label))
                  }
                />
              </TabsContent>
              <TabsContent value="dependencies">
                <DependencyEditor task={task} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="resources">
                <AssignmentEditor task={task} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="notes">
                <NotesEditor
                  task={task}
                  canEdit={canEdit}
                  onSave={(notes) =>
                    run(
                      patchTaskCommand(task.id, { notes }, editableSnapshot(task), "editar notas"),
                    )
                  }
                />
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TaskFields({
  task,
  canEdit,
  onSave,
}: {
  task: TaskDto;
  canEdit: boolean;
  onSave(input: PatchTaskInput, label: string): Promise<boolean>;
}) {
  const [form, setForm] = useState(() => toForm(task));
  useEffect(() => setForm(toForm(task)), [task]);
  const disabled = !canEdit;
  const summary = task.isSummary;

  async function submit() {
    const input: PatchTaskInput = {};
    if (form.name.trim() !== task.name && form.name.trim() !== "") input.name = form.name.trim();
    if ((form.description || null) !== (task.description ?? null))
      input.description = form.description || null;
    if (form.priority !== task.priority) input.priority = form.priority;
    if (form.status !== task.status) input.status = form.status;
    if ((form.color || null) !== (task.color ?? null)) input.color = form.color || null;
    const effort = form.effortHours === "" ? null : Number(form.effortHours);
    if (effort !== (task.effortHours ?? null)) input.effortHours = effort;
    if (!summary) {
      if (form.anchorDate !== (task.anchorDate ?? task.startDate))
        input.anchorDate = form.anchorDate;
      if (form.isMilestone !== task.isMilestone) input.isMilestone = form.isMilestone;
      const duration = Number(form.durationDays);
      if (!form.isMilestone && duration !== task.durationDays) input.durationDays = duration;
      const progress = Number(form.progressPct);
      if (progress !== task.progressPct) input.progressPct = progress;
    }
    if (Object.keys(input).length === 0) return;
    await onSave(input, "editar tarea");
  }

  return (
    <form
      className="space-y-3 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Nombre" id="task-name">
        <Input
          id="task-name"
          value={form.name}
          disabled={disabled}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Descripción" id="task-description">
        <Textarea
          id="task-description"
          rows={2}
          value={form.description}
          disabled={disabled}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio (ancla)" id="task-anchor">
          <Input
            id="task-anchor"
            type="date"
            value={form.anchorDate}
            disabled={disabled || summary}
            onChange={(e) => setForm({ ...form, anchorDate: e.target.value })}
          />
        </Field>
        <Field label="Fin calculado" id="task-end">
          <Input id="task-end" value={formatDateCl(task.endDate)} disabled readOnly />
        </Field>
        <Field label="Duración (días hábiles)" id="task-duration">
          <Input
            id="task-duration"
            type="number"
            min={0}
            value={form.durationDays}
            disabled={disabled || summary || form.isMilestone}
            onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
          />
        </Field>
        <Field label="Esfuerzo (horas)" id="task-effort">
          <Input
            id="task-effort"
            type="number"
            min={0}
            step="0.5"
            value={form.effortHours}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, effortHours: e.target.value })}
          />
        </Field>
        <Field label="% Avance" id="task-progress">
          <Input
            id="task-progress"
            type="number"
            min={0}
            max={100}
            value={form.progressPct}
            disabled={disabled || summary}
            onChange={(e) => setForm({ ...form, progressPct: e.target.value })}
          />
        </Field>
        <Field label="Estado" id="task-status">
          <Select
            value={form.status}
            onValueChange={(v) => setForm({ ...form, status: v as TaskDto["status"] })}
            disabled={disabled}
          >
            <SelectTrigger id="task-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Prioridad" id="task-priority">
          <Select
            value={form.priority}
            onValueChange={(v) => setForm({ ...form, priority: v as TaskDto["priority"] })}
            disabled={disabled}
          >
            <SelectTrigger id="task-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_LABEL).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Color" id="task-color">
          <Input
            id="task-color"
            type="color"
            value={form.color || "#2563eb"}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-9 p-1"
          />
        </Field>
      </div>
      {!summary ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isMilestone}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, isMilestone: e.target.checked })}
          />
          Es un hito (duración 0)
        </label>
      ) : (
        <p className="text-muted-foreground text-xs">
          Las tareas resumen derivan fechas, duración y avance de sus subtareas.
        </p>
      )}
      <div className="text-muted-foreground grid grid-cols-3 gap-2 text-xs">
        <span>Holgura total: {task.totalFloatDays ?? "—"}</span>
        <span>Holgura libre: {task.freeFloatDays ?? "—"}</span>
        <span>{task.isCritical ? "En ruta crítica" : "No crítica"}</span>
      </div>
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" size="sm" data-testid="save-task">
            Guardar cambios
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function NotesEditor({
  task,
  canEdit,
  onSave,
}: {
  task: TaskDto;
  canEdit: boolean;
  onSave(notes: string | null): Promise<boolean>;
}) {
  const [notes, setNotes] = useState(task.notes ?? "");
  useEffect(() => setNotes(task.notes ?? ""), [task]);
  return (
    <div className="space-y-3 pt-3">
      <Textarea
        rows={8}
        value={notes}
        disabled={!canEdit}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas en Markdown…"
        aria-label="Notas"
      />
      {canEdit ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={(task.notes ?? "") === notes}
            onClick={() => void onSave(notes.trim() === "" ? null : notes)}
          >
            Guardar notas
          </Button>
        </div>
      ) : null}
      {notes.trim() !== "" ? (
        <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border p-3">
          <ReactMarkdown>{notes}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function toForm(task: TaskDto) {
  return {
    name: task.name,
    description: task.description ?? "",
    anchorDate: task.anchorDate ?? task.startDate,
    durationDays: String(task.durationDays),
    effortHours: task.effortHours === null ? "" : String(task.effortHours),
    progressPct: String(task.progressPct),
    status: task.status,
    priority: task.priority,
    color: task.color ?? "",
    isMilestone: task.isMilestone,
  };
}
