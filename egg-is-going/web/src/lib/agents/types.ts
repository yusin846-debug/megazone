// 에이전트 입출력 계약 (agents/*/schema.json 과 같은 모양)
// 바꾸려면 팀 합의 → schema.json, 이 파일, baseline.ts, prompt.md 를 함께 고친다.

export type AgentName = "transcript" | "context" | "decision" | "compose" | "verify";

export type Evidence = { segment_id: string };

export type ParticipantIn = {
  key: string; // p1, p2 … (실행마다 회의 참석자 순서로 부여)
  name: string;
  role_label: string;
  team: "writer" | "pd" | "external";
};

export type MeetingIn = { title: string; occurred_at: string; participants: ParticipantIn[] };

export type SegmentIn = {
  segment_id: string; // seg_01
  start_ms: number;
  end_ms: number;
  speaker: string | null; // participant key
  text: string;
  uncertain: boolean;
};

// ───── 검증 결과 (A5 출력이자, 재처리 때 다른 에이전트에 주는 피드백) ─────
export type FindingType = "missing" | "conflict" | "added" | "unclear" | "format";
export type RouteTo = "context" | "decision" | "compose" | "human";
export type Finding = {
  type: FindingType;
  severity: "critical" | "normal";
  target: string;
  message: string;
  evidence: Evidence[];
  route_to: RouteTo;
};

// ───── A1 전사·화자 ─────
export type TranscriptInput = { meeting: MeetingIn; raw_text: string };
export type TranscriptOutput = {
  segments: SegmentIn[];
  uncertain_spans: { start_ms: number; end_ms: number; reason: string }[];
  unmatched_speakers: string[];
};

// ───── A2 제작 맥락 ─────
export type IdeaChange = { from: string | null; to: string; reason: string | null; evidence: Evidence[] };
export type Topic = { item_key: string; title: string; intent: string | null; idea_changes: IdeaChange[] };
export type ContextInput = { meeting: MeetingIn; segments: SegmentIn[]; feedback: Finding[] };
export type ContextOutput = { topics: Topic[] };

// ───── A3 결정·업무 ─────
export type ItemStatus = "proposed" | "confirmed" | "on_hold" | "dropped";
export type Decision = {
  item_key: string;
  title: string;
  status: ItemStatus;
  value: string | null;
  hold_reason: string | null;
  revisit: string | null;
  evidence: Evidence[];
  confidence: number;
};
export type ActionOut = {
  action_key: string;
  description: string;
  assignee: string | null; // participant key
  due_at: string | null; // 원문 표현 그대로 ("금요일", "내일")
  evidence: Evidence[];
};
export type HumanQuestion = {
  target: string; // d:t_guest.status · a:a_rental.assignee · a:a_studio.due_at
  kind: "item_status" | "action_due" | "action_assignee" | "other";
  question: string;
  evidence: Evidence[];
};
export type LockedState = {
  items: { item_key: string; title: string; status: ItemStatus; value: string | null }[];
  actions: { action_key: string; description: string; assignee: string | null; due_at: string | null }[];
};
export type DecisionInput = {
  meeting: MeetingIn;
  segments: SegmentIn[];
  topics: Topic[];
  locked: LockedState;
  feedback: Finding[];
};
export type DecisionOutput = { decisions: Decision[]; action_items: ActionOut[]; questions_for_human: HumanQuestion[] };

// ───── A4 문서 구성 ─────
export type FieldSource = "meta" | "confirmed" | "topic_changes" | "actions" | "on_hold" | "dropped";
export type TemplateField = {
  id: string;
  label: string;
  source: FieldSource;
  required: boolean;
  format: "paragraph" | "bullets" | "table";
  rule: string;
  columns: string[] | null;
};
export type TemplateRules = { name: string; version: number; fields: TemplateField[] };
export type Block = {
  type: "paragraph" | "bullet" | "row";
  text: string | null;
  cells: string[] | null;
  refs: string[]; // d:<item_key> · a:<action_key> · t:<item_key>
  flags: string[]; // missing_due · missing_assignee · changed · locked
};
export type Section = { field_id: string; label: string; blocks: Block[] };
export type ComposeInput = {
  meeting: MeetingIn & { program: string };
  template: TemplateRules;
  topics: Topic[];
  decisions: Decision[];
  action_items: ActionOut[];
  feedback: Finding[];
};
export type ComposeOutput = { sections: Section[]; unplaced: { ref: string; reason: string }[] };

// ───── A5 검증 ─────
export type VerifyInput = {
  meeting: MeetingIn;
  segments: SegmentIn[];
  topics: Topic[];
  decisions: Decision[];
  action_items: ActionOut[];
  document: ComposeOutput;
  human_confirmed: string[]; // 사람이 고정한 target — 다시 묻지 않는다
  format_issues: Finding[]; // 출력 도구의 규칙 검사 결과
};
export type VerifyOutput = { verdict: "pass" | "needs_fix" | "needs_human"; findings: Finding[] };

export type AgentIO = {
  transcript: [TranscriptInput, TranscriptOutput];
  context: [ContextInput, ContextOutput];
  decision: [DecisionInput, DecisionOutput];
  compose: [ComposeInput, ComposeOutput];
  verify: [VerifyInput, VerifyOutput];
};
export type In<N extends AgentName> = AgentIO[N][0];
export type Out<N extends AgentName> = AgentIO[N][1];

export const fmtMs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
};
