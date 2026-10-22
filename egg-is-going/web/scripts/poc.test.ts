import test from "node:test";
import assert from "node:assert/strict";
import { POC_MEETINGS, POC_PROGRAM, pocDate } from "../src/lib/poc/daemyeong";
import { pocDocument } from "../src/lib/poc/documents";
import { loginProgramFor, resolveProgram } from "../src/lib/programSelection";
import { demoItems } from "../src/lib/integrations/demo";
import { DEFAULT_TEMPLATE } from "../src/lib/defaultTemplate";
import { formatCheck, renderDocx } from "../src/lib/render/docx";
import type { MeetingIn, SegmentIn } from "../src/lib/agents/types";

const anchor = "2026-10-22";
const names = new Map([["han", "한지수"], ["oh", "오다은"], ["lee", "이혜연"], ["park", "박준호"], ["choi", "최민재"], ["yoon", "윤하람"]]);

test("Lee signs into an authorized PoC even with a previous selection; other accounts keep their memory", () => {
  const programs = [{ id: "poc", name: POC_PROGRAM }, { id: "old", name: "2026 유튜브 심포지엄" }];
  assert.equal(loginProgramFor(programs, "lee")?.id, "poc");
  assert.equal(loginProgramFor(programs.filter(p => p.id !== "poc"), "lee"), undefined);
  assert.equal(loginProgramFor(programs, "oh"), undefined);
  assert.equal(resolveProgram(programs, "old")?.id, "old");
});

test("the story has five past meetings, two future events and distinct document states", () => {
  const past = POC_MEETINGS.filter(m => m.state !== "scheduled");
  assert.equal(past.length, 5);
  assert.equal(past.filter(m => m.state === "approved").length, 2);
  assert.equal(past.filter(m => m.state === "in_review").length, 1);
  assert.equal(past.filter(m => m.state === "waiting").length, 1);
  assert.equal(past.filter(m => m.state === "draft").length, 1);
  assert.equal(POC_MEETINGS.filter(m => m.state === "scheduled").length, 2);
  assert.equal(new Set(POC_MEETINGS.map(m => m.key)).size, POC_MEETINGS.length);
});

test("every decision, task and action resolves to an actual speaker and source passage", () => {
  for (const m of POC_MEETINGS.filter(m => m.state !== "scheduled")) {
    for (const l of m.lines) assert.ok(names.has(l.who));
    const keySet = new Set([...m.decisions.map(d => `d:${d.key}.status`), ...m.actions.flatMap(a => [`a:${a.key}.due_at`, `a:${a.key}.assignee`])]);
    for (const x of [...m.decisions, ...m.actions, ...(m.questions ?? [])]) {
      assert.ok(x.evidence.length);
      for (const n of x.evidence) assert.ok(n > 0 && n <= m.lines.length, `${m.key} evidence ${n}`);
    }
    for (const q of m.questions ?? []) assert.ok(keySet.has(q.target));
    for (const a of m.actions) {
      if (a.who) assert.ok(names.has(a.who));
      if (a.dueDay !== null) assert.ok(a.dueDay >= m.day);
    }
  }
  const waiting = POC_MEETINGS.find(m => m.state === "waiting")!;
  assert.deepEqual(new Set(waiting.questions!.map(q => q.kind)), new Set(["item_status", "action_due", "action_assignee"]));
  assert.equal(waiting.actions.find(a => a.key === "a_consent")!.dueDay, null);
  assert.equal(waiting.actions.find(a => a.key === "a_radio")!.who, null);
  assert.equal(waiting.decisions.find(d => d.key === "t_outdoor")!.status, "proposed");
});

test("all generated meeting minutes pass the production template check and export as DOCX", async () => {
  for (const m of POC_MEETINGS.filter(m => m.state !== "scheduled")) {
    const meeting: MeetingIn = { title: m.title, occurred_at: pocDate(anchor, m.day, m.time).toISOString(), participants: [...names].map(([key, name]) => ({ key, name, role_label: "제작팀", team: "writer" })) };
    const segments: SegmentIn[] = m.lines.map((l, i) => ({ segment_id: `seg_${String(i + 1).padStart(2, "0")}`, start_ms: i * 40000, end_ms: i * 40000 + 35000, speaker: l.who, text: l.text, uncertain: false }));
    const doc = pocDocument(m, anchor, meeting, segments, names);
    assert.deepEqual(formatCheck(doc, DEFAULT_TEMPLATE, meeting), []);
    const bytes = await renderDocx({ program: POC_PROGRAM, templateLabel: "제작회의록 v3", docVersion: 1, meeting, tpl: DEFAULT_TEMPLATE, doc, segments });
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    assert.ok(bytes.length > 3000);
    if (m.state === "waiting") {
      const actions = doc.sections.find(s => s.field_id === "actions")!.blocks;
      assert.ok(actions.some(b => b.flags.includes("missing_due") && b.cells!.includes("미정")));
      assert.ok(actions.some(b => b.flags.includes("missing_assignee") && b.cells!.includes("미정")));
      assert.ok(!doc.sections.find(s => s.field_id === "decisions")!.blocks.some(b => b.refs.includes("d:t_outdoor")));
    }
  }
});

test("PoC calendar events prefill the exact title and Seoul time without duplicating registered records", () => {
  const events = demoItems(POC_PROGRAM, new Date("2026-10-21T16:00:00Z")); // Oct 22 in Seoul
  const calendar = events.filter(i => i.source === "calendar");
  assert.equal(calendar.length, 2);
  for (const item of calendar) {
    const url = new URL(item.prepareUrl!, "https://example.test");
    assert.equal(url.pathname, "/meetings/new");
    assert.equal(url.searchParams.get("title"), item.title);
    assert.equal(new Date(`${url.searchParams.get("at")}:00+09:00`).toISOString(), new Date(item.time).toISOString());
  }
  assert.ok(events.some(i => i.source === "gmail" && i.description.includes("알레르기")));
  assert.ok(events.some(i => i.source === "slack" && i.description.includes("무전기")));
  assert.ok(!demoItems("서진이네", new Date()).some(i => i.id.startsWith("poc-")));
});

test("Seoul calendar offsets cross month boundaries and reject invalid seed dates", () => {
  assert.equal(pocDate("2026-10-31", 1).toISOString(), "2026-11-01T01:00:00.000Z");
  assert.throws(() => pocDate("2026-02-30", 0));
});
