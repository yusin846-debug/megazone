/** Append-only credentials for the existing fictional PoC crew. */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { DEMO_ACCOUNTS } from "../src/lib/demoAccounts";

const db = new PrismaClient();
async function main() {
  if (process.env.EGG_DEMO_LOGIN !== "true") { console.log("Demo credentials skipped (EGG_DEMO_LOGIN is not true)."); return; }
  const orgs = await db.organization.findMany({ where: { name: "에그이즈고잉 (가상 제작사)" } });
  if (orgs.length !== 1) throw new Error("Expected exactly one fictional PoC organization; no accounts were changed.");
  const people = await db.user.findMany({ where: { organizationId: orgs[0].id } });
  const targets = DEMO_ACCOUNTS.map(sample => {
    const person = people.find(p => p.authSubject === sample.subject && p.name === sample.name && p.title === sample.title);
    if (!person) throw new Error(`Missing fictional crew member: ${sample.subject}`);
    return { sample, person };
  });
  for (const { sample, person } of targets) {
    await db.$transaction(async tx => {
      const existing = await tx.authUser.findUnique({ where: { email: sample.email } });
      if (existing && existing.appUserId !== person.id) throw new Error(`Identity mapping conflict: ${sample.subject}`);
      const identity = existing ?? await tx.authUser.create({ data: { id: randomUUID(), email: sample.email, name: person.name, appUserId: person.id, emailVerified: true } });
      const account = await tx.authAccount.findUnique({ where: { providerId_accountId: { providerId: "credential", accountId: identity.id } } });
      if (!account) await tx.authAccount.create({ data: { id: randomUUID(), accountId: identity.id, providerId: "credential", userId: identity.id, password: await hashPassword(sample.password) } });
    }, { timeout: 20000 });
  }
  console.log(`Verified ${targets.length} fictional login identities; existing credentials were preserved.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Credential seed failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
