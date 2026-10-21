// 가상 회의(fixtures/meetings) 읽기 + 에이전트 입력 만들기 (테스트·CLI 공용)
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { MeetingIn, ParticipantIn, SegmentIn } from "@/lib/agents/types";
import transcriptBaseline from "@agents/transcript/baseline";

export const STAFF: { name: string; role_label: string; team: "writer" | "pd" }[] = [
  { name: "한지수", role_label: "메인 작가", team: "writer" },
  { name: "오다은", role_label: "서브 작가", team: "writer" },
  { name: "이혜연", role_label: "막내 작가", team: "writer" },
  { name: "박준호", role_label: "메인 PD", team: "pd" },
  { name: "최민재", role_label: "서브 PD", team: "pd" },
  { name: "윤하람", role_label: "막내 PD", team: "pd" },
];

export type Gold = {
  decisions: { title: string; status: string; value: string | null; critical: boolean; evidence: string[] }[];
  actions: { task: string; assignee: string | null; due: string | null }[];
  not_actions: string[];
  uncertain: string[];
  idea_changes: { title: string; to: string; reason: string | null }[];
};

export type Fixture = { key: string; title: string; occurredAt: string; note: string; participants: string[]; transcript: string; gold: Gold };

const root = () => path.join(process.cwd(), "fixtures", "meetings");

export function listFixtures(): Fixture[] {
  return readdirSync(root(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map(loadFixture);
}

export function loadFixture(key: string): Fixture {
  const dir = path.join(root(), key);
  const meta = JSON.parse(readFileSync(path.join(dir, "meeting.json"), "utf8"));
  return {
    key,
    ...meta,
    transcript: readFileSync(path.join(dir, "transcript.txt"), "utf8"),
    gold: JSON.parse(readFileSync(path.join(dir, "gold.json"), "utf8")),
  };
}

export function meetingIn(f: Fixture): MeetingIn {
  const participants: ParticipantIn[] = f.participants.map((n, i) => {
    const s = STAFF.find((x) => x.name === n);
    return { key: `p${i + 1}`, name: n, role_label: s?.role_label ?? "참석자", team: s?.team ?? "external" };
  });
  return { title: f.title, occurred_at: f.occurredAt.slice(0, 16).replace("T", " "), participants };
}

export function segmentsOf(f: Fixture): SegmentIn[] {
  return transcriptBaseline({ meeting: meetingIn(f), raw_text: f.transcript }).segments;
}

export const msOf = (mmss: string) => {
  const [m, s] = mmss.split(":").map(Number);
  return (m * 60 + s) * 1000;
};

export { DEFAULT_TEMPLATE } from "@/lib/defaultTemplate";
