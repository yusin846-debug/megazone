import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "./db";

export const programsFor = cache((userId: string) => db.program.findMany({
  where: { memberships: { some: { userId } } }, orderBy: { name: "asc" },
  select: { id: true, name: true },
}));
export const activeProgram = cache(async (userId: string) => {
  const [programs, jar] = await Promise.all([programsFor(userId), cookies()]);
  const p = programs.find(p => p.id === jar.get("eg_program")?.value) ?? programs.find(p => p.name === "달걀 한 판 여행기") ?? programs[0];
  if (!p) notFound();
  return p;
});
