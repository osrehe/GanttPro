import { isIsoDate } from "@ganttpro/engine";
import { z } from "zod";

/**
 * Esquemas Zod compartidos por cliente y servidor (ADR-009). Los mensajes están en español.
 */

export const isoDateSchema = z
  .string()
  .refine((v) => isIsoDate(v), { message: "Fecha inválida: se esperaba YYYY-MM-DD" });

export const idSchema = z.string().min(1, "Identificador requerido");

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido: se esperaba #RRGGBB")
  .nullable();

export const projectStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const progressWeightingSchema = z.enum(["DURATION", "EFFORT"]);
export const taskStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "DONE",
  "ON_HOLD",
  "CANCELLED",
]);
export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const dependencyTypeSchema = z.enum(["FS", "SS", "FF", "SF"]);
export const resourceTypeSchema = z.enum(["PERSON", "TEAM", "MATERIAL"]);
export const currencySchema = z.enum(["UF", "CLP"]);
export const projectRoleSchema = z.enum(["ADMIN", "EDITOR", "VIEWER"]);

// ---------------------------------------------------------------- Proyectos y calendario

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  startDate: isoDateSchema,
  progressWeighting: progressWeightingSchema.optional(),
  /** Año cuyos feriados de Chile se cargan en el calendario base; por defecto el del inicio. */
  holidaysYear: z.number().int().min(2000).max(2100).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable(),
    startDate: isoDateSchema,
    statusDate: isoDateSchema.nullable(),
    status: projectStatusSchema,
    progressWeighting: progressWeightingSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que aplicar" });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const updateCalendarSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    workingDays: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Debe haber al menos un día laborable")
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    hoursPerDay: z.number().positive().max(24),
    holidays: z.array(z.object({ date: isoDateSchema, name: z.string().trim().min(1).max(80) })),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que aplicar" });
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;

// ---------------------------------------------------------------- Tareas

const taskEditableFields = {
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  description: z.string().trim().max(5000).nullable(),
  anchorDate: isoDateSchema,
  /** Azúcar para "editar la fecha de fin": se traduce a `durationDays` en el servidor. */
  endDate: isoDateSchema,
  durationDays: z.number().int().min(0).max(3650),
  effortHours: z.number().min(0).max(100000).nullable(),
  progressPct: z.number().int().min(0).max(100),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  color: hexColor,
  isMilestone: z.boolean(),
  notes: z.string().max(20000).nullable(),
};

export const createTaskSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  parentId: idSchema.nullable().optional(),
  /** Posición entre hermanos; por defecto al final. */
  index: z.number().int().min(0).optional(),
  anchorDate: isoDateSchema.optional(),
  durationDays: z.number().int().min(0).max(3650).optional(),
  effortHours: z.number().min(0).nullable().optional(),
  isMilestone: z.boolean().optional(),
  priority: taskPrioritySchema.optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  color: hexColor.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const patchTaskSchema = z
  .object(taskEditableFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que aplicar" });
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;

export const moveTaskSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("indent") }),
  z.object({ action: z.literal("outdent") }),
  z.object({ action: z.literal("up") }),
  z.object({ action: z.literal("down") }),
  z.object({
    action: z.literal("move"),
    parentId: idSchema.nullable(),
    index: z.number().int().min(0),
  }),
]);
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const bulkTaskUpdateSchema = z.object({
  /** Agrupa la operación en el AuditLog (undo/redo). */
  operationId: z.string().min(1).optional(),
  summary: z.string().trim().min(1).max(200).optional(),
  updates: z
    .array(
      z.object({
        id: idSchema,
        ...z.object(taskEditableFields).partial().shape,
        parentId: idSchema.nullable().optional(),
        orderIndex: z.number().int().min(0).optional(),
      }),
    )
    .min(1, "Se requiere al menos una actualización")
    .max(2000),
});
export type BulkTaskUpdateItem = BulkTaskUpdateInput["updates"][number];
export type BulkTaskUpdateInput = z.infer<typeof bulkTaskUpdateSchema>;

// ---------------------------------------------------------------- Dependencias

export const createDependencySchema = z.object({
  predecessorId: idSchema,
  successorId: idSchema,
  type: dependencyTypeSchema.optional(),
  lagDays: z.number().int().min(-365).max(365).optional(),
});
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;

export const updateDependencySchema = z
  .object({ type: dependencyTypeSchema, lagDays: z.number().int().min(-365).max(365) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que aplicar" });
export type UpdateDependencyInput = z.infer<typeof updateDependencySchema>;

// ---------------------------------------------------------------- Recursos y asignaciones

export const createResourceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  type: resourceTypeSchema.optional(),
  email: z.string().trim().email("Correo inválido").nullable().optional(),
  rate: z.number().min(0).optional(),
  rateCurrency: currencySchema.optional(),
  capacityHoursPerDay: z.number().positive().max(24).optional(),
  color: hexColor.optional(),
  calendarId: idSchema.nullable().optional(),
});
export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const updateResourceSchema = createResourceSchema
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que aplicar" });
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

export const createAssignmentSchema = z.object({
  resourceId: idSchema,
  allocationPct: z.number().int().min(1).max(1000).optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  allocationPct: z.number().int().min(1).max(1000),
});
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

// ---------------------------------------------------------------- Líneas base y cambios

export const createBaselineSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});
export type CreateBaselineInput = z.infer<typeof createBaselineSchema>;

export const changesQuerySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  /** Filtros de la vista de auditoría (UC-36). */
  entityId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type ChangesQuery = z.infer<typeof changesQuerySchema>;

// ---------------------------------------------------------------- Configuración global

export const updateSettingsSchema = z
  .object({
    ufValue: z.number().positive().nullable(),
    ufValueDate: isoDateSchema.nullable(),
    displayCurrency: currencySchema,
    dateFormat: z.enum(["dd-mm-yyyy", "yyyy-mm-dd"]),
    logoUrl: z.string().url().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que aplicar" });
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
