import ExcelJS from "exceljs";
import { TEMPLATE_COLUMNS } from "./columns";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A8A" },
};

type ExampleRow = [
  wbs: string,
  name: string,
  duration: number | "",
  start: Date | "",
  end: Date | "",
  milestone: string,
  progress: number,
  predecessors: string,
  resources: string,
  notes: string,
];

/**
 * Filas de ejemplo: jerarquía de 3 niveles, un hito, predecesoras con tipo y desfase, y una fila
 * (1.1) que deja Duración vacía para que se deduzca de Inicio y Fin (5 días hábiles).
 */
const EXAMPLE_ROWS: ExampleRow[] = [
  [
    "1",
    "Levantamiento",
    "",
    "",
    "",
    "No",
    0,
    "",
    "",
    "Tarea resumen: su duración y avance se calculan",
  ],
  [
    "1.1",
    "Entrevistas con usuarios",
    "",
    new Date(Date.UTC(2026, 9, 5)),
    new Date(Date.UTC(2026, 9, 9)),
    "No",
    100,
    "",
    "Ana Pérez",
    "Duración deducida de Inicio y Fin",
  ],
  ["1.2", "Documento de requisitos", 3, "", "", "No", 50, "1.1", "Ana Pérez", ""],
  ["2", "Diseño", "", "", "", "No", 0, "", "", ""],
  ["2.1", "Diseño aprobado", 0, "", "", "Sí", 0, "1.2FS+1d", "", "Hito"],
  ["3", "Construcción", 10, "", "", "No", 0, "1.2FS+2d; 2.1", "Equipo Desarrollo; Ana Pérez", ""],
];

/** Índices (1-based) de las columnas de la hoja Tareas según TEMPLATE_COLUMNS. */
const COL = Object.fromEntries(TEMPLATE_COLUMNS.map((c, i) => [c.key, i + 1])) as Record<
  (typeof TEMPLATE_COLUMNS)[number]["key"],
  number
>;

const EXAMPLE_RESOURCES: Array<[string, string, number, string, number]> = [
  ["Ana Pérez", "Persona", 2.5, "UF", 8],
  ["Equipo Desarrollo", "Equipo", 4, "UF", 8],
];

/** Plantilla Excel de importación con hojas Tareas, Recursos e Instrucciones (UC-28). */
export async function buildImportTemplate(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GanttPro";
  workbook.created = new Date();

  const tasks = workbook.addWorksheet("Tareas", { views: [{ state: "frozen", ySplit: 1 }] });
  tasks.columns = TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeader(tasks.getRow(1));
  for (const row of EXAMPLE_ROWS) tasks.addRow(row);
  tasks.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: TEMPLATE_COLUMNS.length },
  };
  const lastRow = Math.max(200, EXAMPLE_ROWS.length + 1);
  for (let r = 2; r <= lastRow; r++) {
    tasks.getCell(r, COL.duration).numFmt = "0";
    tasks.getCell(r, COL.start).numFmt = "dd-mm-yyyy";
    tasks.getCell(r, COL.end).numFmt = "dd-mm-yyyy";
    tasks.getCell(r, COL.progress).numFmt = "0";
    tasks.getCell(r, COL.milestone).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Sí,No"'],
      showErrorMessage: true,
      errorTitle: "Hito",
      error: "Indica Sí o No",
    };
  }

  const resources = workbook.addWorksheet("Recursos", { views: [{ state: "frozen", ySplit: 1 }] });
  resources.columns = [
    { header: "Nombre", key: "name", width: 28 },
    { header: "Tipo", key: "type", width: 12 },
    { header: "Tarifa", key: "rate", width: 10 },
    { header: "Moneda", key: "currency", width: 10 },
    { header: "Capacidad (h/día)", key: "capacity", width: 18 },
  ];
  styleHeader(resources.getRow(1));
  for (const row of EXAMPLE_RESOURCES) resources.addRow(row);
  for (let r = 2; r <= 200; r++) {
    resources.getCell(r, 2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Persona,Equipo,Material"'],
    };
    resources.getCell(r, 4).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"UF,CLP"'],
    };
  }

  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [
    { header: "Columna", key: "column", width: 20 },
    { header: "Descripción", key: "description", width: 110 },
  ];
  styleHeader(help.getRow(1));
  for (const c of TEMPLATE_COLUMNS) help.addRow([c.header, c.description]);
  help.addRow([]);
  help.addRow([
    "Hoja Recursos",
    "Opcional. Declara nombre, tipo (Persona, Equipo, Material), tarifa, moneda (UF o CLP) y capacidad diaria. Los recursos nombrados en Tareas y no declarados se crean como Persona con tarifa 0.",
  ]);
  help.addRow([
    "Jerarquía",
    'La columna WBS define la estructura: 1.1 y 1.2 son subtareas de 1. Toda subtarea necesita su fila padre. Si no usas WBS, puedes agregar una columna "Nivel" (1, 2, 3…).',
  ]);
  help.addRow([
    "Predecesoras",
    'Referencian el WBS de otra fila. "3" equivale a "3FS" (fin a inicio). Desfase en días hábiles: "3FS+2d" o "3SS-1d". No se admiten dependencias sobre tareas resumen ni ciclos.',
  ]);
  help.addRow([
    "Fechas",
    'Deja Inicio vacío para que GanttPro programe la tarea lo antes posible según sus predecesoras y el inicio del proyecto. Una fecha indica "no empezar antes de". Fin es opcional: con Duración vacía, la duración se deduce contando días hábiles (lunes a viernes) entre Inicio y Fin.',
  ]);
  help.addRow([
    "Filas de ejemplo",
    "Puedes borrarlas o sobrescribirlas. Las columnas adicionales que agregues se ignoran.",
  ]);
  help.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  return workbook;
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
  row.height = 20;
}
