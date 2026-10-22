import { PROGRAM_CATALOG } from "./programCatalog";
import { POC_LOGIN_SUBJECT, POC_PROGRAM } from "./poc/daemyeong";

type Program = { id: string; name: string };
const order = new Map(PROGRAM_CATALOG.map((p, i) => [p.name, i]));
export const programCookieKey = (userId: string) => `eg_program_${userId}`;

/** This demo presenter always enters the prepared PoC workspace on sign-in. */
export function loginProgramFor(programs: Program[], authSubject: string) {
  return authSubject === POC_LOGIN_SUBJECT ? programs.find(p => p.name === POC_PROGRAM) : undefined;
}

/** A remembered choice must still be a current membership. Catalog order is stable. */
export function resolveProgram(programs: Program[], remembered?: string, recent?: string) {
  return programs.find(p => p.id === remembered)
    ?? programs.find(p => p.id === recent)
    ?? [...programs].sort((a, b) => (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity) || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id))[0];
}
