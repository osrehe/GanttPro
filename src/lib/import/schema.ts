import { z } from "zod";
import { idSchema, isoDateSchema } from "@/lib/schemas";

/** Esquemas de la importación: el cliente envía el plan previsualizado y el destino. */

export const importedTaskSchema = z.object({
  row: z.number().int().min(0),
  wbs: z.string().regex(/^\d+(?:\.\d+)*$/, "Código WBS inválido"),
  level: z.number().int().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  durationDays: z.number().int().min(0).max(3650),
  startDate: isoDateSchema.nullable(),
  isMilestone: z.boolean(),
  progressPct: z.number().int().min(0).max(100),
  predecessors: z.string().max(2000),
  resources: z.array(z.string().trim().min(1).max(120)).max(50),
  notes: z.string().max(20000).nullable(),
});

export const importedResourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["PERSON", "TEAM", "MATERIAL"]),
  rate: z.number().min(0),
  rateCurrency: z.enum(["UF", "CLP"]),
  capacityHoursPerDay: z.number().min(0).max(24),
});

export const importedPlanSchema = z.object({
  source: z.enum(["xlsx", "csv", "mspdi"]),
  projectName: z.string().trim().max(120).nullable(),
  startDate: isoDateSchema.nullable(),
  tasks: z.array(importedTaskSchema).min(1, "El plan no tiene tareas").max(5000),
  resources: z.array(importedResourceSchema).max(500),
});
export type ImportedPlanInput = z.infer<typeof importedPlanSchema>;

export const importTargetSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("new"),
    name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
    startDate: isoDateSchema.optional(),
  }),
  z.object({ mode: z.literal("append"), projectId: idSchema }),
  z.object({ mode: z.literal("replace"), projectId: idSchema }),
]);
export type ImportTargetInput = z.infer<typeof importTargetSchema>;

export const importRequestSchema = z.object({
  plan: importedPlanSchema,
  target: importTargetSchema,
});
export type ImportRequestInput = z.infer<typeof importRequestSchema>;
