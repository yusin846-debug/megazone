// 가상 회의 5개와 정답지(gold.json)로 에이전트별 테스트(examples/*.input.json + *.check.json)를 만든다.
//   npm run agent:examples
// 직접 만든 테스트는 파일 이름을 `hand_` 로 시작하면 지우지 않는다.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ActionOut, ComposeOutput, Decision, Topic } from "@/lib/agents/types";
import composeBaseline from "@agents/compose/baseline";
import { DEFAULT_TEMPLATE, listFixtures, meetingIn, msOf, segmentsOf, type Fixture } from "./lib/fixtures";

type Check = Record<string, unknown>;
const out = (agent: string, name: string, input: unknown, checks: Check[], note: string) => {
  const dir = path.join(process.cwd(), "agents", agent, "examples");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.input.json`), JSON.stringify(input, null, 2) + "\n");
  writeFileSync(path.join(dir, `${name}.check.json`), JSON.stringify({ note, checks }, null, 2) + "\n");
};

for (const agent of ["transcript", "context", "decision", "compose", "verify"]) {
  const dir = path.join(process.cwd(), "agents", agent, "examples");
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (!f.startsWith("hand_")) rmSync(path.join(dir, f));
}

const fixtures = listFixtures();
const segIdAt = (f: Fixture, mmss: string) => segmentsOf(f).find((s) => s.start_ms === msOf(mmss))?.segment_id ?? "seg_??";
const keyOf = (f: Fixture, name: string | null) => (name ? meetingIn(f).participants.find((p) => p.name === name)?.key ?? null : null);

for (const f of fixtures) {
  const meeting = meetingIn(f);
  const segments = segmentsOf(f);
  const lines = f.transcript.split("\n").filter((l) => l.trim()).length;

  // A1 전사·화자
  out("transcript", f.key, { meeting, raw_text: f.transcript }, [
    { type: "count", path: "segments", min: lines, max: lines, label: `발언 ${lines}개를 모두 나눔` },
    ...f.gold.uncertain.map((t) => ({ type: "find", path: "segments", where: { start_ms: { eq: msOf(t) }, uncertain: { eq: true } }, label: `${t} 구간을 불확실로 표시` })),
    { type: "none", path: "segments", where: { speaker: "?" }, label: "화자를 '?' 문자열로 두지 않음" },
  ], f.note);

  // A2 제작 맥락
  out("context", f.key, { meeting, segments, feedback: [] }, [
    ...f.gold.idea_changes.map((c) => ({
      type: "find",
      path: "topics[].idea_changes",
      parentWhere: { title: c.title.split("|") },
      where: { to: c.to, reason: c.reason === null ? null : c.reason },
      label: `‘${c.title}’: → ${c.to} (${c.reason === null ? "이유 없음 → null" : `이유에 ‘${c.reason}’`})`,
    })),
    ...f.gold.not_actions.map((n) => ({ type: "none", path: "topics", where: { title: n }, label: `잡담 ‘${n}’을 안건으로 만들지 않음` })),
    { type: "evidence_valid", label: "모든 근거가 원문 발언 id" },
  ], f.note);

  // A3 결정·업무 (맥락 결과와 분리해서 시험하려고 topics는 비워 둔다)
  out("decision", f.key, { meeting, segments, topics: [], locked: { items: [], actions: [] }, feedback: [] }, [
    ...f.gold.decisions.map((d) => ({
      type: "find",
      path: "decisions",
      where: { title: d.title.split("|"), status: { eq: d.status }, ...(d.value ? { value: d.value } : {}) },
      label: `${d.critical ? "[중대] " : ""}‘${d.title}’ = ${d.status}${d.value ? ` (${d.value})` : ""}`,
      critical: d.critical,
    })),
    ...f.gold.actions.map((a) => ({
      type: "find",
      path: "action_items",
      where: { description: a.task, assignee: a.assignee ? { eq: keyOf(f, a.assignee) } : null, due_at: a.due === null ? null : a.due },
      label: `업무 ‘${a.task}’ · 담당 ${a.assignee ?? "null"} · 기한 ${a.due ?? "null"}`,
    })),
    ...f.gold.not_actions.map((n) => ({ type: "none", path: "action_items", where: { description: n }, label: `잡담 ‘${n}’은 업무가 아님` })),
    { type: "evidence_valid", label: "모든 근거가 원문 발언 id" },
  ], f.note);
}

// A4 문서 구성 · A5 검증 — 01_opening 정답으로 만든 입력
const f = fixtures.find((x) => x.key === "01_opening")!;
const meeting = meetingIn(f);
const segments = segmentsOf(f);
const slug: Record<string, string> = { 오프닝: "t_opening_location", 드론: "t_drone", 멘트: "t_opening_ment", 게스트: "t_guest" };
const decisions: Decision[] = f.gold.decisions.map((d) => ({
  item_key: slug[d.title] ?? `t_${d.title}`,
  title: { 오프닝: "오프닝 장소", 드론: "드론 촬영", 멘트: "오프닝 멘트 톤", 게스트: "게스트 섭외" }[d.title] ?? d.title,
  status: d.status as Decision["status"],
  value: d.title === "멘트" ? "밝은 여행 브이로그 톤" : d.value,
  hold_reason: d.status === "on_hold" ? "출연료 확인 필요" : null,
  revisit: d.status === "on_hold" ? "다음 주" : null,
  evidence: d.evidence.map((t) => ({ segment_id: segIdAt(f, t) })),
  confidence: 0.9,
}));
const topics: Topic[] = [
  {
    item_key: "t_opening_location",
    title: "오프닝 장소",
    intent: null,
    idea_changes: [
      { from: null, to: "야외(한강 공원)", reason: null, evidence: [{ segment_id: segIdAt(f, "00:12") }] },
      { from: "야외(한강 공원)", to: "실내", reason: "촬영일 오후 비 예보", evidence: [{ segment_id: segIdAt(f, "00:31") }, { segment_id: segIdAt(f, "00:48") }] },
      { from: "실내", to: "스튜디오", reason: null, evidence: [{ segment_id: segIdAt(f, "00:51") }] },
    ],
  },
];
const people = Object.fromEntries(meeting.participants.map((p) => [p.name, p.key]));
const actions: ActionOut[] = [
  { action_key: "a_studio", description: "스튜디오 대관 가능 여부 확인", assignee: people["최민재"], due_at: null, evidence: [{ segment_id: segIdAt(f, "01:20") }] },
  { action_key: "a_minutes", description: "회의록 공유", assignee: people["이혜연"], due_at: "오늘 오후", evidence: [{ segment_id: segIdAt(f, "03:41") }] },
  { action_key: "a_cuesheet", description: "큐시트 초안 작성", assignee: people["이혜연"], due_at: "금요일", evidence: [{ segment_id: segIdAt(f, "03:50") }] },
];
const composeInput = { meeting: { ...meeting, program: "달걀 한 판 여행기" }, template: DEFAULT_TEMPLATE, topics, decisions, action_items: actions, feedback: [] };
out("compose", "01_opening", composeInput, [
  { type: "sections_match_template", label: "템플릿 칸 6개를 순서대로 모두 만듦" },
  { type: "refs_cover", refs: decisions.map((d) => `d:${d.item_key}`).concat(actions.map((a) => `a:${a.action_key}`)), label: "결정 4개·업무 3개를 모두 배치 (버리지 않음)" },
  { type: "find", path: "sections[].blocks", parentWhere: { field_id: { eq: "actions" } }, where: { refs: "a_studio", flags: "missing_due" }, label: "기한 없는 ‘스튜디오 대관’에 missing_due 표시" },
  { type: "none", path: "sections[].blocks", where: { text: ["10월", "월요일", "화요일", "수요일", "목요일"] }, label: "원문에 없는 날짜를 만들지 않음" },
  { type: "no_unknown_refs", label: "입력에 없는 항목을 참조하지 않음" },
], "01_opening 정답 항목을 템플릿 v3에 배치");

const goodDoc: ComposeOutput = composeBaseline(composeInput);
const verifyBase = { meeting, segments, topics, decisions, action_items: actions, human_confirmed: [], format_issues: [] };
out("verify", "01_clean", { ...verifyBase, document: goodDoc }, [
  { type: "none", path: "findings", where: { type: { eq: "missing" } }, label: "정답 문서에 누락 경보 없음" },
  { type: "none", path: "findings", where: { type: { eq: "added" } }, label: "정답 문서에 추가 경보 없음" },
  { type: "find", path: "findings", where: { type: { eq: "unclear" }, target: "a_studio" }, label: "‘스튜디오 대관’ 기한 없음을 사람 확인으로 알림" },
  { type: "in", path: "verdict", values: ["pass", "needs_human"], label: "판정: 통과 또는 사람 확인" },
], "문제 없는 문서 (거짓 경보 시험)");
const noHold: ComposeOutput = { ...goodDoc, sections: goodDoc.sections.map((s) => (s.field_id === "pending" ? { ...s, blocks: [{ type: "paragraph", text: "해당 없음", cells: null, refs: [], flags: [] }] } : s)) };
out("verify", "01_missing_hold", { ...verifyBase, document: noHold }, [
  { type: "find", path: "findings", where: { type: { eq: "missing" }, target: "t_guest", severity: { eq: "critical" } }, label: "[중대] 보류 ‘게스트 섭외’ 누락을 찾음" },
  { type: "in", path: "verdict", values: ["needs_fix"], label: "판정: 수정 필요" },
], "보류 1건을 일부러 뺀 문서");
const added: ComposeOutput = { ...goodDoc, sections: goodDoc.sections.map((s) => (s.field_id === "decisions" ? { ...s, blocks: [...s.blocks, { type: "bullet", text: "엔딩은 불꽃놀이로 한다", cells: null, refs: ["d:t_fireworks"], flags: [] }] } : s)) };
out("verify", "01_added", { ...verifyBase, document: added }, [
  { type: "find", path: "findings", where: { type: { eq: "added" }, target: "fireworks" }, label: "[중대] 원문에 없는 ‘불꽃놀이’ 결정을 찾음" },
  { type: "in", path: "verdict", values: ["needs_fix"], label: "판정: 수정 필요" },
], "원문에 없는 결정을 일부러 넣은 문서");

console.log("examples written for", fixtures.length, "fixtures");
