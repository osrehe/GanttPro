/**
 * @ganttpro/engine — motor de planificación de GanttPro.
 *
 * Módulo TypeScript puro: no depende de React, Next.js ni Prisma, para poder
 * probarse unitariamente y ejecutarse tanto en el servidor como en el navegador.
 */
export const ENGINE_VERSION = "0.3.0";

export * from "./dates";
export * from "./types";
export * from "./errors";
export * from "./calendar";
export * from "./cycles";
export * from "./wbs";
export * from "./schedule";
export * from "./cpm";
export * from "./resources";
export * from "./baseline";
export * from "./layout";
