import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "./db";
import { programCookieKey, resolveProgram } from "./programSelection";

export const programsFor = cache((userId: string) => db.program.findMany({
  where: { memberships: { some: { userId } } }, orderBy: { name: "asc" },
  select: { id: true, name: true },
}));
export const activeProgram = cache(async (userId: string) => {
  const [programs, jar] = await Promise.all([programsFor(userId), cookies()]);
  const remembered = jar.get(programCookieKey(userId))?.value;
  const saved = programs.find(p => p.id === remembered);
  const recent = saved ? null : await db.meeting.findFirst({
    where: { createdById: userId, programId: { in: programs.map(p => p.id) } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { programId: true },
  });
  const p = resolveProgram(programs, remembered, recent?.programId);
  if (!p) notFound();
  return p;
});
