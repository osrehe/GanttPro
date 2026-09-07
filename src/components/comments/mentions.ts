import type { MemberDto } from "@/lib/dto";

/**
 * Utilidades puras del editor de menciones: detectar el `@` que se está escribiendo, insertar el
 * nombre elegido y resolver qué miembros quedaron mencionados en el texto final (UC-35).
 */

export interface MentionQuery {
  /** Texto escrito después del `@` (sin el `@`). */
  readonly term: string;
  /** Posición del `@` en el texto. */
  readonly start: number;
}

/** Mención en curso justo antes del cursor, o nula si no se está escribiendo una. */
export function activeMention(text: string, caret: number): MentionQuery | null {
  const upToCaret = text.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at === -1) return null;
  const before = at === 0 ? " " : upToCaret[at - 1];
  if (before !== undefined && before !== " " && before !== "\n") return null;
  const term = upToCaret.slice(at + 1);
  // Un nombre puede tener un espacio ("Ana Pérez"), pero no un salto de línea ni dos espacios.
  if (term.includes("\n") || term.includes("  ")) return null;
  if (term.length > 40) return null;
  return { term, start: at };
}

/** Miembros que coinciden con el término, ordenados como vienen del proyecto. */
export function matchMembers(members: readonly MemberDto[], term: string): MemberDto[] {
  const needle = normalize(term);
  if (needle === "") return [...members].slice(0, 6);
  return members.filter((m) => normalize(m.name).includes(needle)).slice(0, 6);
}

/** Reemplaza la mención en curso por `@Nombre ` y devuelve el texto y la nueva posición del cursor. */
export function insertMention(
  text: string,
  mention: MentionQuery,
  caret: number,
  member: MemberDto,
): { text: string; caret: number } {
  const inserted = `@${member.name} `;
  const next = text.slice(0, mention.start) + inserted + text.slice(caret);
  return { text: next, caret: mention.start + inserted.length };
}

/** Ids de los miembros cuyo nombre aparece como `@Nombre` en el texto. */
export function mentionedIds(text: string, members: readonly MemberDto[]): string[] {
  const found: string[] = [];
  for (const member of members) {
    if (text.includes(`@${member.name}`) && !found.includes(member.userId))
      found.push(member.userId);
  }
  return found;
}

/** Divide el cuerpo en fragmentos de texto y menciones para resaltarlas al mostrarlas. */
export function splitMentions(
  body: string,
  names: readonly string[],
): Array<{ text: string; isMention: boolean }> {
  if (names.length === 0) return [{ text: body, isMention: false }];
  // Nombres más largos primero para que "Ana Pérez" gane sobre "Ana".
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const parts: Array<{ text: string; isMention: boolean }> = [];
  let rest = body;
  while (rest.length > 0) {
    let bestIndex = -1;
    let bestName = "";
    for (const name of sorted) {
      const index = rest.indexOf(`@${name}`);
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
        bestName = name;
      }
    }
    if (bestIndex === -1) {
      parts.push({ text: rest, isMention: false });
      break;
    }
    if (bestIndex > 0) parts.push({ text: rest.slice(0, bestIndex), isMention: false });
    parts.push({ text: `@${bestName}`, isMention: true });
    rest = rest.slice(bestIndex + bestName.length + 1);
  }
  return parts;
}

/** Tiempo relativo en español: "hace unos segundos", "hace 5 minutos", "hace 2 días". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "hace unos segundos";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "hace 1 minuto" : `hace ${minutes} minutos`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "hace 1 día" : `hace ${days} días`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
  const years = Math.round(months / 12);
  return years === 1 ? "hace 1 año" : `hace ${years} años`;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
