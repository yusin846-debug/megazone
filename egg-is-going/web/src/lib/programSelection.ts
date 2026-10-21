import { PROGRAM_CATALOG } from "./programCatalog";

type Program = { id: string; name: string };
const order = new Map(PROGRAM_CATALOG.map((p, i) => [p.name, i]));
export const programCookieKey = (userId: string) => `eg_program_${userId}`;

/** A remembered choice must still be a current membership. Catalog order is stable. */
export function resolveProgram(programs: Program[], remembered?: string, recent?: string) {
  return programs.find(p => p.id === remembered)
    ?? programs.find(p => p.id === recent)
    ?? [...programs].sort((a, b) => (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity) || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id))[0];
}
