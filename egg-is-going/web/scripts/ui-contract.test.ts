import test from "node:test";
import assert from "node:assert/strict";
import { validateTemplateFields } from "../src/lib/templateValidation";
import { DEFAULT_TEMPLATE } from "../src/lib/defaultTemplate";
import { PROGRAM_CATALOG } from "../src/lib/programCatalog";
import { demoItems } from "../src/lib/integrations/demo";
test("approved template remains valid",()=>assert.equal(validateTemplateFields(DEFAULT_TEMPLATE.fields).length,6));
test("invalid and duplicate field contracts cannot be saved",()=>{
  const field=DEFAULT_TEMPLATE.fields[0];
  assert.throws(()=>validateTemplateFields([field,field]));
  assert.throws(()=>validateTemplateFields([{...field,source:"invented"}]));
  assert.throws(()=>validateTemplateFields([{...field,format:"table",columns:["담당","담당"]}]));
  assert.throws(()=>validateTemplateFields([{...field,required:"false"}]));
});
test("catalog imports exactly 72 distinct official entries across eight years",()=>{
  assert.equal(PROGRAM_CATALOG.length,72);assert.equal(new Set(PROGRAM_CATALOG.map(p=>p.name)).size,72);assert.equal(new Set(PROGRAM_CATALOG.map(p=>p.year)).size,8);
});
test("schedule prefill stays on the next Korean calendar day across UTC boundary",()=>{
  const items=demoItems("테스트 & 회의",new Date("2026-10-21T23:45:00Z"));
  assert.equal(items[0].time,"2026-10-23T10:00:00+09:00");
  const params=new URL(items[0].prepareUrl!,"https://example.test").searchParams;
  assert.equal(params.get("at"),"2026-10-23T10:00");assert.equal(params.get("title"),"테스트 & 회의 구성 회의");
});
