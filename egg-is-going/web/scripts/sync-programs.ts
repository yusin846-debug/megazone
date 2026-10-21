// Append-only reference catalog sync for this fictional demo. Never resets meetings.
import { PrismaClient } from "@prisma/client";
import { PROGRAM_CATALOG } from "../src/lib/programCatalog";
import { DEFAULT_TEMPLATE } from "../src/lib/defaultTemplate";
const db = new PrismaClient();
async function main() {
  const base = await db.program.findFirst({ where: { name: "달걀 한 판 여행기" }, include: { memberships: true } });
  if (!base) throw new Error("Run the initial demo seed first.");
  for (const entry of PROGRAM_CATALOG) {
    await db.$transaction(async tx => {
      const exists = await tx.program.findFirst({ where: { organizationId: base.organizationId, name: entry.name } });
      if (exists) return;
      await tx.program.create({ data: {
        organizationId: base.organizationId, name: entry.name,
        memberships: { create: base.memberships.map(m => ({ userId: m.userId, role: m.role })) },
        templates: { create: { name: DEFAULT_TEMPLATE.name, versions: { create: { version: DEFAULT_TEMPLATE.version, rulesJson: JSON.stringify({ fields: DEFAULT_TEMPLATE.fields }), outputFormat: "docx", status: "approved" } } } },
      } });
    });
  }
  console.log(`WORKS catalog synchronized: ${PROGRAM_CATALOG.length} reference programs. Existing data preserved.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
