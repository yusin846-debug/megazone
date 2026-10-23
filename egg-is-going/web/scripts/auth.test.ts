import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { DEMO_ACCOUNTS, demoAccountFor } from "../src/lib/demoAccounts";

test("each fictional role has a distinct login and a nontrivial demo password", () => {
  assert.equal(DEMO_ACCOUNTS.length, 7);
  assert.equal(new Set(DEMO_ACCOUNTS.map(a => a.email)).size, 7);
  assert.equal(new Set(DEMO_ACCOUNTS.map(a => a.password)).size, 7);
  for (const a of DEMO_ACCOUNTS) { assert.ok(a.email.endsWith("@egg.test")); assert.ok(a.password.length >= 10); }
  assert.equal(demoAccountFor("lee")?.name, "이혜연");
  assert.equal(demoAccountFor("someone-else"), undefined);
});

test("library hashes verify the supplied password and reject incorrect input", async () => {
  const password = DEMO_ACCOUNTS[0].password;
  const hash = await hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword({ hash, password }), true);
  assert.equal(await verifyPassword({ hash, password: "wrong-password" }), false);
});
