import type { DependencyType } from "@ganttpro/engine";

/**
 * Proyecto de demostración: implementación de una plataforma de gestión documental.
 * Tres niveles de WBS, 32 hojas (2 hitos) y 14 resúmenes; dependencias mixtas.
 */

export interface SeedTaskDef {
  readonly code: string;
  readonly name: string;
  /** Días hábiles; 0 = hito. Ausente en resúmenes. */
  readonly duration?: number;
  readonly effortHours?: number;
  readonly priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly notes?: string;
  readonly children?: readonly SeedTaskDef[];
}

export const PROJECT = {
  name: "Implementación plataforma de gestión documental",
  description:
    "Proyecto de ejemplo: análisis, construcción, pruebas y puesta en marcha de una plataforma documental con flujos de aprobación y firma electrónica.",
  startDate: "2026-09-07",
  statusDate: "2026-10-30",
} as const;

export const TASKS: readonly SeedTaskDef[] = [
  {
    code: "1",
    name: "Inicio y planificación",
    children: [
      {
        code: "1.1",
        name: "Kick-off y alcance",
        children: [
          {
            code: "1.1.1",
            name: "Reunión de inicio",
            duration: 1,
            effortHours: 8,
            priority: "HIGH",
          },
          { code: "1.1.2", name: "Levantamiento de requerimientos", duration: 5, effortHours: 40 },
          { code: "1.1.3", name: "Definición de alcance y WBS", duration: 3, effortHours: 24 },
        ],
      },
      {
        code: "1.2",
        name: "Planificación",
        children: [
          { code: "1.2.1", name: "Plan de proyecto y cronograma", duration: 3, effortHours: 24 },
          { code: "1.2.2", name: "Plan de pruebas", duration: 2, effortHours: 16 },
          { code: "1.2.3", name: "Hito: plan aprobado", duration: 0, priority: "CRITICAL" },
        ],
      },
    ],
  },
  {
    code: "2",
    name: "Análisis y diseño",
    children: [
      {
        code: "2.1",
        name: "Análisis funcional",
        children: [
          { code: "2.1.1", name: "Casos de uso", duration: 5, effortHours: 40 },
          { code: "2.1.2", name: "Modelo de datos", duration: 4, effortHours: 32 },
          { code: "2.1.3", name: "Prototipo de interfaz", duration: 4, effortHours: 32 },
        ],
      },
      {
        code: "2.2",
        name: "Diseño técnico",
        children: [
          {
            code: "2.2.1",
            name: "Arquitectura de la solución",
            duration: 3,
            effortHours: 24,
            priority: "HIGH",
          },
          { code: "2.2.2", name: "Diseño de integraciones", duration: 4, effortHours: 32 },
          { code: "2.2.3", name: "Revisión de diseño", duration: 1, effortHours: 8 },
        ],
      },
    ],
  },
  {
    code: "3",
    name: "Construcción",
    children: [
      {
        code: "3.1",
        name: "Backend",
        children: [
          { code: "3.1.1", name: "Módulo de usuarios y roles", duration: 5, effortHours: 40 },
          {
            code: "3.1.2",
            name: "Módulo de documentos",
            duration: 8,
            effortHours: 64,
            priority: "HIGH",
          },
          {
            code: "3.1.3",
            name: "Motor de flujos de aprobación",
            duration: 8,
            effortHours: 64,
            priority: "HIGH",
          },
          {
            code: "3.1.4",
            name: "Integración con firma electrónica",
            duration: 5,
            effortHours: 40,
          },
        ],
      },
      {
        code: "3.2",
        name: "Frontend",
        children: [
          { code: "3.2.1", name: "Portal de usuario", duration: 8, effortHours: 64 },
          { code: "3.2.2", name: "Bandeja de aprobaciones", duration: 5, effortHours: 40 },
          { code: "3.2.3", name: "Panel de administración", duration: 4, effortHours: 32 },
        ],
      },
      {
        code: "3.3",
        name: "Infraestructura",
        children: [
          { code: "3.3.1", name: "Ambientes de desarrollo y QA", duration: 3, effortHours: 24 },
          { code: "3.3.2", name: "Pipeline CI/CD", duration: 3, effortHours: 24 },
          { code: "3.3.3", name: "Ambiente de producción", duration: 3, effortHours: 24 },
        ],
      },
    ],
  },
  {
    code: "4",
    name: "Pruebas",
    children: [
      {
        code: "4.1",
        name: "Pruebas internas",
        children: [
          { code: "4.1.1", name: "Pruebas unitarias e integración", duration: 5, effortHours: 40 },
          { code: "4.1.2", name: "Pruebas de rendimiento", duration: 3, effortHours: 24 },
          { code: "4.1.3", name: "Corrección de defectos", duration: 5, effortHours: 40 },
        ],
      },
      {
        code: "4.2",
        name: "Aceptación",
        children: [
          {
            code: "4.2.1",
            name: "Pruebas de aceptación de usuario",
            duration: 5,
            effortHours: 40,
            priority: "HIGH",
          },
          { code: "4.2.2", name: "Ajustes post UAT", duration: 3, effortHours: 24 },
        ],
      },
    ],
  },
  {
    code: "5",
    name: "Puesta en marcha",
    children: [
      { code: "5.1", name: "Capacitación de usuarios", duration: 3, effortHours: 24 },
      { code: "5.2", name: "Migración de documentos históricos", duration: 4, effortHours: 32 },
      {
        code: "5.3",
        name: "Salida a producción",
        duration: 1,
        effortHours: 8,
        priority: "CRITICAL",
      },
      { code: "5.4", name: "Hito: go-live", duration: 0, priority: "CRITICAL" },
      { code: "5.5", name: "Soporte post implementación", duration: 10, effortHours: 40 },
    ],
  },
];

export interface SeedDependencyDef {
  readonly from: string;
  readonly to: string;
  readonly type?: DependencyType;
  readonly lag?: number;
}

export const DEPENDENCIES: readonly SeedDependencyDef[] = [
  { from: "1.1.1", to: "1.1.2" },
  { from: "1.1.2", to: "1.1.3" },
  { from: "1.1.3", to: "1.2.1" },
  { from: "1.2.1", to: "1.2.2", type: "SS", lag: 1 },
  { from: "1.2.1", to: "1.2.3" },
  { from: "1.2.2", to: "1.2.3" },
  { from: "1.2.3", to: "2.1.1" },
  { from: "2.1.1", to: "2.1.2", type: "SS", lag: 2 },
  { from: "2.1.1", to: "2.1.3" },
  { from: "2.1.2", to: "2.2.1" },
  { from: "2.2.1", to: "2.2.2" },
  { from: "2.2.2", to: "2.2.3", type: "FF" },
  { from: "2.2.3", to: "3.1.1" },
  { from: "3.1.1", to: "3.1.2" },
  { from: "3.1.2", to: "3.1.3", type: "SS", lag: 3 },
  { from: "3.1.3", to: "3.1.4", lag: -2 },
  { from: "2.1.3", to: "3.2.1" },
  { from: "3.2.1", to: "3.2.2" },
  { from: "3.2.2", to: "3.2.3", type: "SS" },
  { from: "2.2.1", to: "3.3.1" },
  { from: "3.3.1", to: "3.3.2" },
  { from: "3.3.2", to: "3.3.3", lag: 5 },
  { from: "3.1.4", to: "4.1.1" },
  { from: "3.2.3", to: "4.1.1" },
  { from: "4.1.1", to: "4.1.2" },
  { from: "4.1.2", to: "4.1.3" },
  { from: "4.1.3", to: "4.2.1" },
  { from: "4.2.1", to: "4.2.2" },
  { from: "4.2.1", to: "5.1", type: "SS" },
  { from: "3.3.3", to: "5.2" },
  { from: "4.2.2", to: "5.3" },
  { from: "5.2", to: "5.3", type: "FF" },
  { from: "5.3", to: "5.4", type: "FF" },
  { from: "5.4", to: "5.5" },
];

export interface SeedResourceDef {
  readonly key: string;
  readonly name: string;
  readonly type: "PERSON" | "TEAM" | "MATERIAL";
  readonly email?: string;
  readonly rate: number;
  readonly capacity: number;
  readonly color: string;
}

export const RESOURCES: readonly SeedResourceDef[] = [
  {
    key: "pm",
    name: "Carolina Muñoz (Jefa de proyecto)",
    type: "PERSON",
    email: "carolina@ejemplo.cl",
    rate: 1.8,
    capacity: 8,
    color: "#2563eb",
  },
  {
    key: "analista",
    name: "Rodrigo Pérez (Analista funcional)",
    type: "PERSON",
    email: "rodrigo@ejemplo.cl",
    rate: 1.2,
    capacity: 8,
    color: "#7c3aed",
  },
  {
    key: "dev1",
    name: "Valentina Rojas (Desarrolladora backend)",
    type: "PERSON",
    email: "valentina@ejemplo.cl",
    rate: 1.4,
    capacity: 8,
    color: "#059669",
  },
  {
    key: "dev2",
    name: "Matías Soto (Desarrollador frontend)",
    type: "PERSON",
    email: "matias@ejemplo.cl",
    rate: 1.3,
    capacity: 8,
    color: "#d97706",
  },
  {
    key: "qa",
    name: "Francisca Díaz (QA)",
    type: "PERSON",
    email: "francisca@ejemplo.cl",
    rate: 1.0,
    capacity: 8,
    color: "#db2777",
  },
  {
    key: "infra",
    name: "Equipo de infraestructura",
    type: "TEAM",
    rate: 1.1,
    capacity: 16,
    color: "#4b5563",
  },
];

export interface SeedAssignmentDef {
  readonly task: string;
  readonly resource: string;
  readonly pct: number;
}

export const ASSIGNMENTS: readonly SeedAssignmentDef[] = [
  { task: "1.1.1", resource: "pm", pct: 100 },
  { task: "1.1.2", resource: "analista", pct: 100 },
  { task: "1.1.2", resource: "pm", pct: 50 },
  { task: "1.1.3", resource: "pm", pct: 100 },
  { task: "1.2.1", resource: "pm", pct: 100 },
  { task: "1.2.2", resource: "qa", pct: 100 },
  { task: "2.1.1", resource: "analista", pct: 100 },
  { task: "2.1.2", resource: "analista", pct: 50 },
  { task: "2.1.2", resource: "dev1", pct: 50 },
  { task: "2.1.3", resource: "dev2", pct: 100 },
  { task: "2.2.1", resource: "dev1", pct: 100 },
  { task: "2.2.2", resource: "dev1", pct: 100 },
  { task: "2.2.3", resource: "pm", pct: 50 },
  { task: "3.1.1", resource: "dev1", pct: 100 },
  { task: "3.1.2", resource: "dev1", pct: 100 },
  { task: "3.1.3", resource: "dev1", pct: 100 },
  { task: "3.1.4", resource: "dev1", pct: 100 },
  { task: "3.2.1", resource: "dev2", pct: 100 },
  { task: "3.2.2", resource: "dev2", pct: 100 },
  { task: "3.2.3", resource: "dev2", pct: 100 },
  { task: "3.3.1", resource: "infra", pct: 50 },
  { task: "3.3.2", resource: "infra", pct: 50 },
  { task: "3.3.3", resource: "infra", pct: 100 },
  { task: "4.1.1", resource: "qa", pct: 100 },
  { task: "4.1.2", resource: "qa", pct: 100 },
  { task: "4.1.3", resource: "dev1", pct: 50 },
  { task: "4.1.3", resource: "dev2", pct: 50 },
  { task: "4.2.1", resource: "qa", pct: 50 },
  { task: "4.2.1", resource: "analista", pct: 50 },
  { task: "4.2.2", resource: "dev2", pct: 100 },
  { task: "5.1", resource: "analista", pct: 100 },
  { task: "5.2", resource: "infra", pct: 100 },
  { task: "5.3", resource: "infra", pct: 100 },
  { task: "5.3", resource: "pm", pct: 100 },
  { task: "5.5", resource: "dev1", pct: 25 },
  { task: "5.5", resource: "dev2", pct: 25 },
];

export const USERS = [
  { key: "admin", email: "admin@ganttpro.local", name: "Administradora GanttPro", role: "ADMIN" },
  { key: "editor", email: "editor@ganttpro.local", name: "Editor de ejemplo", role: "EDITOR" },
  { key: "lector", email: "lector@ganttpro.local", name: "Lector de ejemplo", role: "VIEWER" },
] as const;
