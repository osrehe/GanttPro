import { downloadBlob } from "@/lib/download";

/**
 * Exportación PNG del Gantt visible (UC-28): compone un SVG autónomo con la tabla reducida
 * (dibujada como texto), la cabecera y la línea de tiempo tal como están en pantalla, con los
 * estilos calculados en línea (los `className` de Tailwind no existen fuera del documento), y lo
 * rasteriza en un canvas.
 */

export interface PngRow {
  readonly wbsCode: string;
  readonly name: string;
  readonly depth: number;
  readonly isSummary: boolean;
  readonly isMilestone: boolean;
}

export interface GanttPngInput {
  readonly headerSvg: SVGSVGElement;
  readonly timelineSvg: SVGSVGElement;
  readonly rows: readonly PngRow[];
  readonly rowHeight: number;
  readonly headerHeight: number;
  readonly leftWidth: number;
  readonly title: string;
  /** Factor de escala del raster (2 = retina). */
  readonly scale?: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "visibility",
  "color",
] as const;

/** Clona un SVG copiando los estilos calculados de cada elemento como atributos de presentación. */
export function cloneWithInlineStyles(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const originals = [source, ...Array.from(source.querySelectorAll("*"))];
  const clones = [clone, ...Array.from(clone.querySelectorAll("*"))];
  originals.forEach((original, i) => {
    const target = clones[i];
    if (!target || !(original instanceof Element)) return;
    const computed = getComputedStyle(original);
    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== "" && value !== "normal") target.setAttribute(prop, value);
    }
    target.removeAttribute("class");
  });
  return clone;
}

/** Construye el SVG autónomo (cadena serializada) con tabla + cabecera + línea de tiempo. */
export function buildGanttSvg(input: GanttPngInput): {
  svg: string;
  width: number;
  height: number;
} {
  const { rows, rowHeight, headerHeight, leftWidth } = input;
  const header = cloneWithInlineStyles(input.headerSvg);
  const timeline = cloneWithInlineStyles(input.timelineSvg);
  // Los elementos de previsualización del arrastre no se exportan.
  for (const el of Array.from(timeline.querySelectorAll('[visibility="hidden"]'))) el.remove();
  const axisWidth = Number(input.timelineSvg.getAttribute("width")) || 0;
  const width = leftWidth + axisWidth;
  const height = headerHeight + Math.max(rows.length, 1) * rowHeight;

  const root = document.createElementNS(SVG_NS, "svg");
  root.setAttribute("xmlns", SVG_NS);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  root.setAttribute("font-family", "Geist, Arial, Helvetica, sans-serif");

  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", "#ffffff");
  root.appendChild(background);

  // Tabla reducida: cabecera y filas.
  const table = document.createElementNS(SVG_NS, "g");
  const tableHeader = document.createElementNS(SVG_NS, "rect");
  tableHeader.setAttribute("width", String(leftWidth));
  tableHeader.setAttribute("height", String(headerHeight));
  tableHeader.setAttribute("fill", "#f3f4f6");
  table.appendChild(tableHeader);
  table.appendChild(text(8, headerHeight - 14, "WBS", { weight: "600", size: 11 }));
  table.appendChild(text(64, headerHeight - 14, "Nombre", { weight: "600", size: 11 }));
  rows.forEach((row, i) => {
    const y = headerHeight + i * rowHeight;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("x2", String(width));
    line.setAttribute("y1", String(y + rowHeight));
    line.setAttribute("y2", String(y + rowHeight));
    line.setAttribute("stroke", "#e5e7eb");
    table.appendChild(line);
    table.appendChild(text(8, y + rowHeight / 2 + 4, row.wbsCode, { size: 11, fill: "#6b7280" }));
    const label = row.isMilestone ? `◆ ${row.name}` : row.name;
    table.appendChild(
      text(64 + (row.depth - 1) * 14, y + rowHeight / 2 + 4, truncate(label, leftWidth - 80), {
        size: 11,
        weight: row.isSummary ? "600" : "400",
      }),
    );
  });
  const divider = document.createElementNS(SVG_NS, "line");
  divider.setAttribute("x1", String(leftWidth));
  divider.setAttribute("x2", String(leftWidth));
  divider.setAttribute("y1", "0");
  divider.setAttribute("y2", String(height));
  divider.setAttribute("stroke", "#d1d5db");
  table.appendChild(divider);
  root.appendChild(table);

  const headerGroup = document.createElementNS(SVG_NS, "g");
  headerGroup.setAttribute("transform", `translate(${leftWidth},0)`);
  headerGroup.appendChild(header);
  root.appendChild(headerGroup);

  const timelineGroup = document.createElementNS(SVG_NS, "g");
  timelineGroup.setAttribute("transform", `translate(${leftWidth},${headerHeight})`);
  timelineGroup.appendChild(timeline);
  root.appendChild(timelineGroup);

  const titleEl = document.createElementNS(SVG_NS, "title");
  titleEl.textContent = input.title;
  root.insertBefore(titleEl, root.firstChild);

  return { svg: new XMLSerializer().serializeToString(root), width, height };
}

/** Rasteriza el SVG en un PNG. */
export async function svgToPngBlob(
  svg: string,
  width: number,
  height: number,
  scale = 2,
): Promise<Blob> {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo rasterizar el Gantt"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("El navegador no permite dibujar en canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el PNG"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Exporta y descarga el Gantt visible como PNG. */
export async function exportGanttPng(input: GanttPngInput, filename: string): Promise<void> {
  const { svg, width, height } = buildGanttSvg(input);
  const blob = await svgToPngBlob(svg, width, height, input.scale ?? 2);
  downloadBlob(blob, filename);
}

function text(
  x: number,
  y: number,
  content: string,
  style: { size?: number; weight?: string; fill?: string } = {},
): SVGTextElement {
  const el = document.createElementNS(SVG_NS, "text");
  el.setAttribute("x", String(x));
  el.setAttribute("y", String(y));
  el.setAttribute("font-size", String(style.size ?? 11));
  el.setAttribute("font-weight", style.weight ?? "400");
  el.setAttribute("fill", style.fill ?? "#111827");
  el.textContent = content;
  return el;
}

function truncate(value: string, maxPx: number): string {
  const maxChars = Math.max(8, Math.floor(maxPx / 6.5));
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
}
