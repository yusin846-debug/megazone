/** Isolated auth contract test. Creates a disposable SQLite database; never reads DATABASE_URL. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { DEMO_ACCOUNTS } from "../src/lib/demoAccounts";
import { createAuth } from "../src/lib/authServer";

async function main() {
const dir = await mkdtemp(join(tmpdir(), "egg-auth-test-"));
let client: PrismaClient | undefined;
try {
  await writeFile(join(dir, "package.json"), '{"name":"isolated-auth-test","private":true}');
  await symlink(resolve("node_modules"), join(dir, "node_modules"));
  const schema = (await readFile("prisma/schema.prisma", "utf8"))
    .replace('provider = "prisma-client-js"', `provider = "prisma-client-js"\n output = "${dir}/client"`)
    .replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"')
    .replace(/\s*directUrl\s*=\s*env\("DATABASE_URL_UNPOOLED"\)/, "")
    .replace(/\burl\s*=\s*env\("DATABASE_URL"\)/, `url = "file:${dir}/test.sqlite"`);
  await writeFile(join(dir, "schema.prisma"), schema);
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", join(dir, "schema.prisma")], { env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" }, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const generated = await import(pathToFileURL(join(dir, "client/index.js")).href);
  client = new generated.PrismaClient() as PrismaClient;
  const organization = await client.organization.create({ data: { name: "Isolated auth test" } });
  for (const sample of DEMO_ACCOUNTS) {
    const person = await client.user.create({ data: { organizationId: organization.id, authSubject: sample.subject, name: sample.name, title: sample.title } });
    const identityId = randomUUID();
    await client.authUser.create({ data: { id: identityId, name: sample.name, email: sample.email, emailVerified: true, appUserId: person.id } });
    await client.authAccount.create({ data: { id: randomUUID(), providerId: "credential", accountId: identityId, userId: identityId, password: await hashPassword(sample.password) } });
  }
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  process.env.BETTER_AUTH_URL = "http://localhost:3333";
  process.env.EGG_DEMO_LOGIN = "true";
  const auth = createAuth(client, "sqlite");
  const origin = "http://localhost:3333";
  const request = (path: string, body?: object, cookie = "", ip = "127.0.0.1", requestOrigin = origin) => auth.handler(new Request(`${origin}/api/auth${path}`, {
    method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: requestOrigin, "x-real-ip": ip, ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  const check = (name: string) => console.log(`PASS ${name}`);
  const bad = await request("/sign-in/email", { email: "lee@egg.test", password: "incorrect-password" });
  assert.equal(bad.status, 401); check("incorrect password rejected");
  assert.equal(await (await request("/get-session", undefined, "eg_user=forged-user-id")).json(), null); check("legacy identity cookie rejected");
  for (const sample of DEMO_ACCOUNTS) {
    const response = await request("/sign-in/email", { email: sample.email, password: sample.password, rememberMe: false });
    if (response.status !== 200) throw new Error(`Sign-in ${sample.subject}: ${response.status} ${await response.text()}`);
    const cookie = response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
    assert.ok(cookie.includes("session_token="));
    const session = await (await request("/get-session", undefined, cookie)).json();
    assert.equal(session.user.email, sample.email);
    assert.ok(session.user.appUserId);
    assert.ok(new Date(session.session.expiresAt).getTime() - Date.now() <= 24 * 60 * 60 * 1000);
    const tampered = cookie.replace(/(session_token=)[^;]+/, "$1tampered");
    assert.equal(await (await request("/get-session", undefined, tampered)).json(), null);
    await request("/sign-out", {}, cookie);
    assert.equal(await (await request("/get-session", undefined, cookie)).json(), null);
    check(`${sample.subject}: sign-in → mapped session → sign-out → replay rejected`);
  }
  const signup = await request("/sign-up/email", { name: "Uninvited", email: "uninvited@example.com", password: "NotARealPassword!26" });
  assert.ok(signup.status >= 400); assert.equal(await client.authUser.count(), 7); check("public signup blocked");
  const crossOrigin = await request("/sign-in/email", { email: "lee@egg.test", password: DEMO_ACCOUNTS[0].password }, "", "127.0.0.3", "https://untrusted.example");
  assert.equal(crossOrigin.status, 403); check("cross-origin credential submission rejected");
  process.env.EGG_DEMO_LOGIN = "false";
  const disabled = await request("/sign-in/email", { email: "lee@egg.test", password: DEMO_ACCOUNTS[0].password }, "", "127.0.0.4");
  assert.equal(disabled.status, 401); check("disabled PoC cannot create sessions");
  process.env.EGG_DEMO_LOGIN = "true";
  for (let i = 0; i < 10; i++) await request("/sign-in/email", { email: "no-user@egg.test", password: "invalid-password" }, "", "127.0.0.5");
  const limited = await request("/sign-in/email", { email: "no-user@egg.test", password: "invalid-password" }, "", "127.0.0.5");
  assert.equal(limited.status, 429); check("database-backed rate limit enforced");
  console.log("Auth integration passed (isolated SQLite; production PostgreSQL still requires deployed verification).");
} finally {
  await client?.$disconnect();
  await rm(dir, { recursive: true, force: true });
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
