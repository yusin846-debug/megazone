import test from "node:test";
import assert from "node:assert/strict";
import { programCookieKey, resolveProgram } from "../src/lib/programSelection";
const programs = [{id:"old",name:"서진이네 2"},{id:"latest",name:"맛따라 길따라 대명이따라"},{id:"sample",name:"달걀 한 판 여행기"}];
test("re-entry honors the member's saved program before recent meetings", () => {
  assert.equal(resolveProgram(programs,"old","latest")?.id,"old");
});
test("revoked or stale choices fall back to a recent authorized program", () => {
  assert.equal(resolveProgram(programs,"revoked","old")?.id,"old");
  assert.equal(resolveProgram(programs,"revoked","revoked")?.id,"latest");
});
test("first entry uses newest official catalog order regardless of DB result order", () => {
  assert.equal(resolveProgram([...programs].reverse())?.id,"latest");
  assert.equal(resolveProgram([]),undefined);
});
test("program memory is namespaced by user", () => {
  assert.notEqual(programCookieKey("writer"),programCookieKey("producer"));
});
